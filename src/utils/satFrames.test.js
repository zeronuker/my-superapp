import { describe, it, expect } from 'vitest'
import { frameIso, floorToStep, capsUrl, latestFromCapabilities, regionStep, SAT_REGIONS } from './satFrames'

const T = Date.UTC(2026, 9, 31, 7, 43, 21, 500)
const byId = id => SAT_REGIONS.find(r => r.id === id)

describe('satFrames', () => {
  it('formats the GIBS time without milliseconds', () => {
    expect(frameIso(Date.UTC(2026, 9, 31, 7, 40))).toBe('2026-10-31T07:40:00Z')
  })

  it('rounds down to the frame step', () => {
    expect(frameIso(floorToStep(T))).toBe('2026-10-31T07:40:00Z')
    expect(frameIso(floorToStep(T, 15))).toBe('2026-10-31T07:30:00Z')
  })

  it('points at the layer-only capabilities file for EUMETSAT', () => {
    expect(capsUrl(byId('mtg'))).toBe(
      'https://view.eumetsat.int/geoserver/mtg_fd/ir105_hrfi/wms?service=WMS&version=1.3.0&request=GetCapabilities')
  })

  it('reads the newest time from a capabilities file', () => {
    const xml = '<Dimension name="time" default="2026-10-31T08:15:00Z" units="ISO8601" nearestValue="1">2020-08-01T00:00:00.000Z/2026-10-31T08:15:00.000Z/PT15M</Dimension>'
    expect(latestFromCapabilities(xml)).toBe(Date.UTC(2026, 9, 31, 8, 15))
    expect(latestFromCapabilities('<nothing/>')).toBeNull()
  })

  it('gives each satellite its own step', () => {
    expect(regionStep(byId('iodc'))).toBe(15)
    expect(regionStep(byId('himawari'))).toBe(10)
  })
})
