import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getRoleStyle } from '../utils/metarSeverity'
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'

const WINDY_KEY = import.meta.env.VITE_WINDY_API_KEY

// Windy only supports ONE live map instance per page (calling windyInit
// twice throws/crashes), and its #windy container can't be reparented once
// initialized — moving the WebGL canvas Windy attaches to it breaks its
// internal renderers. So the div lives permanently under document.body,
// created once and never removed, and this component just repositions it
// (fixed left/top/width/height) to sit exactly over a same-sized
// placeholder in React's own layout, showing/hiding it as it mounts/unmounts.
//
// Both the script tags and the windyInit() call are cached on `window`
// rather than module-level state — Vite HMR can reset a module's own state
// without reloading the page (while iterating on this file), which would
// otherwise look like a fresh page and fire a second windyInit() against
// one that's already initialized. Same reasoning covers React StrictMode's
// dev-only double-invoke of effects.
function getWindyDiv() {
  let el = document.getElementById('windy')
  if (!el) {
    el = document.createElement('div')
    el.id = 'windy'
    el.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:400px; height:300px; visibility:hidden; z-index:210;'
    document.body.appendChild(el)
  }
  return el
}

function loadWindyScripts() {
  if (window.__cbWindyScriptsPromise) return window.__cbWindyScriptsPromise
  window.__cbWindyScriptsPromise = new Promise((resolve, reject) => {
    if (window.L && window.windyInit) { resolve(); return }
    const leaflet = document.createElement('script')
    leaflet.src = 'https://unpkg.com/leaflet@1.4.0/dist/leaflet.js'
    leaflet.onerror = reject
    leaflet.onload = () => {
      const windy = document.createElement('script')
      windy.src = 'https://api.windy.com/assets/map-forecast/libBoot.js'
      windy.onerror = reject
      windy.onload = resolve
      document.head.appendChild(windy)
    }
    document.head.appendChild(leaflet)
  })
  return window.__cbWindyScriptsPromise
}

function getWindyAPI() {
  if (window.__cbWindyApiPromise) return window.__cbWindyApiPromise
  window.__cbWindyApiPromise = loadWindyScripts().then(() => new Promise((resolve, reject) => {
    getWindyDiv()
    const timer = setTimeout(() => reject(new Error('Windy init timed out')), 15000)
    window.windyInit({ key: WINDY_KEY, verbose: false, lat: 20, lon: 0, zoom: 3 }, (windyAPI) => {
      clearTimeout(timer)
      windyEverInitialized = true
      resolve(windyAPI)
    })
  }))
  return window.__cbWindyApiPromise
}

// Once Windy has successfully initialized, its map instance and whatever
// tiles it already loaded stay alive in the permanent #windy div for the
// rest of the page session (see getWindyDiv/getWindyAPI above) — so
// switching back to Live Weather after going offline still shows that
// same already-loaded view, and shouldn't be blocked just because we're
// offline right now. Only genuinely first-time-offline attempts should be.
let windyEverInitialized = false
export function hasWindyLoadedBefore() {
  return windyEverInitialized
}

// Windy's free/testing API key only unlocks the wind/temp/pressure overlays
// (confirmed via windyAPI.store.getAllowed('overlay')) — rain and clouds are
// served separately via the Rainbow Weather API proxy (see the rainbow*
// helpers and the tile-layer effect below) instead of Windy's own overlays.
const LAYERS = [
  { id: 'wind', label: 'Wind' },
  { id: 'temp', label: 'Temp' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'rain', label: 'Rain' },
  { id: 'clouds', label: 'Clouds' },
]

// forecast_time offsets (seconds) the Rain layer's time row can request —
// Rainbow's precip tile only, clouds has no forecast_time param.
const FORECAST_STEPS = [
  { sec: 0, label: 'Now' },
  { sec: 3600, label: '+1h' },
  { sec: 7200, label: '+2h' },
  { sec: 10800, label: '+3h' },
  { sec: 14400, label: '+4h' },
]

const RAINBOW_MAX_ZOOM = { rain: 12, clouds: 7 }

