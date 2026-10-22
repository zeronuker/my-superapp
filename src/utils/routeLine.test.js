import { describe, it, expect } from 'vitest'
import { routeLineCoords } from './routeLine'

describe('routeLineCoords', () => {
  it('starts and ends exactly at the first and last point, as [lng, lat]', () => {
    const c = routeLineCoords([{ lat: 3.1, lng: 101.5 }, { lat: 5.3, lng: 100.3 }])
    expect(c[0]).toEqual([101.5, 3.1])
    expect(c.at(-1)).toEqual([100.3, 5.3])
  })

  it('passes through every fix in order', () => {
    const pts = [
      { lat: 3.1, lng: 101.5 }, { lat: 3.7, lng: 101.0 }, { lat: 4.2, lng: 100.8 }, { lat: 5.3, lng: 100.3 },
    ]
    const c = routeLineCoords(pts)
    let from = 0
    for (const p of pts) {
      const at = c.findIndex(([lng, lat], i) => i >= from && lng === p.lng && lat === p.lat)
      expect(at).toBeGreaterThanOrEqual(from)
      from = at
    }
  })

  it('adds points along a long leg so it bends with the earth', () => {
    const short = routeLineCoords([{ lat: 3.1, lng: 101.5 }, { lat: 3.5, lng: 101.9 }])
    const long = routeLineCoords([{ lat: 3, lng: 101 }, { lat: 23, lng: 120 }])   // ~1,500 NM
    expect(short).toHaveLength(2)
    expect(long.length).toBeGreaterThan(10)
  })

  it('does not repeat the join point between two legs', () => {
    const c = routeLineCoords([{ lat: 0, lng: 100 }, { lat: 10, lng: 110 }, { lat: 20, lng: 120 }])
    const keys = c.map(p => p.join(','))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('copes with two identical points', () => {
    const c = routeLineCoords([{ lat: 3, lng: 101 }, { lat: 3, lng: 101 }])
    expect(c).toEqual([[101, 3], [101, 3]])
  })

  it('returns what it was given when there is nothing to join', () => {
    expect(routeLineCoords([])).toEqual([])
    expect(routeLineCoords([{ lat: 1, lng: 2 }])).toEqual([[2, 1]])
  })
})
