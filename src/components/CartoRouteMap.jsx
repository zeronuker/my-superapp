import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Map as MaplibreMap, Marker, Popup, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getRoleStyle } from '../utils/metarSeverity'
import { sigmetsToGeoJSON, hazardColor, fmtHazard } from '../utils/sigmet'
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import { routeLineCoords } from '../utils/routeLine'
import { placeLabels } from '../utils/labelLayout'
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
  light: 'voyager-gl-style',
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

// `routeLine` ({ points }, from a pasted route) draws through its fixes; without
// it, the dashed direct line between departure and arrival.
function routeGeoJSON(markers, routeLine) {
  if (routeLine) return { type: 'Feature', geometry: { type: 'LineString', coordinates: routeLineCoords(routeLine.points) } }
  if (markers.length < 2) return null
  const [dep, arr] = markers
  const coords = []
  for (let i = 0; i <= 24; i++) {
    const p = interpolateGreatCircle(dep.lat, dep.lng, arr.lat, arr.lng, i / 24)
    coords.push([p.lng, p.lat])
  }
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
}

// MapLibre paint values can't use CSS variables — resolve `var(--x)` to its colour.
function cssColor(v) {
  const m = /^var\((--[\w-]+)\)$/.exec(v)
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#888' : v
}

// Tap-a-zone popup. Built with textContent (the feed's text is external) and
// explicit dark text, since MapLibre's popup background is white.
function sigmetPopupEl(features) {
  const el = document.createElement('div')
  el.style.cssText = 'font-family:var(--cb-font-mono); font-size:11px; line-height:1.5; color:#0a1020; max-height:180px; overflow-y:auto;'
  features.forEach((f, i) => {
    const { title, fir, alt, valid } = f.properties
    const box = document.createElement('div')
    box.style.cssText = i ? 'margin-top:8px; padding-top:6px; border-top:1px solid #ccd;' : ''
    const head = document.createElement('div')
    head.style.fontWeight = '700'
    head.textContent = title
    box.append(head)
    for (const line of [fir, alt, valid]) {
      if (!line) continue
      const d = document.createElement('div')
      d.textContent = line
      box.append(d)
    }
    el.append(box)
  })
  return el
}

// Small dot + name for a fix on a pasted route (the "fix names" toggle). The dot
// is the marker; the name is positioned next to it by layoutFixLabels so names
// never overlap each other or the airport labels. Built with textContent: the
// name comes from saved data.
const FIX_CHAR_PX = 5.6   // width of one 9px monospace character
const FIX_LABEL_H = 11
function makeFixEl(name) {
  const root = document.createElement('div')
  // no `position` here: MapLibre's marker class positions the element, and the
  // absolutely positioned name below is placed relative to it
  root.style.cssText = 'width:6px; height:6px; box-sizing:border-box; border-radius:50%; background:var(--cp-txt); border:1px solid var(--cp-bg3); pointer-events:none;'
  const label = document.createElement('div')
  label.style.cssText = `position:absolute; font-family:var(--cb-font-mono); font-size:9px; line-height:${FIX_LABEL_H}px; color:var(--cp-txt);
    text-shadow:0 0 3px var(--cp-bg3), 0 0 3px var(--cp-bg3); white-space:nowrap; pointer-events:none; display:none;`
  label.textContent = name
  root.append(label)
  return { root, label, w: Math.ceil(name.length * FIX_CHAR_PX), h: FIX_LABEL_H }
}

// Screen rects taken by the airport dots and ICAO labels (see makeMarkerEl:
// label above a dot whose box is size + 4 px, anchored at its bottom).
function airportRects(map, markers) {
  const rects = []
  for (const m of markers) {
    const { x, y } = map.project([m.lng, m.lat])
    const s = (m.big ? 14 : 10) + 4
    const w = Math.ceil(m.icao.length * 6.2)
    rects.push({ x: x - s / 2, y: y - s, w: s, h: s })
    rects.push({ x: x - w / 2, y: y - s - 15, w, h: 13 })
  }
  return rects
}

