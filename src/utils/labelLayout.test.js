import { describe, it, expect } from 'vitest'
import { placeLabels, rectsOverlap } from './labelLayout'

const BIG = { w: 1000, h: 800 }
const rectOf = (item, pos) => ({ x: item.x + pos.dx, y: item.y + pos.dy, w: item.w, h: item.h })

describe('rectsOverlap', () => {
  it('detects overlap, touching and gaps', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)   // edges only touch
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 30, w: 10, h: 10 })).toBe(false)
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