async function fetchRainbowSnapshot(layer) {
  const r = await fetch(`/api/rainbow?resource=snapshot&layer=${layer === 'rain' ? 'precip' : 'clouds'}`)
  if (!r.ok) throw new Error(`Rainbow snapshot fetch failed (${r.status})`)
  const data = await r.json()
  return data.snapshot
}

function rainbowTileUrl(layer, snapshot, forecastTime) {
  const resource = layer === 'rain' ? 'precip' : 'clouds'
  const forecastParam = layer === 'rain' ? `&forecast_time=${forecastTime}` : ''
  return `/api/rainbow?resource=${resource}&snapshot=${snapshot}${forecastParam}&z={z}&x={x}&y={y}`
}

// Windy's pressure-level tokens (confirmed via windyAPI.store.getAllowed('level')
// — all allowed on the free key, unlike most overlays), mapped to the
// altitude a pilot actually thinks in rather than hPa.
const LEVELS = [
  { id: 'surface', label: 'SFC' },
  { id: '850h', label: '5K' },
  { id: '700h', label: '10K' },
  { id: '500h', label: 'FL180' },
  { id: '400h', label: 'FL240' },
  { id: '300h', label: 'FL300' },
  { id: '250h', label: 'FL340' },
  { id: '200h', label: 'FL390' },
  { id: '150h', label: 'FL450' },
]

