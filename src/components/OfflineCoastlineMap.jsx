import { getRoleStyle } from '../utils/metarSeverity'
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import { projectLatLng, WORLD_LAND_PATH, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from '../data/worldMap'

function computeMapBounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  let minX = Math.min(...xs), maxX = Math.max(...xs)
  let minY = Math.min(...ys), maxY = Math.max(...ys)
  const padX = Math.max((maxX - minX) * 0.15, 18)
  const padY = Math.max((maxY - minY) * 0.15, 18)
  minX = Math.max(minX - padX, 0)
  maxX = Math.min(maxX + padX, WORLD_MAP_WIDTH)
  minY = Math.max(minY - padY, 0)
  maxY = Math.min(maxY + padY, WORLD_MAP_HEIGHT)
  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

// Flat coastline outline, bundled with the app (same data as the World Time
// tab) — needs no network access at all, so it's the fallback shown when the
// CARTO/MapLibre map genuinely fails to load. This is the map the Route &
// Alternates card used before CARTO's vector basemaps replaced it.
export default function OfflineCoastlineMap({ markers }) {
  const projected = markers.map(m => ({ ...m, ...projectLatLng(m.lat, m.lng) }))
  const bounds = computeMapBounds(projected)

  const dep = markers.find(m => m.label === 'DEPARTURE')
  const arr = markers.find(m => m.label === 'ARRIVAL')
  let routePath = null
  if (dep && arr) {
    const p0 = projectLatLng(dep.lat, dep.lng)
    const p2 = projectLatLng(arr.lat, arr.lng)
    const mid = interpolateGreatCircle(dep.lat, dep.lng, arr.lat, arr.lng, 0.5)
    const pMid = projectLatLng(mid.lat, mid.lng)
    const p1 = { x: 2 * pMid.x - 0.5 * (p0.x + p2.x), y: 2 * pMid.y - 0.5 * (p0.y + p2.y) }
    routePath = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
  }

  return (
    <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`} style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect x={bounds.minX} y={bounds.minY} width={bounds.w} height={bounds.h} fill="var(--cp-bg3)" />

      <path d={WORLD_LAND_PATH} fill="var(--cp-dim)" fillOpacity={0.28} fillRule="evenodd" />

      {routePath && (
        <path d={routePath} fill="none" stroke="var(--cp-txt)" strokeWidth={bounds.w / 300}
          strokeDasharray={`${bounds.w / 130} ${bounds.w / 180}`} opacity={0.85} />
      )}

      {projected.map(m => {
        const role = getRoleStyle(m.label)
        const r = (m.big ? bounds.w / 78 : bounds.w / 100)
        const fontSize = bounds.w / (m.big ? 42 : 50)
        return (
          <g key={m.icao}>
            {m.big && <circle cx={m.x} cy={m.y} r={r * 1.7} fill="none" stroke={role.color} strokeWidth={bounds.w / 500} opacity={0.4} />}
            <circle cx={m.x} cy={m.y} r={r} fill={role.color} stroke="var(--cp-bg3)" strokeWidth={bounds.w / 450} />
            {/* Halo behind the code so the route line, coastline or another
                marker never reads as cutting through it, for any route. */}
            <text x={m.x} y={m.y + (m.y < bounds.minY + bounds.h / 2 ? r * 2.6 : -r * 1.8)}
              textAnchor="middle" fontFamily="var(--cb-font-mono)" fontSize={fontSize}
              fontWeight={m.big ? 700 : 500} fill={role.color}
              paintOrder="stroke" stroke="var(--cp-bg3)" strokeWidth={fontSize / 4} strokeLinejoin="round">
              {m.icao}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