// Places every fix label (see utils/labelLayout.js) clear of the airports, the
// other names and the route line, shows or hides it, and
// returns the layout so the saved-map picture can paint the same thing.
function layoutFixLabels(map, markers, fixItems, routeLine) {
  if (!fixItems.length) return []
  const pts = fixItems.map(f => ({ ...map.project([f.lng, f.lat]), w: f.w, h: f.h }))
  // the route line itself, as screen segments, so a name never sits on it
  const line = routeLineCoords(routeLine.points).map(([lng, lat]) => map.project([lng, lat]))
  const lines = line.slice(1).map((p, i) => ({ x1: line[i].x, y1: line[i].y, x2: p.x, y2: p.y }))
  const c = map.getContainer()
  const spots = placeLabels(pts, airportRects(map, markers), { w: c.clientWidth, h: c.clientHeight }, lines)
  return fixItems.map((f, i) => {
    const s = spots[i]
    // the dot is 6px, so its centre is 3px in from the label's offset origin
    if (s) { f.label.style.left = `${3 + s.dx}px`; f.label.style.top = `${3 + s.dy}px` }
    f.label.style.display = s ? 'block' : 'none'
    return { name: f.name, lng: f.lng, lat: f.lat, w: f.w, h: f.h, dx: s?.dx, dy: s?.dy, visible: !!s }
  })
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
//
// The route line is a real map layer, so it is normally already in the
// canvas. But Save re-renders the briefing, which re-adds the layer's source,
// and that loads asynchronously — a snapshot taken in that gap has no line.
// Whenever the source isn't loaded, paint the line here too (same points,
// dash and colour as the 'route-line' layer) so a saved map always has it.
function drawMarkersOnSnapshot(map, baseCanvas, markers, routeLine, fixLayout) {
  const out = document.createElement('canvas')
  out.width = baseCanvas.width
  out.height = baseCanvas.height
  const ctx = out.getContext('2d')
  ctx.drawImage(baseCanvas, 0, 0)

  const dpr = out.width / map.getContainer().clientWidth
  // same theme colours the live overlays use: ink for line/dots/text, surface for halos
  const ink = cssColor('var(--cp-txt)')
  const halo = cssColor('var(--cp-bg3)')
  const geo = routeGeoJSON(markers, routeLine)
  if (geo && !(map.getSource('route') && map.isSourceLoaded('route'))) {
    const w = 2.5 * dpr
    ctx.beginPath()
    geo.geometry.coordinates.forEach(([lng, lat], i) => {
      const { x, y } = map.project([lng, lat])
      if (i) ctx.lineTo(x * dpr, y * dpr)
      else ctx.moveTo(x * dpr, y * dpr)
    })
    ctx.setLineDash(routeLine ? [] : [3 * w, 2 * w])   // solid for a pasted route, dashed for the direct line
    ctx.lineWidth = w
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.85
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.setLineDash([])
  }

  // Fix dots + names (markers are DOM elements, so they are not in the canvas).
  // `fixLayout` is the placement layoutFixLabels chose, so the picture matches the screen.
  if (fixLayout?.length) {
    for (const f of fixLayout) {
      const { x, y } = map.project([f.lng, f.lat])
      const px = x * dpr, py = y * dpr
      ctx.beginPath()
      ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = ink
      ctx.fill()
      if (!f.visible) continue
      ctx.font = `500 ${9 * dpr}px monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = halo
      ctx.strokeText(f.name, px + f.dx * dpr, py + f.dy * dpr + dpr)
      ctx.fillStyle = ink
      ctx.fillText(f.name, px + f.dx * dpr, py + f.dy * dpr + dpr)
      ctx.textBaseline = 'alphabetic'
    }
  }

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
    ctx.strokeStyle = halo
    ctx.stroke()

    ctx.font = `${m.big ? 700 : 500} ${10 * dpr}px monospace`
    ctx.textAlign = 'center'
    ctx.lineWidth = 3 * dpr
    ctx.strokeStyle = halo
    ctx.strokeText(m.icao, px, py - r - 4 * dpr)
    ctx.fillStyle = role.color
    ctx.fillText(m.icao, px, py - r - 4 * dpr)
  }
  return out
}

const CartoRouteMap = forwardRef(function CartoRouteMap({ markers, routeLine, showFixNames, styleKey, isOffline, mapSnapshot, sigmets }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const fixLayoutRef = useRef([])        // where each fix label was placed (for the saved-map picture)
  const baseLabelVisRef = useRef(null)   // the basemap's own text layers and their original visibility
  const [status, setStatus] = useState('loading') // loading | ready | error
  // pending | accepted | declined — only relevant once status === 'error'
  // AND there's no saved snapshot to show instead. "accepted" swaps in the
  // offline coastline fallback; "declined" just stops asking and leaves the
  // plain "unavailable" message up.
  const [fallbackChoice, setFallbackChoice] = useState('pending')

  // `sigmets` is a fresh array every parent render, so redraw only when the set
  // of drawn zones actually changes (same trick the route layer can't use —
  // `markers` is also fresh each render, but it is cheap to re-add).
  const sigGeo = useMemo(() => sigmetsToGeoJSON(sigmets), [sigmets])
  const sigKey = sigGeo.features.map(f => `${f.properties.title}|${f.properties.valid}|${f.geometry.coordinates[0].length}`).join(';')
  const sigGeoRef = useRef(sigGeo)
  sigGeoRef.current = sigGeo
  const sigHazards = [...new Set(sigGeo.features.map(f => f.properties.hazard))]

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
        const withMarkers = drawMarkersOnSnapshot(map, map.getCanvas(), markers, routeLine, fixLayoutRef.current)
        resolve(withMarkers.toDataURL('image/jpeg', 0.72))
      })
      map.triggerRepaint()
    }),
  }), [status, markers, routeLine])

  // Re-create the map whenever the basemap style (i.e. the app theme) changes — MapLibre's own
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
      // Tap a SIGMET zone → popup with every zone under the finger (they overlap).
      // One handler per map instance; the layer itself comes and goes (see the
      // sigmet effect below), so look it up at click time.
      map.on('click', (e) => {
        if (!map.getLayer('sigmet-fill')) return
        const hits = map.queryRenderedFeatures(e.point, { layers: ['sigmet-fill'] })
        if (!hits.length) return
        new Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(sigmetPopupEl(hits)).addTo(map)
      })
      map.on('mousemove', (e) => {
        map.getCanvas().style.cursor =
          map.getLayer('sigmet-fill') && map.queryRenderedFeatures(e.point, { layers: ['sigmet-fill'] }).length ? 'pointer' : ''
      })
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
      fixLayoutRef.current = []
      baseLabelVisRef.current = null
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
    const fixItems = []
    if (showFixNames && routeLine) {
      for (const p of routeLine.points) {
        if (!p.name) continue
        const { root, label, w, h } = makeFixEl(p.name)
        markersRef.current.push(new Marker({ element: root, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map))
        fixItems.push({ name: p.name, lng: p.lng, lat: p.lat, label, w, h })
      }
    }

    // With fix names on, the basemap's own place names (countries, cities) would
    // print over them and over the route, so they are hidden; restored when off.
    const textLayers = (map.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout?.['text-field'])
    baseLabelVisRef.current ??= Object.fromEntries(textLayers.map(l => [l.id, l.layout?.visibility ?? 'visible']))
    for (const [id, original] of Object.entries(baseLabelVisRef.current)) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', fixItems.length ? 'none' : original)
    }

    const geo = routeGeoJSON(markers, routeLine)
    if (map.getLayer('route-line')) map.removeLayer('route-line')
    if (map.getSource('route')) map.removeSource('route')
    if (geo) {
      map.addSource('route', { type: 'geojson', data: geo })
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        // solid for a pasted route, dashed for the estimated direct line
        paint: { 'line-color': cssColor('var(--cp-txt)'), 'line-width': 2.5, 'line-opacity': 0.85, ...(routeLine ? {} : { 'line-dasharray': [3, 2] }) },
      })
    }

    const bounds = markers.reduce(
      (b, m) => b.extend([m.lng, m.lat]),
      new LngLatBounds([markers[0].lng, markers[0].lat], [markers[0].lng, markers[0].lat])
    )
    if (routeLine) routeLine.points.forEach(p => bounds.extend([p.lng, p.lat]))
    map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 0 })

    // Place the fix names now, and again whenever the zoom (or size) changes.
    const relayout = () => { fixLayoutRef.current = layoutFixLabels(map, markers, fixItems, routeLine) }
    relayout()
    map.on('zoomend', relayout)
    map.on('resize', relayout)
    return () => { map.off('zoomend', relayout); map.off('resize', relayout) }
  }, [status, markers, routeLine, showFixNames])

  // SIGMET zones, under the route line and airport markers. The route effect
  // above re-adds 'route-line' on every render, so it always ends up on top.
  useEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map) return
    const draw = () => {
      for (const id of ['sigmet-fill', 'sigmet-line']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource('sigmets')) map.removeSource('sigmets')
      const geo = sigGeoRef.current
      if (!geo.features.length) return
      const features = geo.features.map(f => ({ ...f, properties: { ...f.properties, color: cssColor(hazardColor(f.properties.hazard)) } }))
      map.addSource('sigmets', { type: 'geojson', data: { type: 'FeatureCollection', features } })
      const before = map.getLayer('route-line') ? 'route-line' : undefined
      map.addLayer({ id: 'sigmet-fill', type: 'fill', source: 'sigmets', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, before)
      map.addLayer({ id: 'sigmet-line', type: 'line', source: 'sigmets', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.9 } }, before)
    }
    // Unlike the route effect (re-run every render), this one only runs when the
    // zones change — so if the style is still loading right now, wait for it.
    if (map.isStyleLoaded()) draw()
    else { map.once('idle', draw); return () => map.off('idle', draw) }
  }, [status, sigKey])

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
          background: 'color-mix(in srgb, var(--cp-bg3) 80%, transparent)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
          fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
          color: 'var(--cp-yellow)',
        }}>
          Offline — map frozen
        </div>
      )}

      {status === 'ready' && sigHazards.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, pointerEvents: 'none',
          background: 'color-mix(in srgb, var(--cp-bg3) 80%, transparent)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
          fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
          color: 'var(--cp-txt)', display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          <div style={{ color: 'var(--cp-dim)' }}>SIGMET</div>
          {sigHazards.map(h => (
            <div key={h || 'unknown'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: hazardColor(h), opacity: 0.85 }} />
              {fmtHazard(h)}
            </div>
          ))}
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
            background: 'color-mix(in srgb, var(--cp-bg3) 80%, transparent)', backdropFilter: 'blur(6px)',
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
