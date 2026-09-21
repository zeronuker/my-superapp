import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Map as MaplibreMap, Marker, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getRoleStyle } from '../utils/metarSeverity'
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import OfflineCoastlineMap from './OfflineCoastlineMap'

// MapLibre builds its worker's own URL from a dynamic template literal
// (`./${t}`), which no bundler can statically resolve into a real emitted
// asset — in dev it 404s, in production Vercel's SPA rewrite serves
// index.html for that missing path instead, and the worker never loads
// (tiles never parse, the map hangs on "Loading map…" forever with no
// error). The worker file itself also does a plain `import` of a sibling
// maplibre-gl-shared.mjs, so it can't just be pulled in via `?url` either —
// that drops the sibling and hits the same "missing file" failure one
// layer deeper. Both files are copied unhashed, side by side, by
// vite-plugin-static-copy (see vite.config.js) so that import keeps
// resolving, and setWorkerUrl points MapLibre at the copy directly.
setWorkerUrl('/maplibre-gl/maplibre-gl-worker.mjs')

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY

const STYLE_IDS = {
  dark: 'dark-matter-gl-style',
}

function styleUrl(styleId) {
  const base = `https://basemaps.cartocdn.com/gl/${styleId}/style.json`
  // CARTO now requires a key on every basemap request (this used to be
  // optional for vector styles). Their query param is `key`, not `api_key`.
  return CARTO_KEY ? `${base}?key=${CARTO_KEY}` : base
}

// Module-level (not component state) so switching basemap tabs remembers
// which ones already loaded successfully — persisted to localStorage (not
// just this session) because the tiles themselves outlive the session too
// (Workbox CacheFirst, see vite.config.js). Without persisting this flag,
// reopening the app offline would block a style whose tiles are still
// sitting in the cache, just because nothing loaded it yet THIS session.
const LOADED_STYLES_KEY = 'cb-carto-loaded-styles'
function readLoadedStyles() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOADED_STYLES_KEY)) || [])
  } catch {
    return new Set()
  }
}
const loadedStyles = readLoadedStyles()
export function hasCartoLoadedBefore(styleKey) {
  return loadedStyles.has(styleKey)
}
function markStyleLoaded(styleKey) {
  loadedStyles.add(styleKey)
  try {
    localStorage.setItem(LOADED_STYLES_KEY, JSON.stringify([...loadedStyles]))
  } catch {}
}

function routeGeoJSON(markers) {
  if (markers.length < 2) return null
  const [dep, arr] = markers
  const coords = []
  for (let i = 0; i <= 24; i++) {
    const p = interpolateGreatCircle(dep.lat, dep.lng, arr.lat, arr.lng, i / 24)
    coords.push([p.lng, p.lat])
  }
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
}

function makeMarkerEl(m) {
  const role = getRoleStyle(m.label)
  const size = m.big ? 14 : 10
  const el = document.createElement('div')
  el.style.cssText = 'display:flex; flex-direction:column; align-items:center; pointer-events:none;'
  el.innerHTML = `
    <div style="font-family:var(--cb-font-mono); font-size:10px; font-weight:${m.big ? 700 : 500};
      color:${role.color}; text-shadow:0 0 3px var(--cp-bg3), 0 0 3px var(--cp-bg3); margin-bottom:2px; white-space:nowrap;">
      ${m.icao}
    </div>
    <div style="width:${size}px; height:${size}px; border-radius:50%; background:${role.color}; border:2px solid var(--cp-bg3);"></div>
  `
  return el
}

