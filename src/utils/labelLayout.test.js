import { describe, it, expect } from 'vitest'
import { placeLabels, rectsOverlap, segmentHitsRect } from './labelLayout'

const BIG = { w: 1000, h: 800 }
const rectOf = (item, pos) => ({ x: item.x + pos.dx, y: item.y + pos.dy, w: item.w, h: item.h })

describe('rectsOverlap', () => {
  it('detects overlap, touching and gaps', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)   // edges only touch
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 30, w: 10, h: 10 })).toBe(false)
  })
})

describe('segmentHitsRect', () => {
  const box = { x: 10, y: 10, w: 20, h: 10 }
  it('hits when the segment crosses the box', () => {
    expect(segmentHitsRect({ x1: 0, y1: 15, x2: 40, y2: 15 }, box)).toBe(true)     // straight through
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 40, y2: 30 }, box)).toBe(true)      // diagonal through
  })
  it('hits when an end is inside the box', () => {
    expect(segmentHitsRect({ x1: 15, y1: 15, x2: 100, y2: 100 }, box)).toBe(true)
  })
  it('misses when the segment passes by', () => {
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 40, y2: 0 }, box)).toBe(false)      // above
    expect(segmentHitsRect({ x1: 0, y1: 40, x2: 40, y2: 40 }, box)).toBe(false)    // below
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 5, y2: 40 }, box)).toBe(false)      // left of it
  })
  it('misses when it stops short of the box', () => {
    expect(segmentHitsRect({ x1: 0, y1: 15, x2: 8, y2: 15 }, box)).toBe(false)
  })
  it('copes with a zero-length segment', () => {
    expect(segmentHitsRect({ x1: 15, y1: 15, x2: 15, y2: 15 }, box)).toBe(true)
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 0, y2: 0 }, box)).toBe(false)
  })
})

describe('placeLabels and the route line', () => {
  const item = { x: 500, y: 400, w: 40, h: 12 }
  const hitsLine = (pos, seg) => segmentHitsRect(seg, { x: item.x + pos.dx, y: item.y + pos.dy, w: item.w, h: item.h })

  it('moves a label off a vertical line that passes through its dot', () => {
    const line = { x1: 500, y1: 300, x2: 500, y2: 500 }
    const [p] = placeLabels([item], [], BIG, [line])
    expect(p).not.toBeNull()
    expect(hitsLine(p, line)).toBe(false)
    expect(p.dy).toBeLessThan(0 + 1)               // beside the line, not on it
  })

  it('moves a label off a diagonal line through its dot', () => {
    const line = { x1: 400, y1: 300, x2: 600, y2: 500 }
    const [p] = placeLabels([item], [], BIG, [line])
    expect(p).not.toBeNull()
    expect(hitsLine(p, line)).toBe(false)
  })

  it('keeps the usual spot when the line is elsewhere', () => {
    const far = { x1: 0, y1: 700, x2: 1000, y2: 700 }
    const [p] = placeLabels([item], [], BIG, [far])
    expect(p.dx).toBe(-20)
    expect(p.dy).toBeLessThan(0)
  })

  it('never returns a spot that touches any of several line segments', () => {
    const lines = [
      { x1: 400, y1: 300, x2: 500, y2: 400 }, { x1: 500, y1: 400, x2: 650, y2: 380 },
      { x1: 650, y1: 380, x2: 700, y2: 300 },
    ]
    const [p] = placeLabels([item], [], BIG, lines)
    if (p) for (const l of lines) expect(hitsLine(p, l)).toBe(false)
  })

  it('hides a label when lines leave no free spot', () => {
    const lines = []
    for (let y = 340; y <= 460; y += 6) lines.push({ x1: 440, y1: y, x2: 560, y2: y })   // a solid block of lines
    expect(placeLabels([item], [], BIG, lines)).toEqual([null])
  })

  it('works without any line', () => {
    expect(placeLabels([item], [], BIG)[0]).not.toBeNull()
  })
})

describe('placeLabels', () => {
  it('puts a lone label above its dot', () => {
    const [p] = placeLabels([{ x: 500, y: 400, w: 40, h: 12 }], [], BIG)
    expect(p.dy).toBeLessThan(0)                       // above
    expect(p.dx).toBe(-20)                             // centred on the dot
  })

  it('moves a label that would sit on an obstacle', () => {
    const item = { x: 500, y: 400, w: 40, h: 12 }
    const blockAbove = { x: 470, y: 370, w: 60, h: 25 }
    const [p] = placeLabels([item], [blockAbove], BIG)
    expect(p).not.toBeNull()
    expect(rectsOverlap(rectOf(item, p), blockAbove)).toBe(false)
  })

  it('returns null when every spot is taken', () => {
    const item = { x: 500, y: 400, w: 40, h: 12 }
    const wall = { x: 400, y: 300, w: 200, h: 200 }
    expect(placeLabels([item], [wall], BIG)).toEqual([null])
  })

  it('two close dots never get overlapping labels', () => {
    const items = [
      { x: 500, y: 400, w: 40, h: 12 },
      { x: 515, y: 404, w: 40, h: 12 },
      { x: 528, y: 396, w: 40, h: 12 },
    ]
    const out = placeLabels(items, [], BIG)
    const rects = items.map((it, i) => out[i] && rectOf(it, out[i])).filter(Boolean)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(rects[i], rects[j])).toBe(false)
    }
  })

  it('a label never covers any dot, including its neighbours', () => {
    const items = [
      { x: 500, y: 400, w: 40, h: 12 },
      { x: 500, y: 385, w: 40, h: 12 },   // sits where the first label would go
    ]
    const out = placeLabels(items, [], BIG)
    for (let i = 0; i < items.length; i++) {
      if (!out[i]) continue
      for (const other of items) {
        const dot = { x: other.x - 3, y: other.y - 3, w: 6, h: 6 }
        expect(rectsOverlap(rectOf(items[i], out[i]), dot)).toBe(false)
      }
    }
  })

  it('keeps the label inside the visible area', () => {
    const item = { x: 500, y: 6, w: 40, h: 12 }        // right at the top edge
    const [p] = placeLabels([item], [], BIG)
    expect(p).not.toBeNull()
    const r = rectOf(item, p)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.w).toBeLessThanOrEqual(BIG.w)
  })

  it('hides a label that is outside the visible area altogether', () => {
    expect(placeLabels([{ x: -50, y: 400, w: 40, h: 12 }], [], BIG)).toEqual([null])
    expect(placeLabels([{ x: 500, y: 2000, w: 40, h: 12 }], [], BIG)).toEqual([null])
  })

  it('earlier items get the better spots (first come, first placed)', () => {
    const a = { x: 500, y: 400, w: 40, h: 12 }
    const b = { x: 500, y: 400, w: 40, h: 12 }         // same place
    const [pa, pb] = placeLabels([a, b], [], BIG)
    expect(pa.dy).toBeLessThan(0)                       // a takes "above"
    expect(pb === null || pb.dy !== pa.dy || pb.dx !== pa.dx).toBe(true)
  })

  it('handles no items', () => {
    expect(placeLabels([], [], BIG)).toEqual([])
  })
})
