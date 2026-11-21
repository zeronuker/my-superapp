import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllSigmets } from './sigmetAPI'

afterEach(() => vi.unstubAllGlobals())

describe('fetchAllSigmets (failures are not "no SIGMETs")', () => {
  it('throws when the reply is not a list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: 'bad' }) })))
    await expect(fetchAllSigmets()).rejects.toThrow()
  })

  it('throws when the reply is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x') } })))
    await expect(fetchAllSigmets()).rejects.toThrow()
  })

  it('throws on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'down' }) })))
    await expect(fetchAllSigmets()).rejects.toThrow('down')
  })

  it('an empty list is a real "none"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
    expect(await fetchAllSigmets()).toEqual([])
  })
})
