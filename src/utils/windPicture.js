// Pure maths for the winds-aloft picture: reading a wind value off the GFS grid, converting it to what
// pilots read (knots, direction the wind is FROM), wind barb geometry, and the speed colours.
// Drawing is in services/windSnapshot.js.

export const MS_TO_KT = 1.943844

// The time the wind picture should be valid for: the OFP's departure time when the briefing has one and it
// is still ahead, otherwise now.
export function windValidTime(route, nowMs) {
  const std = Date.parse(route?.flightDetails?.info?.std)
  return Number.isFinite(std) ? Math.max(std, nowMs) : nowMs
}

export const windSpeedKt = (u, v) => Math.hypot(u, v) * MS_TO_KT

// Compass direction the wind blows FROM (0 = from the north), given the east (u) and north (v) parts in m/s.
export function windFromDeg(u, v) {
  return (((270 - Math.atan2(v, u) * 180 / Math.PI) % 360) + 360) % 360
}

// Value at (lng, lat) from a decoded GFS grid ({ ni, nj, la1, lo1, di, dj, values }): bilinear, wrapping
// around the globe in longitude and holding at the poles.
export function sampleGrid(g, lng, lat) {
  const x = ((((lng - g.lo1) / g.di) % g.ni) + g.ni) % g.ni
  const y = Math.max(0, Math.min(g.nj - 1, (g.la1 - lat) / g.dj))
  const x0 = Math.floor(x), x1 = (x0 + 1) % g.ni
  const y0 = Math.floor(y), y1 = Math.min(g.nj - 1, y0 + 1)
  const fx = x - x0, fy = y - y0
  const at = (cx, cy) => g.values[cy * g.ni + cx]
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx
  return top * (1 - fy) + bottom * fy
}

/**
 * Wind barb as plain line segments, in pixels around the station at (0, 0), x east and y down.
 * The staff points toward where the wind comes FROM; each half barb is 5 kt, full barb 10, pennant 50.
 * Barbs sit on the clockwise side of the staff in the northern hemisphere and the other side in the south.
 * @returns {{ calm: boolean, staff: number[][], lines: number[][][], flags: number[][][] }}
 */
export function windBarb(speedKt, fromDeg, length = 34, southern = false) {
  const knots = Math.round(speedKt / 5) * 5
  if (knots < 5) return { calm: true, staff: [], lines: [], flags: [] }
  const b = fromDeg * Math.PI / 180
  const t = [Math.sin(b), -Math.cos(b)]                       // along the staff, toward the wind's source
  const side = southern ? -1 : 1
  const n = [Math.cos(b) * side, Math.sin(b) * side]          // barb side (clockwise of the staff in the north)
  const P = d => [t[0] * (length - d), t[1] * (length - d)]   // d = distance in from the tip
  const spacing = length * 0.15, barb = length * 0.4
  let flags = Math.floor(knots / 50), rest = knots % 50
  const fulls = Math.floor(rest / 10), half = rest % 10 >= 5 ? 1 : 0
  const lines = [], pennants = []
  let d = 0
  for (let i = 0; i < flags; i++) {
    const tip = P(d), base = P(d + spacing)
    pennants.push([tip, [tip[0] + n[0] * barb, tip[1] + n[1] * barb], base])
    d += spacing
  }
  if (flags) d += spacing * 0.3
  for (let i = 0; i < fulls; i++) {
    const a = P(d)
    lines.push([a, [a[0] + n[0] * barb + t[0] * barb * 0.25, a[1] + n[1] * barb + t[1] * barb * 0.25]])
    d += spacing
  }
  if (half) {
    if (!flags && !fulls) d += spacing                          // a lone 5 kt barb sits one step in from the tip
    const a = P(d)
    lines.push([a, [a[0] + n[0] * barb * 0.5 + t[0] * barb * 0.12, a[1] + n[1] * barb * 0.5 + t[1] * barb * 0.12]])
  }
  return { calm: false, staff: [[0, 0], P(0)], lines, flags: pennants }
}

// Colour for the shading behind the barbs: clear below 25 kt, blue to green to yellow to red to magenta
// as the wind gets stronger, so the jet stream stands out. [r, g, b, alpha 0-1].
const STOPS = [
  [25, [60, 110, 210, 0]],
  [40, [60, 130, 220, 0.30]],
  [60, [60, 200, 200, 0.40]],
  [80, [110, 210, 90, 0.48]],
  [100, [250, 220, 60, 0.54]],
  [120, [250, 140, 40, 0.58]],
  [150, [235, 60, 60, 0.62]],
  [180, [220, 60, 200, 0.66]],
]
export function windShade(kt) {
  if (kt <= STOPS[0][0]) return STOPS[0][1]
  for (let i = 1; i < STOPS.length; i++) {
    if (kt <= STOPS[i][0]) {
      const [k0, c0] = STOPS[i - 1], [k1, c1] = STOPS[i], f = (kt - k0) / (k1 - k0)
      return c0.map((v, j) => v + (c1[j] - v) * f)
    }
  }
  return STOPS.at(-1)[1]
}
export const SHADE_LEGEND_KT = [40, 60, 80, 100, 120, 150]
