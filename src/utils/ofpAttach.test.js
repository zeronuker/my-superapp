import { describe, it, expect } from 'vitest'
import { flightDetailsFrom, ofpWaypoints, ofpMismatch, applyOfp } from './ofpAttach'

const fields = (over = {}) => ({
  dep: 'WMKK', arr: 'OPKC', flight: 'MH2623', info: { std: '2026-11-04T10:00:00Z' },
  details: { dep: 'WMKK', arr: 'OPKC', route: 'DCT' },
  routeText: 'WMKK KK701:2.7933:101.6917 KADAR:-0.1133:107.7283 OPKC', ...over,
})
const save = () => ({
  id: 's1', name: 'My brief', savedAt: 1, mapSnapshot: 'old-map', satSnapshot: { image: 'sat' },
  route: { dep: 'WMKK', arr: 'OPKC', routeText: 'WMKK DCT OPKC', destAlts: { alt1: 'OPLA', alt2: '' }, firs: [{ icao: 'WMFC' }] },
  data: { airports: [{ icao: 'WMKK' }], notamsByIcao: {}, routeError: 'lookup failed' },
})

describe('flightDetailsFrom', () => {
  it('puts the flight, info and time zones beside the details', () => {
    expect(flightDetailsFrom(fields(), 'Asia/Kuala_Lumpur', 'Asia/Karachi')).toMatchObject({
      dep: 'WMKK', flight: 'MH2623', info: { std: '2026-11-04T10:00:00Z' }, depTz: 'Asia/Kuala_Lumpur', arrTz: 'Asia/Karachi',
    })
  })
})

describe('ofpWaypoints', () => {
  it('reads the positioned fixes from the route text', () => {
    expect(ofpWaypoints(fields()).map(p => p.name)).toEqual(['KK701', 'KADAR'])
  })
  it('is null when the OFP has no positions', () => {
    expect(ofpWaypoints(fields({ routeText: 'WMKK OPKC' }))).toBeNull()
  })
})

describe('ofpMismatch', () => {
  it('is null when departure and arrival agree', () => {
    expect(ofpMismatch({ dep: 'WMKK', arr: 'OPKC' }, fields())).toBeNull()
  })
  it('names both flights when they differ', () => {
    expect(ofpMismatch({ dep: 'WMKK', arr: 'VHHH' }, fields())).toBe('This OFP is WMKK → OPKC, but this briefing is WMKK → VHHH.')
  })
})

describe('applyOfp', () => {
  it('adds the flight details and waypoints and clears an old route error', () => {
    const fd = flightDetailsFrom(fields())
    const { route, data } = applyOfp(save(), fields(), fd)
    expect(route.flightDetails).toBe(fd)
    expect(route.routeText).toBe(fields().routeText)
    expect(data.routeFixes.map(p => p.name)).toEqual(['KK701', 'KADAR'])
    expect(data.routeError).toBeUndefined()
  })
  it('leaves everything else of the save as it was', () => {
    const s = save()
    const { route, data } = applyOfp(s, fields({ destAlts: { alt1: 'XXXX' }, firs: [{ icao: 'ZZZZ' }] }), flightDetailsFrom(fields()))
    expect(route.destAlts).toBe(s.route.destAlts)
    expect(route.firs).toBe(s.route.firs)
    expect(route.dep).toBe('WMKK')
    expect(data.airports).toBe(s.data.airports)
    expect(data.notamsByIcao).toBe(s.data.notamsByIcao)
  })
  it('keeps the old route when the OFP has no positions', () => {
    const s = save()
    const { route, data } = applyOfp(s, fields({ routeText: 'WMKK OPKC' }), flightDetailsFrom(fields()))
    expect(route.routeText).toBe('WMKK DCT OPKC')
    expect(data).toBe(s.data)
  })
})
