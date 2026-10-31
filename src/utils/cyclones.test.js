import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseStormList, summarizeStormGeometry, stormReachesArea, distanceToRoute, stormsInRegion, shortTime, kmhToKt, ALERT_COLOR,
} from './cyclones'

// Real GDACS files for typhoon IN-FA-26 (31 Oct 2026, advisory 06Z), with the big rings thinned out.
const read = name => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))
const list = parseStormList(read('gdacs_tc_list.json'))
const infa = list.find(s => s.name === 'IN-FA-26')
const geo = summarizeStormGeometry(read('gdacs_tc_geometry.json'), infa.position)

describe('parseStormList', () => {
  it('keeps current cyclones and drops other disasters', () => {
    expect(list.map(s => s.name)).toEqual(['IN-FA-26', 'VANCE-26'])
  })

  it('reads position, alert, source, wind and where the geometry is', () => {
    expect(infa.position).toEqual([142.9, 22.2])
    expect(infa.alert).toBe('Green')
    expect(infa.source).toBe('JTWC')
    expect(infa.windKmh).toBeCloseTo(240.7, 1)
    expect(infa.geometryUrl).toMatch(/getgeometry\?eventtype=TC&eventid=1001343/)
    expect(Number.isFinite(infa.updatedMs)).toBe(true)
  })

  it('copes with an empty or odd feed', () => {
    expect(parseStormList(null)).toEqual([])
    expect(parseStormList({ features: [{ properties: { eventtype: 'TC', iscurrent: 'false' } }] })).toEqual([])
  })
})

describe('summarizeStormGeometry', () => {
  it('chains the track from genesis to the end of the forecast', () => {
    expect(geo.track).toHaveLength(33)
    expect(geo.track[0]).toEqual([165, 12])
    expect(geo.track.at(-1)).toEqual([142.7, 29.2])
  })

  it('knows which track point is now, and names the forecast points by time', () => {
    expect(geo.track[geo.nowIndex]).toEqual([142.9, 22.2])
    expect(geo.forecast.length).toBeGreaterThanOrEqual(6)
    expect(geo.forecast[0].label).toBe('31/10 18Z')
    expect(geo.forecast.at(-1).label).toBe('05/11 06Z')
    expect(geo.forecast.every(f => f.index > geo.nowIndex)).toBe(true)
  })

  it('has the cone and the current wind areas, innermost last', () => {
    expect(geo.cone.length).toBeGreaterThan(20)
    expect(geo.cone.length).toBeLessThanOrEqual(120)
    expect(geo.radii.map(r => r.kmh)).toEqual([60, 90, 120])
    expect(geo.radii.every(r => r.ring.length <= 80)).toBe(true)
  })

  it('carries the advisory time', () => {
    expect(geo.advisory).toBe('2026-10-31T06:00:00')
  })

  it('gives back something usable for an empty file', () => {
    const empty = summarizeStormGeometry({ features: [] }, [0, 0])
    expect(empty.track).toEqual([]); expect(empty.cone).toBeNull(); expect(empty.radii).toEqual([])
  })
})

describe('stormReachesArea', () => {
  it('is in a picture over Japan and the western Pacific, not in one over Europe', () => {
    expect(stormReachesArea(infa.position, geo, { west: 120, east: 160, south: 10, north: 45 })).toBe(true)
    expect(stormReachesArea(infa.position, geo, { west: -20, east: 40, south: 30, north: 60 })).toBe(false)
  })

  it('counts a cone that only just reaches in, and uses the margin', () => {
    expect(stormReachesArea(infa.position, geo, { west: 100, east: 135, south: 0, north: 40 }, 3)).toBe(true)
  })

  it('works across the date line', () => {
    expect(stormReachesArea(infa.position, geo, { west: 150, east: 230, south: 0, north: 50 }, 12)).toBe(true)
  })
})

describe('distanceToRoute', () => {
  const route = [[101.7, 2.7], [120, 20], [139.8, 35.5]]        // Kuala Lumpur towards Tokyo

  it('measures from the route to the storm now, and to the forecast track or cone', () => {
    const d = distanceToRoute(infa.position, geo, route)
    expect(d.nowNm).toBeGreaterThan(300)
    expect(d.forecastNm).toBeLessThanOrEqual(d.nowNm)
  })

  it('is null without a route', () => {
    expect(distanceToRoute(infa.position, geo, [])).toBeNull()
  })
})

describe('stormsInRegion', () => {
  const region = box => ({ box })

  it('puts the typhoon in Asia-Pacific and the eastern Pacific storm in the Americas, not the other way round', () => {
    expect(stormsInRegion(list, region([70, -20, 165, 45])).map(s => s.name)).toEqual(['IN-FA-26'])
    expect(stormsInRegion(list, region([-110, -25, -20, 55])).map(s => s.name)).toEqual(['VANCE-26'])
    expect(stormsInRegion(list, region([-170, 0, -100, 55])).map(s => s.name)).toEqual(['VANCE-26'])
  })

  it('has nothing for a region with no storm', () => {
    expect(stormsInRegion(list, region([-25, -15, 45, 62]))).toEqual([])
  })

  it('counts a storm just outside the edge, but only by the margin', () => {
    expect(stormsInRegion(list, region([70, -20, 140, 45]), 5).map(s => s.name)).toEqual(['IN-FA-26'])   // 142.9 is 2.9° outside
    expect(stormsInRegion(list, region([70, -20, 130, 45]), 5)).toEqual([])                              // 12.9° outside
  })

  it('works across the date line', () => {
    expect(stormsInRegion(list, region([120, 0, 200, 50]), 0).map(s => s.name)).toEqual(['IN-FA-26'])
  })
})

describe('small helpers', () => {
  it('shortens a time label', () => { expect(shortTime('01/11 06:00 UTC')).toBe('01/11 06Z') })
  it('converts km/h to knots', () => { expect(kmhToKt(185.2)).toBeCloseTo(100, 6) })
  it('has a colour for each alert level', () => { expect(Object.keys(ALERT_COLOR)).toEqual(['Green', 'Orange', 'Red']) })
})
