import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTimeout } from './fetchTimeout'

afterEach(() => vi.unstubAllGlobals())

describe('fetchTimeout', () => {
  it('passes the request on with a time limit and returns the answer', async () => {
    const f = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', f)
    const r = await fetchTimeout('/x', { method: 'PUT' })
    expect(r).toEqual({ ok: true })
    expect(f.mock.calls[0][0]).toBe('/x')
    expect(f.mock.calls[0][1].method).toBe('PUT')
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('turns a timeout into a plain sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }))
    await expect(fetchTimeout('/x')).rejects.toThrow(/took too long/)
  })

  it('lets other failures (offline) through unchanged', async () => {
    const boom = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn(async () => { throw boom }))
    await expect(fetchTimeout('/x')).rejects.toBe(boom)
  })

  it('really gives up on a request that never answers', async () => {
    vi.stubGlobal('fetch', (_u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))))
    await expect(fetchTimeout('/x', {}, 20)).rejects.toThrow(/took too long/)
  })
})
