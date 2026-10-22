// Coordinates for the map's route line. A straight line between two far-apart
// points on a Mercator map is not the shortest path, so each leg is bent along
// its great circle, one drawn point per ~100 NM.

import { greatCircleNm, interpolateGreatCircle } from '../modules/prayer/services/flightCalc'

const STEP_NM = 100

/**
 * @param {Array<{lat:number, lng:number}>} points  airport, fixes in order, airport
 * @returns {Array<[number, number]>}  [lng, lat] pairs, ready for a GeoJSON LineString
 */
export function routeLineCoords(points) {
  if (!points?.length) return []
  const coords = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const n = Math.max(1, Math.ceil(greatCircleNm(a.lat, a.lng, b.lat, b.lng) / STEP_NM))
    for (let k = 0; k < n; k++) {
      const p = interpolateGreatCircle(a.lat, a.lng, b.lat, b.lng, k / n)
      coords.push([p.lng, p.lat])
    }
  }
  const last = points.at(-1)
  coords.push([last.lng, last.lat])
  return coords
}