export default function WindyRouteMap({ markers, isOffline }) {
  const placeholderRef = useRef(null)
  const windyApiRef = useRef(null)
  const drawnRef = useRef(null) // { polyline, circleMarkers[] } — cleared/redrawn on route/layer change
  const rainbowLayerRef = useRef(null) // Leaflet tile layer for the Rain/Clouds overlays (separate from Windy's own)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [layer, setLayer] = useState('wind')
  const [level, setLevel] = useState('surface')
  const [forecastTime, setForecastTime] = useState(0) // Rain layer only — seconds ahead, see FORECAST_STEPS
  const [rainbowMeta, setRainbowMeta] = useState({}) // { rain: {snapshot, fetchedAtMs}, clouds: {...} } — fetched once per layer, only advanced by Refresh
  const [, bumpTick] = useState(0) // forces a re-render every 30s so the "stale" indicator updates without any network call
  const isRainbowLayer = layer === 'rain' || layer === 'clouds'

  // Init once. Deferred a tick so React StrictMode's dev-only
  // mount→cleanup→mount double-invoke cancels the first (unused) attempt
  // before it ever calls getWindyAPI() — the two invocations happen
  // synchronously back to back with no gap a plain "active" flag could
  // catch in time.
  useEffect(() => {
    if (!WINDY_KEY) { setStatus('error'); return }
    let active = true
    const timer = setTimeout(() => {
      getWindyAPI()
        .then((windyAPI) => {
          if (!active) return
          windyApiRef.current = windyAPI
          setStatus('ready')
        })
        .catch(() => { if (active) setStatus('error') })
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [])

  // While mounted+ready, keep the permanent #windy div positioned exactly
  // over our placeholder. Hide it (rather than remove/reparent it) on
  // unmount so it's ready to reappear instantly next time this is shown.
  useEffect(() => {
    if (status !== 'ready') return
    const el = getWindyDiv()
    const place = () => {
      const r = placeholderRef.current.getBoundingClientRect()
      el.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px; visibility:visible; z-index:210;`
      windyApiRef.current.map.invalidateSize()
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      el.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:400px; height:300px; visibility:hidden; z-index:210;'
    }
  }, [status])

  // Redraw the route line + airport markers whenever the route or layer changes.
  useEffect(() => {
    if (status !== 'ready') return
    const windyAPI = windyApiRef.current
    const { map, store } = windyAPI
    const L = window.L
    // Rain/Clouds aren't Windy overlay ids on this key — they're rendered by
    // the separate Rainbow tile layer effect below instead. Without this,
    // Windy's own overlay just stays whatever it was last set to (e.g. still
    // showing Pressure's heatmap) since we'd never tell it to change, making
    // Rain/Clouds look like they don't do anything if the tile happens to be
    // transparent (no precipitation) at the current view.
    store.set('overlay', isRainbowLayer ? 'wind' : layer)
    store.set('level', level)

    if (drawnRef.current) {
      drawnRef.current.polyline.remove()
      drawnRef.current.circleMarkers.forEach(m => m.remove())
    }

    const routePts = []
    if (markers.length >= 2) {
      const dep = markers[0], arr = markers[1]
      for (let i = 0; i <= 24; i++) {
        const p = interpolateGreatCircle(dep.lat, dep.lng, arr.lat, arr.lng, i / 24)
        routePts.push([p.lat, p.lng])
      }
    }
    const polyline = routePts.length
      ? L.polyline(routePts, { color: '#e8ecf5', weight: 2.5, opacity: 0.85, dashArray: '9 7' }).addTo(map)
      : L.layerGroup().addTo(map)

    const circleMarkers = markers.map(m => {
      const role = getRoleStyle(m.label)
      return L.circleMarker([m.lat, m.lng], {
        radius: m.big ? 8 : 6, color: role.color, weight: 2,
        fillColor: role.color, fillOpacity: 1,
      })
        .bindTooltip(m.icao, { permanent: true, direction: 'top', offset: [0, -6], className: 'windy-airport-label' })
        .addTo(map)
    })

    drawnRef.current = { polyline, circleMarkers }

    if (markers.length) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 9 })
    }
  }, [status, layer, level, markers])

  // Manage the Rain/Clouds tile layer — fetches a snapshot once per layer
  // (cached in rainbowMeta) and only ever advances it when the user clicks
  // Refresh. Pan/zoom still loads new tiles normally at that fixed snapshot.
  useEffect(() => {
    if (status !== 'ready') return
    const { map } = windyApiRef.current
    const L = window.L

    if (!isRainbowLayer) {
      if (rainbowLayerRef.current) { rainbowLayerRef.current.remove(); rainbowLayerRef.current = null }
      return
    }

    const meta = rainbowMeta[layer]
    if (!meta) {
      let cancelled = false
      fetchRainbowSnapshot(layer)
        .then(snapshot => { if (!cancelled) setRainbowMeta(prev => ({ ...prev, [layer]: { snapshot, fetchedAtMs: Date.now() } })) })
        .catch(() => {})
      return () => { cancelled = true }
    }

    if (rainbowLayerRef.current) rainbowLayerRef.current.remove()
    rainbowLayerRef.current = L.tileLayer(rainbowTileUrl(layer, meta.snapshot, forecastTime), {
      minZoom: 0, maxZoom: RAINBOW_MAX_ZOOM[layer], tileSize: 256, opacity: 0.9,
      // Without an explicit zIndex this layer defaults to "auto", which CSS
      // stacks BELOW Windy's own basemap/particles/overlay layers (z-index
      // 20/15/10) regardless of DOM order — the tiles were rendering
      // correctly but invisibly, painted under Windy's own heatmap.
      zIndex: 50,
      attribution: 'Rainbow AI Precipitation Tiles',
    }).addTo(map)

    return () => { rainbowLayerRef.current?.remove(); rainbowLayerRef.current = null }
  }, [status, layer, forecastTime, rainbowMeta])

  // Local-only timer so the "stale" dot updates over time without ever
  // polling the API itself — data only actually refreshes on user click.
  useEffect(() => {
    if (status !== 'ready' || !isRainbowLayer) return
    const id = setInterval(() => bumpTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [status, isRainbowLayer])

  async function handleRainbowRefresh() {
    try {
      const snapshot = await fetchRainbowSnapshot(layer)
      setRainbowMeta(prev => ({ ...prev, [layer]: { snapshot, fetchedAtMs: Date.now() } }))
    } catch (_) {}
  }

  const rainbowMetaActive = rainbowMeta[layer]
  const rainbowStaleMin = rainbowMetaActive ? Math.floor((Date.now() - rainbowMetaActive.fetchedAtMs) / 60_000) : null
  const rainbowIsStale = rainbowStaleMin !== null && rainbowStaleMin >= 10
  const rainbowAsOf = rainbowMetaActive
    ? (() => { const d = new Date(rainbowMetaActive.snapshot * 1000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z` })()
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={placeholderRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Portalled INTO the permanent #windy div (not rendered inline) —
          #windy lives outside the Briefing modal's own stacking context
          (see getWindyDiv), so a locally-scoped z-index here couldn't win
          against it; as a child it just naturally sits on top of the map. */}
      {status === 'ready' && createPortal(
        <>
          <div style={{
            position: 'absolute', top: 10, left: 10,
            display: 'flex', gap: 4, background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
            border: '1px solid var(--cp-border3)', borderRadius: 7, padding: 3,
          }}>
            {LAYERS.map(l => (
              <button
                key={l.id}
                onClick={() => !isOffline && setLayer(l.id)}
                disabled={isOffline}
                title={isOffline ? 'Offline — showing last loaded view' : undefined}
                style={{
                  fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
                  color: layer === l.id ? '#e8ecf5' : '#7c87a3', background: layer === l.id ? 'var(--cp-bg3)' : 'transparent',
                  border: 'none', borderRadius: 5, padding: '5px 9px',
                  cursor: isOffline ? 'not-allowed' : 'pointer', opacity: isOffline ? 0.5 : 1,
                }}
              >{l.label}</button>
            ))}
          </div>

          {isOffline && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
              border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
              fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
              color: 'var(--cp-yellow)',
            }}>
              Offline — showing last loaded view
            </div>
          )}

          {!isOffline && isRainbowLayer && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
              border: '1px solid var(--cp-border3)', borderRadius: 7, padding: '5px 9px',
            }}>
              {rainbowAsOf && (
                <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>
                  Data as of {rainbowAsOf}
                </span>
              )}
              <button
                onClick={handleRainbowRefresh}
                title="Refresh"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
                  color: '#e8ecf5', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Refresh
                {rainbowIsStale && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cp-red)' }} />
                )}
              </button>
            </div>
          )}

          {layer === 'rain' && (
            <div style={{
              position: 'absolute', top: 52, left: 10,
              display: 'flex', gap: 4, background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
              border: '1px solid var(--cp-border3)', borderRadius: 7, padding: 3,
            }}>
              {FORECAST_STEPS.map(f => (
                <button
                  key={f.sec}
                  onClick={() => !isOffline && setForecastTime(f.sec)}
                  disabled={isOffline}
                  style={{
                    fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
                    color: forecastTime === f.sec ? '#e8ecf5' : '#7c87a3', background: forecastTime === f.sec ? 'var(--cp-bg3)' : 'transparent',
                    border: 'none', borderRadius: 5, padding: '5px 9px',
                    cursor: isOffline ? 'not-allowed' : 'pointer', opacity: isOffline ? 0.5 : 1,
                  }}
                >{f.label}</button>
              ))}
            </div>
          )}

          {/* Altitude tape — same rung order as LEVELS (SFC first), reversed
              visually via column-reverse so SFC sits at the bottom. Only
              meaningful for Windy's own pressure-level overlays. */}
          {!isRainbowLayer && (
            <div style={{
              position: 'absolute', top: 52, left: 10,
              display: 'flex', flexDirection: 'column-reverse', gap: 2,
              background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
              border: '1px solid var(--cp-border3)', borderRadius: 7, padding: 3,
            }}>
              {LEVELS.map(lv => (
                <button
                  key={lv.id}
                  onClick={() => !isOffline && setLevel(lv.id)}
                  disabled={isOffline}
                  style={{
                    height: 22, fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
                    color: level === lv.id ? '#e8ecf5' : '#7c87a3', background: level === lv.id ? 'var(--cp-bg3)' : 'transparent',
                    border: 'none', borderRadius: 5,
                    cursor: isOffline ? 'not-allowed' : 'pointer', opacity: isOffline ? 0.5 : 1,
                  }}
                >{lv.label}</button>
              ))}
            </div>
          )}
        </>,
        getWindyDiv()
      )}

      {status !== 'ready' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', background: 'var(--cp-bg3)',
        }}>
          {status === 'error' ? 'Live weather unavailable' : 'Loading live weather…'}
        </div>
      )}
    </div>
  )
}