// The airport dots + ICAO labels are MapLibre `Marker`s — plain DOM elements
// CSS-positioned on top of the canvas, not drawn into it — so a canvas
// snapshot (see getSnapshot below) never captures them. Redraws the same
// markers onto a copy of that snapshot using Canvas 2D, mirroring
// makeMarkerEl's look closely enough for a static fallback image.
function drawMarkersOnSnapshot(map, baseCanvas, markers) {
  const out = document.createElement('canvas')
  out.width = baseCanvas.width
  out.height = baseCanvas.height
  const ctx = out.getContext('2d')
  ctx.drawImage(baseCanvas, 0, 0)

  const dpr = out.width / map.getContainer().clientWidth
  for (const m of markers) {
    const role = getRoleStyle(m.label)
    const { x, y } = map.project([m.lng, m.lat])
    const px = x * dpr, py = y * dpr
    const r = (m.big ? 7 : 5) * dpr

    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = role.color
    ctx.fill()
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = '#0a1020'
    ctx.stroke()

    ctx.font = `${m.big ? 700 : 500} ${10 * dpr}px monospace`
    ctx.textAlign = 'center'
    ctx.lineWidth = 3 * dpr
    ctx.strokeStyle = 'rgba(10,16,32,0.9)'
    ctx.strokeText(m.icao, px, py - r - 4 * dpr)
    ctx.fillStyle = role.color
    ctx.fillText(m.icao, px, py - r - 4 * dpr)
  }
  return out
}

