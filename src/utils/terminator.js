// Day/night terminator — the great-circle boundary between the sunlit and
// dark halves of the globe. Formulas: NOAA solar position approximations.

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.floor((date.getTime() - start) / 86400000) + 1
}

// Solar declination in degrees (Cooper's approximation).
export function solarDeclination(date) {
  const n = dayOfYear(date)
  return 23.44 * Math.sin(DEG2RAD * (360 / 365) * (n + 284))
}

// Longitude the sun is directly overhead, in degrees, normalized to (-180, 180].
export function subsolarLongitude(date) {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  let lng = (12 - utcHours) * 15
  lng = ((lng + 180) % 360 + 360) % 360 - 180
  return lng
}

// SVG path (in the given projection's coordinate space) for the night-side
// region, so it can be filled as a single shaded overlay on a world map.
// `project(lat, lng)` must match the projection used to draw the coastline
// (e.g. projectLatLng from data/worldMap.js) so the shading lines up.
export function nightRegionPath(date, project, width, height, step = 4) {
  const decl = solarDeclination(date) * DEG2RAD
  const subLng = subsolarLongitude(date)
  const tanDecl = Math.tan(decl) || 1e-9

  const points = []
  for (let lng = -180; lng <= 180; lng += step) {
    const dLambda = (lng - subLng) * DEG2RAD
    const lat = Math.atan(-Math.cos(dLambda) / tanDecl) * RAD2DEG
    points.push(project(lat, lng))
  }

  // Whichever pole sits opposite the sun's declination is in continuous
  // night — close the polygon against that edge of the map.
  const nightPole = decl >= 0 ? height : 0

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('')
  const last = points[points.length - 1]
  const first = points[0]
  return `${d}L${last.x},${nightPole}L${first.x},${nightPole}Z`
}
