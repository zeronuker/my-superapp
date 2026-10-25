import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupRoute } from './routeAPI'

afterEach(() => vi.unstubAllGlobals())

describe('lookupRoute', () => {
  it('uses the positions that came with an imported OFP route, with no lookup', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const route = { dep: 'WMKK', arr: 'WPDL', routeText: 'WMKK KK701:2.79:101.6833 KADAR:-0.1133:107.7283 WPDL' }
    expect(await lookupRoute(route)).toEqual({
      routeFixes: [{ name: 'KK701', lat: 2.79, lon: 101.6833 }, { name: 'KADAR', lat: -0.1133, lon: 107.7283 }],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still draws nothing when the route does not match the Departure/Arrival boxes', async () => {
    const route = { dep: 'WMKK', arr: 'WSSS', routeText: 'WMKK KK701:2.79:101.6833 WPDL' }
    expect(await lookupRoute(route)).toEqual({})
  })
})
