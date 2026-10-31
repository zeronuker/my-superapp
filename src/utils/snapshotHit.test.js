import { describe, it, expect } from 'vitest'
import { projectToPicture, featuresAt, tapOnContainedImage } from './snapshotHit'

const view = { lng: 100, lat: 10, zoom: 4, w: 800, h: 500 }
const square = (lng, lat, d) => ({
  properties: { title: 'T' },
  geometry: { coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] },
})

describe('snapshotHit', () => {
  it('puts the view centre in the middle of the picture', () => {
    const p = projectToPicture(view, 100, 10)
    expect(p.x).toBeCloseTo(0.5)
    expect(p.y).toBeCloseTo(0.5)
  })
  it('east is right, north is up', () => {
    const p = projectToPicture(view, 102, 12)
    expect(p.x).toBeGreaterThan(0.5)
    expect(p.y).toBeLessThan(0.5)
  })
  it('hits a zone around the centre and misses elsewhere', () => {
    const f = [square(100, 10, 2)]
    expect(featuresAt(view, f, 0.5, 0.5)).toHaveLength(1)
    expect(featuresAt(view, f, 0.05, 0.05)).toHaveLength(0)
  })
  it('handles a ring written 360° away', () => {
    expect(featuresAt(view, [square(-260, 10, 2)], 0.5, 0.5)).toHaveLength(1)
  })
  it('maps a tap through object-fit: contain, rejecting the margin', () => {
    expect(tapOnContainedImage(400, 250, 800, 500, 400, 500)).toEqual({ fx: 0.5, fy: 0.5 })
    expect(tapOnContainedImage(10, 250, 800, 500, 400, 500)).toBeNull()
  })
})
