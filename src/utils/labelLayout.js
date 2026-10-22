// Pure label placement for the fix names drawn along a route (CartoRouteMap).
// Each label is tried in a few spots around its dot and takes the first one
// that doesn't touch an airport label/dot, another fix's dot or label, or the
// edge of the map. A label with no free spot is hidden (zooming in frees room).
// All numbers are screen pixels, rects are { x, y, w, h } with (x, y) top-left.

const GAP = 5        // dot centre -> label edge
const DOT = 6        // fix dot is a DOT x DOT square centred on the point
const PAD = 2        // clear space kept around every label
const EDGE = 2       // clear space kept from the map edge

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const inflate = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p })

// Offsets of the label's top-left corner from the dot centre, best spot first.
const spots = (w, h) => [
  { dx: -w / 2,     dy: -h - GAP },        // above
  { dx: -w / 2,     dy: GAP },             // below
  { dx: GAP + 1,    dy: -h / 2 },          // right
  { dx: -w - GAP - 1, dy: -h / 2 },        // left
  { dx: GAP,        dy: -h - GAP + 2 },    // upper right
  { dx: -w - GAP,   dy: -h - GAP + 2 },    // upper left
  { dx: GAP,        dy: GAP - 2 },         // lower right
  { dx: -w - GAP,   dy: GAP - 2 },         // lower left
]

/**
 * @param {{x:number,y:number,w:number,h:number}[]} items  dot centre (x, y) and label size, in priority order
 * @param {{x:number,y:number,w:number,h:number}[]} obstacles  rects already on the map (airport dots and labels)
 * @param {{w:number,h:number}} bounds  visible map size
 * @returns {({dx:number,dy:number}|null)[]}  per item: label top-left offset from its dot centre, or null = hide
 */
export function placeLabels(items, obstacles, bounds) {
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
      taken.push(inflate(r, PAD))
      return s
    }
    return null
  })
}
