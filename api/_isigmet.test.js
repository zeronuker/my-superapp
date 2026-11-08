import { describe, it, expect, vi, afterEach } from 'vitest'
import handler, { gdacsTarget } from './isigmet.js'

const GEOMETRY = 'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=1001347&episodeid=9'

describe('gdacsTarget', () => {
  it('allows the storm list and a storm geometry file', () => {
    expect(gdacsTarget('list')).toContain('geteventlist/EVENTS4APP?eventlist=TC')
    expect(gdacsTarget(GEOMETRY)).toBe(GEOMETRY)
  })
  it('refuses anything else', () => {
    for (const bad of [
      'https://evil.example/x',
      'http://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=1&episodeid=9',
      'https://www.gdacs.org.evil.example/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=1&episodeid=9',
      'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=1&episodeid=9&x=1',
      'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=abc&episodeid=9',
      'https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=TC&eventid=1',
      '', 'LIST',
    ]) expect(gdacsTarget(bad)).toBeNull()
  })
})

function call(query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  return handler({ query, headers: {}, socket: { remoteAddress: `test-${Math.random()}` } }, res).then(() => res)
}

describe('handler', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers 400 for a gdacs address that is not allowed, without calling out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({ gdacs: 'https://evil.example/x' })
    expect(res.code).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the GDACS list when asked and passes the data on', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({ gdacs: 'list' })
    expect(fetchMock.mock.calls[0][0]).toContain('gdacs.org/gdacsapi/api/events/geteventlist')
    expect(res.code).toBe(200)
    expect(res.body).toEqual({ features: [] })
  })

  it('reports a GDACS failure as 502, and a bot-check page (not JSON) as 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) }))
    expect((await call({ gdacs: 'list' })).code).toBe(502)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } }))
    expect((await call({ gdacs: 'list' })).code).toBe(502)
  })

  it('still serves the SIGMET feed with no gdacs parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] })
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({})
    expect(fetchMock.mock.calls[0][0]).toContain('aviationweather.gov/api/data/isigmet')
    expect(res.body).toEqual([{ id: 1 }])
  })
})
