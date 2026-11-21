import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeather } from './weatherAPI'

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

afterEach(() => vi.unstubAllGlobals())

describe('fetchWeather (failures are not "no report")', () => {
  it('marks METAR and TAF failed when both sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'down' }, 502)))
    const w = await fetchWeather('WMKK', 2)
    expect(w.metar).toEqual([])
    expect(w.taf).toEqual([])
    expect(w.failed).toEqual({ metar: true, taf: true })
  })

  it('marks only the kind that failed on both sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('type=taf') || String(url).includes('resource=taf')) return reply({ error: 'down' }, 502)
      if (String(url).includes('type=metar')) return reply([{ rawOb: 'METAR WMKK' }])
      return reply({}, 500)
    }))
    const w = await fetchWeather('WMKK', 2)
    expect(w.metar).toHaveLength(1)
    expect(w.failed).toEqual({ metar: false, taf: true })
  })

  it('an honest empty answer from the primary source is not a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([])))
    const w = await fetchWeather('WXYZ', 2)
    expect(w.failed).toEqual({ metar: false, taf: false })
    expect(w.metarSource).toBe('aviationweather')
  })

  it('a web page instead of JSON from both sources is a failure, not "no report"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => { throw new SyntaxError('<!doctype') } })))
    const w = await fetchWeather('WMKK', 2)
    expect(w.failed).toEqual({ metar: true, taf: true })
  })
})