const CartoRouteMap = forwardRef(function CartoRouteMap({ markers, styleKey, isOffline, mapSnapshot }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  // pending | accepted | declined — only relevant once status === 'error'
  // AND there's no saved snapshot to show instead. "accepted" swaps in the
  // offline coastline fallback; "declined" just stops asking and leaves the
  // plain "unavailable" message up.
  const [fallbackChoice, setFallbackChoice] = useState('pending')

  // Exposed to BriefingView so Save Briefing can grab a still of whatever
  // this route currently looks like — the saved offline fallback for next
  // time (see saveBriefing in calculatorStore.js). Only meaningful once the
  // map has actually finished loading a view.
  //
  // Without preserveDrawingBuffer, WebGL clears the canvas right after each
  // frame paints, so a snapshot taken at an arbitrary later moment reads
  // blank. Forcing preserveDrawingBuffer on the live map fixes that but
  // roughly doubles its GPU memory use — fine on desktop, but silently
  // hangs the map forever on iPad (no error event, just never finishes
  // loading). Reading the canvas synchronously inside the 'render' event
  // instead — before the browser gets a chance to clear it — gets the same
  // still without that cost.
  useImperativeHandle(ref, () => ({
    getSnapshot: () => new Promise((resolve) => {
      const map = mapRef.current
      if (status !== 'ready' || !map) { resolve(null); return }
      map.once('render', () => {
        const withMarkers = drawMarkersOnSnapshot(map, map.getCanvas(), markers)
        resolve(withMarkers.toDataURL('image/jpeg', 0.72))
      })
      map.triggerRepaint()
    }),
  }), [status, markers])

  // Re-create the map whenever the basemap style changes — MapLibre's own
  // setStyle() tears down every custom source/layer, so a full teardown +
  // rebuild here is simpler than re-adding everything after a style swap.
  useEffect(() => {
    // Offline with this style never loaded this session, nothing it needs is
    // cached, so building the map can only fire doomed requests — which on
    // iOS pop the system "Turn Off Airplane Mode" alert. Go straight to the
    // error state, which already offers the offline coastline map instead.
    if (!navigator.onLine && !loadedStyles.has(styleKey)) { setStatus('error'); return }
    let stale = false
    let loaded = false
    setStatus('loading')
    setFallbackChoice('pending')
    const map = new MaplibreMap({
      container: containerRef.current,
      style: styleUrl(STYLE_IDS[styleKey]),
      center: [0, 20],
      zoom: 2,
    })
    mapRef.current = map

    // The style itself loading before (loadedStyles) doesn't mean THIS
    // route's tiles are cached — a different route covers different ground.
    // Offline + never-cached tile requests don't fail fast, they hang (the
    // same "doomed request" behavior called out above), so 'load' can just
    // never fire. Bound the wait so that still reaches the offline fallback
    // instead of leaving "Loading map…" up forever.
    const timeoutId = navigator.onLine ? null : setTimeout(() => {
      if (stale || loaded) return
      setStatus('error')
    }, 8000)

    // Guard against this map's own 'load' still firing after a fast tab
    // switch already started tearing it down — without it, the stale
    // callback flips status to 'ready' while mapRef now points at the NEXT
    // (still-loading) map, and the marker/route effect below then calls
    // addSource on a style that isn't loaded yet, crashing the component.
    map.on('load', () => {
      if (stale) return
      loaded = true
      clearTimeout(timeoutId)
      markStyleLoaded(styleKey)
      setStatus('ready')
    })
    // Only a failure BEFORE the map ever finished loading counts as fatal.
    // MapLibre also fires 'error' for a single failed tile request (e.g.
    // panning/zooming into an area never cached, while offline) — once the
    // map has already shown a good view, that shouldn't hide everything
    // behind the "unavailable" cover; the already-rendered tiles just stay
    // as they are and the new one is left blank.
    map.on('error', () => {
      if (stale || loaded) return
      clearTimeout(timeoutId)
      setStatus('error')
    })

    return () => {
      stale = true
      clearTimeout(timeoutId)
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [styleKey])

  // Freeze all gestures while offline so a pan/zoom/rotate can't ask for a
  // tile that was never cached in the first place. Re-enabled the moment
  // connectivity returns.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const handlers = [map.dragPan, map.scrollZoom, map.dragRotate, map.touchZoomRotate, map.doubleClickZoom, map.keyboard, map.boxZoom, map.touchPitch]
    handlers.forEach(h => (isOffline ? h.disable() : h.enable()))
  }, [isOffline, status])

  // Draw the route line + airport markers, and fit bounds, once the map is ready.
  useEffect(() => {
    const map = mapRef.current
    // `markers` is a fresh array reference on every BriefingView render, so a
    // fast tab switch can re-fire this effect in the same commit as the
    // style-swap effect above — before React applies its pending
    // setStatus('loading'). At that instant `status` (from this closure) is
    // still the OLD 'ready' value, but mapRef already points at the NEW,
    // not-yet-loaded map. Checking the map's own isStyleLoaded() (ground
    // truth) instead of trusting `status` avoids calling addSource on a
    // style that isn't ready, which throws.
    if (status !== 'ready' || !map || !map.isStyleLoaded()) return

    markersRef.current.forEach(mk => mk.remove())
    markersRef.current = markers.map(m =>
      new Marker({ element: makeMarkerEl(m), anchor: 'bottom' })
        .setLngLat([m.lng, m.lat])
        .addTo(map)
    )

    const geo = routeGeoJSON(markers)
    if (map.getLayer('route-line')) map.removeLayer('route-line')
    if (map.getSource('route')) map.removeSource('route')
    if (geo) {
      map.addSource('route', { type: 'geojson', data: geo })
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': '#e8ecf5', 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': 0.85 },
      })
    }

    const bounds = markers.reduce(
      (b, m) => b.extend([m.lng, m.lat]),
      new LngLatBounds([markers[0].lng, markers[0].lat], [markers[0].lng, markers[0].lat])
    )
    map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 0 })
  }, [status, markers])

  const buttonStyle = {
    fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
    color: 'var(--cp-txt)', background: 'var(--cp-bg3)', border: '1px solid var(--cp-border3)',
    borderRadius: 5, padding: '5px 10px', cursor: 'pointer',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {status === 'ready' && isOffline && (
        <div style={{
          position: 'absolute', top: 10, right: 10, pointerEvents: 'none',
          background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
          fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
          color: 'var(--cp-yellow)',
        }}>
          Offline — map frozen
        </div>
      )}

      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', background: 'var(--cp-bg3)', pointerEvents: 'none',
        }}>
          Loading map…
        </div>
      )}

      {status === 'error' && mapSnapshot && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src={mapSnapshot} alt="Saved route map" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', top: 10, right: 10, pointerEvents: 'none',
            background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
            border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
            fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
            color: 'var(--cp-yellow)',
          }}>
            Offline — saved snapshot
          </div>
        </div>
      )}

      {status === 'error' && !mapSnapshot && fallbackChoice === 'accepted' && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <OfflineCoastlineMap markers={markers} />
        </div>
      )}

      {status === 'error' && !mapSnapshot && fallbackChoice !== 'accepted' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 10,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', background: 'var(--cp-bg3)',
        }}>
          <div>{isOffline ? 'Unavailable offline — never loaded this session' : 'Map unavailable'}</div>
          {fallbackChoice === 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Show offline map instead?</span>
              <button onClick={() => setFallbackChoice('accepted')} style={buttonStyle}>Yes</button>
              <button onClick={() => setFallbackChoice('declined')} style={buttonStyle}>No</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default CartoRouteMap
