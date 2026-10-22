// Pure label placement for the fix names drawn along a route (CartoRouteMap).
// Each label is tried in a few spots around its dot (close in, then a little
// further out) and takes the first one that doesn't touch an airport
// label/dot, another fix's dot or label, the route line itself, or the edge of
// the map. A label with no free spot is hidden (zooming in frees room).
// All numbers are screen pixels, rects are { x, y, w, h } with (x, y) top-left,
// line segments are { x1, y1, x2, y2 }.

const GAPS = [5, 13] // dot centre -> label edge: first the close ring, then one further out
const DOT = 6        // fix dot is a DOT x DOT square centred on the point
const PAD = 2        // clear space kept around every label
const LINE_PAD = 3   // clear space kept between a label and the route line (line is ~2.5px wide)
const EDGE = 2       // clear space kept from the map edge

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const inflate = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p })

/** True when the segment touches the rect (Liang–Barsky clipping). */
export function segmentHitsRect({ x1, y1, x2, y2 }, r) {
  const dx = x2 - x1, dy = y2 - y1
  const p = [-dx, dx, -dy, dy]
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1]
  let t0 = 0, t1 = 1
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue }   // parallel to this edge and outside it
    const t = q[i] / p[i]
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return true
}

// Offsets of the label's top-left corner from the dot centre, best spot first.
function spots(w, h) {
  const out = []
  for (const g of GAPS) {
    out.push(
      { dx: -w / 2,       dy: -h - g },        // above
      { dx: -w / 2,       dy: g },             // below
      { dx: g + 1,        dy: -h / 2 },        // right
      { dx: -w - g - 1,   dy: -h / 2 },        // left
      { dx: g,            dy: -h - g + 2 },    // upper right
      { dx: -w - g,       dy: -h - g + 2 },    // upper left
      { dx: g,            dy: g - 2 },         // lower right
      { dx: -w - g,       dy: g - 2 },         // lower left
    )
  }
  return out
}

/**
 * @param {{x:number,y:number,w:number,h:number}[]} items  dot centre (x, y) and label size, in priority order
 * @param {{x:number,y:number,w:number,h:number}[]} obstacles  rects already on the map (airport dots and labels)
 * @param {{w:number,h:number}} bounds  visible map size
 * @param {{x1:number,y1:number,x2:number,y2:number}[]} [lines]  the route line, as screen segments
 * @returns {({dx:number,dy:number}|null)[]}  per item: label top-left offset from its dot centre, or null = hide
 */
export function placeLabels(items, obstacles, bounds, lines = []) {
  const taken = [
    ...obstacles.map(r => inflate(r, PAD)),
    // every dot is an obstacle for every label, so no label sits on a dot
    ...items.map(it => inflate({ x: it.x - DOT / 2, y: it.y - DOT / 2, w: DOT, h: DOT }, PAD)),
  ]
  const inside = r => r.x >= EDGE && r.y >= EDGE && r.x + r.w <= bounds.w - EDGE && r.y + r.h <= bounds.h - EDGE

  return items.map((it) => {
    if (it.x < 0 || it.y < 0 || it.x > bounds.w || it.y > bounds.h) return null   // dot itself is off screen
    for (const s of spots(it.w, it.h)) {
      const r = { x: it.x + s.dx, y: it.y + s.dy, w: it.w, h: it.h }
      if (!inside(r)) continue
      if (taken.some(t => rectsOverlap(r, t))) continue
      const clear = inflate(r, LINE_PAD)
      if (lines.some(l => segmentHitsRect(l, clear))) continue
      taken.push(inflate(r, PAD))
      return s
    }
    return null
  })
}
