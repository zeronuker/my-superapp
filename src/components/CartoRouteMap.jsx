import { useEffect, useRef, useState } from 'react'
import { Map as MaplibreMap, Marker, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getRoleStyle } from '../utils/metarSeverity'
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'

// MapLibre builds its worker's own URL from a dynamic template literal
// (`./${t}`), which no bundler can statically resolve into a real emitted
// asset — in dev it 404s, in production Vercel's SPA rewrite serves
// index.html for that missing path instead, and the worker never loads
// (tiles never parse, the map hangs on "Loading map…" forever with no
// error). Importing the worker file via Vite's `?url` gives us its real,
// bundler-resolved path, which setWorkerUrl feeds to MapLibre directly.
setWorkerUrl(maplibreWorkerUrl)

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY

const STYLE_IDS = {
  dark: 'dark-matter-gl-style',
  voyager: 'voyager-gl-style',
}

function styleUrl(styleId) {
  const base = `https://basemaps.cartocdn.com/gl/${styleId}/style.json`
  // CARTO's vector styles don't require the key yet (only their raster
  // tiles do), but accept it already — sending it now means nothing breaks
  // once the key requirement reaches vector too.
  return CARTO_KEY ? `${base}?api_key=${CARTO_KEY}` : base
}

// Module-level (not component state) so switching basemap tabs remembers
// which ones already loaded successfully this session — same reasoning as
// hasWindyLoadedBefore in WindyRouteMap.jsx.
const loadedStyles = new Set()
export function hasCartoLoadedBefore(styleKey) {
  return loadedStyles.has(styleKey)
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

export default function CartoRouteMap({ markers, styleKey, isOffline }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [status, setStatus] = useState('loading') // loading | ready | error

  // Re-create the map whenever the basemap style changes — MapLibre's own
  // setStyle() tears down every custom source/layer, so a full teardown +
  // rebuild here is simpler than re-adding everything after a style swap.
  useEffect(() => {
    let stale = false
    setStatus('loading')
    const map = new MaplibreMap({
      container: containerRef.current,
      style: styleUrl(STYLE_IDS[styleKey]),
      center: [0, 20],
      zoom: 2,
    })
    mapRef.current = map

    // Guard against this map's own 'load' still firing after a fast tab
    // switch already started tearing it down — without it, the stale
    // callback flips status to 'ready' while mapRef now points at the NEXT
    // (still-loading) map, and the marker/route effect below then calls
    // addSource on a style that isn't loaded yet, crashing the component.
    map.on('load', () => {
      if (stale) return
      loadedStyles.add(styleKey)
      setStatus('ready')
    })
    map.on('error', () => { if (!stale) setStatus('error') })

    return () => {
      stale = true
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [styleKey])

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {status !== 'ready' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', background: 'var(--cp-bg3)', pointerEvents: 'none',
        }}>
          {status === 'error'
            ? (isOffline ? 'Unavailable offline — never loaded this session' : 'Map unavailable')
            : 'Loading map…'}
        </div>
      )}
    </div>
  )
}
