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
      resolve(windyAPI)
    })
  }))
  return window.__cbWindyApiPromise
}

// Windy's free/testing API key only unlocks the wind/temp/pressure overlays
// (confirmed via windyAPI.store.getAllowed('overlay')) — rain, clouds and
// everything else need their paid Professional plan. Rain/Clouds stay in
// the picker (disabled) so it's clear they exist, not just missing.
const LAYERS = [
  { id: 'wind', label: 'Wind' },
  { id: 'temp', label: 'Temp' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'rain', label: 'Rain', proOnly: true },
  { id: 'clouds', label: 'Clouds', proOnly: true },
]

export default function WindyRouteMap({ markers }) {
  const placeholderRef = useRef(null)
  const windyApiRef = useRef(null)
  const drawnRef = useRef(null) // { polyline, circleMarkers[] } — cleared/redrawn on route/layer change
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [layer, setLayer] = useState('wind')

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
    store.set('overlay', layer)

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
  }, [status, layer, markers])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={placeholderRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Portalled INTO the permanent #windy div (not rendered inline) —
          #windy lives outside the Briefing modal's own stacking context
          (see getWindyDiv), so a locally-scoped z-index here couldn't win
          against it; as a child it just naturally sits on top of the map. */}
      {status === 'ready' && createPortal(
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', gap: 4, background: 'rgba(10,16,32,0.72)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--cp-border3)', borderRadius: 7, padding: 3,
        }}>
          {LAYERS.map(l => (
            <button
              key={l.id}
              onClick={() => !l.proOnly && setLayer(l.id)}
              disabled={l.proOnly}
              title={l.proOnly ? 'Requires Windy Pro' : undefined}
              style={{
                fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.03em', textTransform: 'uppercase',
                color: layer === l.id ? '#e8ecf5' : '#7c87a3', background: layer === l.id ? 'var(--cp-bg3)' : 'transparent',
                border: 'none', borderRadius: 5, padding: '5px 9px',
                cursor: l.proOnly ? 'not-allowed' : 'pointer', opacity: l.proOnly ? 0.4 : 1,
              }}
            >{l.label}</button>
          ))}
        </div>,
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
