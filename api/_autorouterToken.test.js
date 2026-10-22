import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getToken, invalidateToken } from './_autorouterToken.js'

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

beforeEach(() => {
  invalidateToken()
  process.env.AUTOROUTER_EMAIL = 'pilot@example.com'
  process.env.AUTOROUTER_PASSWORD = 'secret'
})
afterEach(() => vi.unstubAllGlobals())

describe('getToken', () => {
  it('10 simultaneous callers cause ONE login', async () => {
    const f = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10))
      return reply({ access_token: 'T1', expires_in: 3600 })
    })
    vi.stubGlobal('fetch', f)
    const tokens = await Promise.all(Array.from({ length: 10 }, () => getToken()))
    expect(f).toHaveBeenCalledTimes(1)
    expect(new Set(tokens)).toEqual(new Set(['T1']))
  })

  it('reuses the cached token on later calls', async () => {
    const f = vi.fn(async () => reply({ access_token: 'T1', expires_in: 3600 }))
    vi.stubGlobal('fetch', f)
    await getToken()
    await getToken()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('logs in again after invalidateToken()', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply({ access_token: 'T1', expires_in: 3600 }))
      .mockResolvedValueOnce(reply({ access_token: 'T2', expires_in: 3600 }))
    vi.stubGlobal('fetch', f)
    expect(await getToken()).toBe('T1')
    invalidateToken()
    expect(await getToken()).toBe('T2')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('logs in again once the token is about to expire', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply({ access_token: 'T1', expires_in: 30 })) // < 60 s margin
      .mockResolvedValueOnce(reply({ access_token: 'T2', expires_in: 3600 }))
    vi.stubGlobal('fetch', f)
    expect(await getToken()).toBe('T1')
    expect(await getToken()).toBe('T2')
  })

  it('explains the 20-token cap in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(
      { error: 'toomanytokens', error_description: 'You have too many active access tokens (limit 20).' }, 403)))
    await expect(getToken()).rejects.toThrow(/too many active tokens/i)
  })

  it('does not cache a failed login: the next call tries again', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply({ error: 'server_error' }, 500))
      .mockResolvedValueOnce(reply({ access_token: 'T1', expires_in: 3600 }))
    vi.stubGlobal('fetch', f)
    await expect(getToken()).rejects.toThrow(/500/)
    expect(await getToken()).toBe('T1')
  })

  it('fails clearly when the env vars are missing', async () => {
    delete process.env.AUTOROUTER_EMAIL
    await expect(getToken()).rejects.toThrow(/AUTOROUTER_EMAIL/)
  })
})
