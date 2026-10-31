import { describe, it, expect } from 'vitest'
import {
  mercX, mercY, lngOfX, latOfY, unwrapLng, unwrapPath, frameBBox, toPixel, satBands, bandsForView, wholeView,
  mapImageUrl, overlayUrl, isBlankPicture, bandPieces, probeFrame, PICTURE_W,
} from './satSnapshot'
import { SAT_REGIONS } from './satFrames'

const sat = id => SAT_REGIONS.find(r => r.id === id)
const ids = bands => bands.map(b => b.sat.id)

describe('satSnapshot maths', () => {
  it('projects to Web Mercator', () => {
    expect(mercX(180)).toBeCloseTo(20037508.34, 0)
    expect(mercY(0)).toBeCloseTo(0, 5)
  })

  it('turns a Mercator y back into a latitude', () => {
    for (const lat of [-60, -3.5, 0, 12, 51.5, 75]) expect(latOfY(mercY(lat))).toBeCloseTo(lat, 6)
  })

  it('keeps a date-line crossing in one piece', () => {
    expect(unwrapLng(-118, 200)).toBe(242)
    expect(unwrapPath([[170, 10], [-175, 11], [-120, 12]]).map(p => p[0])).toEqual([170, 185, 240])
  })

  it('frames a route with padding and never closer than the minimum span', () => {
    const f = frameBBox([[101.7, 2.7], [103.9, 1.3]])   // Kuala Lumpur to Singapore
    expect(f.maxX - f.minX).toBeGreaterThanOrEqual(1500000)
    expect(f.width).toBe(PICTURE_W)
    expect(f.height).toBeGreaterThanOrEqual(560)
    expect((f.maxX - f.minX) / (f.maxY - f.minY)).toBeCloseTo(f.width / f.height, 3)
  })

  it('puts a point inside the picture and the box corners at the corners', () => {
    const f = frameBBox([[101.7, 2.7], [103.9, 1.3]])
    const mid = toPixel(102.8, 2, f)
    expect(mid.x).toBeGreaterThan(0); expect(mid.x).toBeLessThan(f.width)
    expect(mid.y).toBeGreaterThan(0); expect(mid.y).toBeLessThan(f.height)
  })

  it('has bands that meet end to end around the globe', () => {
    const bands = satBands()
    expect(bands).toHaveLength(SAT_REGIONS.length)
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBeCloseTo(bands[i - 1].to, 6)
  })

  it('uses one satellite for a short hop in its own area', () => {
    expect(ids(bandsForView(98, 108))).toEqual(['himawari'])
  })

  it('uses three satellites from Kuala Lumpur to London, west to east', () => {
    expect(ids(bandsForView(-10, 110))).toEqual(['mtg', 'iodc', 'himawari'])
  })

  it('covers a Pacific crossing with Himawari then GOES-West', () => {
    expect(ids(bandsForView(95, 245))).toEqual(['himawari', 'goes-west'])
  })

  it('gives one satellite the whole picture for a region still', () => {
    const [b] = wholeView(sat('mtg'), -25, 45)
    expect(b.sat.id).toBe('mtg'); expect(b.from).toBe(-25); expect(b.to).toBe(45)
  })

  it('asks each satellite for just its band of the picture', () => {
    const f = frameBBox([[-5, 50], [105, 5]])
    const [mtg, iodc, himawari] = bandsForView(lngOfX(f.minX), lngOfX(f.maxX))
    const [sub] = bandPieces(f, iodc)
    expect(bandPieces(f, iodc)).toHaveLength(1)
    expect(sub.minX).toBeGreaterThan(f.minX); expect(sub.maxX).toBeLessThan(f.maxX)
    expect(sub.minY).toBe(f.minY); expect(sub.maxY).toBe(f.maxY)
    expect(sub.drawX + sub.drawW).toBeLessThanOrEqual(f.width + 1e-6)
    expect(bandPieces(f, mtg)[0].drawX).toBe(0)
    const last = bandPieces(f, himawari).at(-1)
    expect(last.drawX + last.drawW).toBeCloseTo(f.width, 6)   // the last band ends at the picture's edge
  })

  it('caps the pixels asked of EUMETSAT but keeps the shape', () => {
    const f = frameBBox([[-5, 50], [105, 5]])
    const iodc = bandsForView(lngOfX(f.minX), lngOfX(f.maxX)).find(b => b.sat.id === 'iodc')
    const [sub] = bandPieces(f, iodc)
    expect(sub.width * sub.height).toBeLessThanOrEqual(200000 * 1.02)
    expect(sub.width / sub.height).toBeCloseTo(sub.drawW / f.height, 1)
  })

  it('cuts a band in two at the date line, each side inside the world', () => {
    const f = frameBBox([[100, 3], [-118, 34]].map(([lng, lat], i) => [i ? lng + 360 : lng, lat]))
    const himawari = bandsForView(lngOfX(f.minX), lngOfX(f.maxX)).find(b => b.sat.id === 'himawari')
    const [west, east] = bandPieces(f, himawari)
    expect(west.maxX).toBeCloseTo(mercX(180), 3)
    expect(east.minX).toBeCloseTo(mercX(-180), 3)
    expect(east.maxX).toBeLessThan(mercX(0))
    expect(west.drawX + west.drawW).toBeCloseTo(east.drawX, 6)        // the two sides meet in the picture
    expect(bandPieces(f, himawari).every(p => p.minX >= mercX(-180) - 1e-6 && p.maxX <= mercX(180) + 1e-6)).toBe(true)
  })

  it('builds a GIBS request with bbox, size and time', () => {
    const f = frameBBox([[101.7, 2.7], [103.9, 1.3]])
    const u = mapImageUrl(sat('himawari'), Date.UTC(2026, 9, 31, 7, 40), f)
    expect(u).toContain('wms.cgi')
    expect(u).toContain('LAYERS=Himawari_AHI_Band13_Clean_Infrared')
    expect(u).toContain(`WIDTH=${f.width}`)
    expect(u).toContain('TIME=2026-10-31T07:40:00Z')
  })

  it('builds an EUMETSAT request from the frame it is given', () => {
    const u = mapImageUrl(sat('mtg'), Date.UTC(2026, 9, 31, 8, 10), probeFrame(sat('mtg')))
    expect(u).toContain('view.eumetsat.int')
    expect(u).toContain('layers=mtg_fd:ir105_hrfi')
    expect(u).toContain('width=32&height=32')
    expect(u).toContain('time=2026-10-31T08:10:00.000Z')
  })

  it('asks for an overlay at the same box and size', () => {
    const f = frameBBox([[10, 45], [20, 50]])
    expect(overlayUrl('Coastlines_15m', f)).toContain('LAYERS=Coastlines_15m')
    expect(overlayUrl('Coastlines_15m', f)).toContain(`HEIGHT=${f.height}`)
  })

  it('asks for any other GIBS overlay the same way', () => {
    const f = frameBBox([[10, 45], [20, 50]])
    expect(overlayUrl('BlueMarble_ShadedRelief_Bathymetry', f)).toContain('LAYERS=BlueMarble_ShadedRelief_Bathymetry')
  })

  it('treats a tiny reply as a missing frame', () => {
    expect(isBlankPicture(83)).toBe(true)        // a missing frame at the 32 px probe size
    expect(isBlankPicture(1880)).toBe(false)     // a real one
  })
})
