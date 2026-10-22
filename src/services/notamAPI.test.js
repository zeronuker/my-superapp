import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchNotams } from './notamAPI'

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const row = (n, itema) => ({ id: n, series: 'A', number: n, year: 2026, itema, startvalidity: 1, endvalidity: 3_000_000_000 })
const urls = (f) => f.mock.calls.map(([u]) => String(u))

afterEach(() => vi.unstubAllGlobals())

describe('fetchNotams (batched)', () => {
  it('asks autorouter ONCE for several airports and splits the rows back', async () => {
    const f = vi.fn(async () => reply({ total: 3, rows: [row(1, ['WMKK']), row(2, ['WSSS']), row(3, ['WMKK'])] }))
    vi.stubGlobal('fetch', f)

    const { rawPerIcao } = await fetchNotams(['WMKK', 'WSSS', 'WMFC'])

    expect(f).toHaveBeenCalledTimes(1)
    expect(urls(f)[0]).toContain('/api/notam?icaos=WMKK,WSSS,WMFC')
    const by = Object.fromEntries(rawPerIcao.map(e => [e.icao, e]))
    expect(by.WMKK.rows).toHaveLength(2)
    expect(by.WSSS.rows).toHaveLength(1)
    expect(by.WMFC.rows).toEqual([])
    expect(rawPerIcao.every(e => e.source === 'autorouter')).toBe(true)
  })

  it('upper-cases and de-duplicates the request but keeps one entry per input', async () => {
    const f = vi.fn(async () => reply({ total: 1, rows: [row(1, ['WMKK'])] }))
    vi.stubGlobal('fetch', f)

    const { rawPerIcao } = await fetchNotams(['wmkk', 'WMKK'])

    expect(urls(f)[0]).toContain('icaos=WMKK')
    expect(urls(f)[0]).not.toContain('WMKK,WMKK')
    expect(rawPerIcao.map(e => e.icao)).toEqual(['WMKK', 'WMKK'])
  })

  it('falls back to SkyLink for each airport when the batch fails', async () => {
    const f = vi.fn(async (url) => {
      if (String(url).startsWith('/api/notam')) return reply({ error: 'down' }, 503)
      return reply({ notams: [{ notam_id: `SL-${String(url).slice(-4)}` }] })
    })
    vi.stubGlobal('fetch', f)

    const { rawPerIcao } = await fetchNotams(['WMKK', 'WSSS'])

    expect(urls(f).filter(u => u.startsWith('/api/notam'))).toHaveLength(1)
    expect(urls(f).filter(u => u.startsWith('/api/skylink'))).toHaveLength(2)
    expect(rawPerIcao.every(e => e.source === 'skylink')).toBe(true)
  })

  it('splits more than 12 locations into sequential requests', async () => {
    const f = vi.fn(async () => reply({ total: 0, rows: [] }))
    vi.stubGlobal('fetch', f)
    const list = Array.from({ length: 14 }, (_, i) => `WM${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`)

    await fetchNotams(list)

    expect(f).toHaveBeenCalledTimes(2)
    expect(urls(f)[0].split('icaos=')[1].split(',')).toHaveLength(12)
    expect(urls(f)[1].split('icaos=')[1].split(',')).toHaveLength(2)
  })

  it('makes no request for an empty list', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fetchNotams([])).toEqual({ notams: [], rawPerIcao: [] })
    expect(f).not.toHaveBeenCalled()
  })
})
