const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/** Great-circle distance in nautical miles (haversine — stable for small distances). */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG
  const Δφ = (lat2 - lat1) * DEG
  const Δλ = (lon2 - lon1) * DEG
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return c * RAD * 60
}

/** Initial great-circle bearing in degrees (0-360, 0 = north). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG
  const Δλ = (lon2 - lon1) * DEG
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * RAD + 360) % 360
}
