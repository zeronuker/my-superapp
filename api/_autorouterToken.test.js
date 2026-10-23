import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A stand-in for Vercel's Runtime Cache, shared by every "worker" (module reload) in a test.
const shared = vi.hoisted(() => ({
  store: new Map(),
  namespaces: [],
  get: vi.fn(async (k) => shared.store.get(k) ?? null),
  set: vi.fn(async (k, v) => { shared.store.set(k, v) }),
  delete: vi.fn(async (k) => { shared.store.delete(k) }),
}))
vi.mock('@vercel/functions', () => ({
  getCache: (opts) => { shared.namespaces.push(opts?.namespace); return shared },
}))

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})
const refused = () => reply({ error: 'toomanytokens', error_description: 'limit 20' }, 403)
const ok = (token, expires_in = 3600) => reply({ access_token: token, expires_in })

let getToken, invalidateToken, now, log, warn
const logged = () => [...log.mock.calls, ...warn.mock.calls].map(c => c.join(' ')).join('\n')
const newWorker = async () => {   // a fresh serverless instance: empty memory, same shared cache
  vi.resetModules()
  ;({ getToken, invalidateToken } = await import('./_autorouterToken.js'))
}

beforeEach(async () => {
  shared.store.clear()
  shared.namespaces.length = 0
  shared.get.mockClear(); shared.set.mockClear(); shared.delete.mockClear()
  await newWorker()
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.AUTOROUTER_EMAIL = 'pilot@example.com'
  process.env.AUTOROUTER_PASSWORD = 'secret'
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('getToken', () => {
  it('10 simultaneous callers cause ONE login', async () => {
    const f = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10))
      return ok('T1')
    })
    vi.stubGlobal('fetch', f)
    const tokens = await Promise.all(Array.from({ length: 10 }, () => getToken()))
    expect(f).toHaveBeenCalledTimes(1)
    expect(new Set(tokens)).toEqual(new Set(['T1']))
  })

  it('reuses the cached token on later calls', async () => {
    const f = vi.fn(async () => ok('T1'))
    vi.stubGlobal('fetch', f)
    await getToken()
    await getToken()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps the token until autorouter says it is invalid: no early refresh', async () => {
    const f = vi.fn(async () => ok('T1', 30))
    vi.stubGlobal('fetch', f)
    await getToken()
    now += 3_600_000 * 5   // far past any expiry: only a 401 may replace it
    expect(await getToken()).toBe('T1')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('logs in again after the failed token is invalidated', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2'))
    vi.stubGlobal('fetch', f)
    const t1 = await getToken()
    await invalidateToken(t1)
    expect(await getToken()).toBe('T2')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('two requests failing on the same old token do not discard the new one', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2')).mockResolvedValueOnce(ok('T3'))
    vi.stubGlobal('fetch', f)
    const old = await getToken()      // requests A and B both hold T1
    await invalidateToken(old)        // A got a 401
    expect(await getToken()).toBe('T2')
    await invalidateToken(old)        // B's 401 for T1 arrives late
    expect(await getToken()).toBe('T2')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('explains the 20-token cap in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refused()))
    await expect(getToken()).rejects.toThrow(/too many active tokens/i)
  })

  it('pauses after a refused login, then tries again', async () => {
    const f = vi.fn().mockResolvedValueOnce(refused()).mockResolvedValueOnce(ok('T1'))
    vi.stubGlobal('fetch', f)
    await expect(getToken()).rejects.toThrow(/too many active tokens/i)
    await expect(getToken()).rejects.toThrow(/too many active tokens/i)   // same answer, no new login
    expect(f).toHaveBeenCalledTimes(1)
    now += 31_000
    expect(await getToken()).toBe('T1')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed login: the next call tries again', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply({ error: 'server_error' }, 500))
      .mockResolvedValueOnce(ok('T1'))
    vi.stubGlobal('fetch', f)
    await expect(getToken()).rejects.toThrow(/500/)
    expect(await getToken()).toBe('T1')
  })

  it('does not pause after a timeout: the next call tries again', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(ok('T1'))
    vi.stubGlobal('fetch', f)
    await expect(getToken()).rejects.toThrow()
    expect(await getToken()).toBe('T1')
  })

  it('fails clearly when the env vars are missing', async () => {
    delete process.env.AUTOROUTER_EMAIL
    await expect(getToken()).rejects.toThrow(/AUTOROUTER_EMAIL/)
  })
})

describe('shared cache between workers', () => {
  it('a new login is stored in the shared cache for just under the token lifetime', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1', 259200)))
    await getToken()
    expect(shared.set).toHaveBeenCalledWith('token', 'T1', { ttl: 259200 - 600 })
    expect(new Set(shared.namespaces)).toEqual(new Set(['autorouter']))   // own namespace: the Hobby cache is shared by all projects
  })

  it('a second worker uses the stored token and does not log in', async () => {
    const f = vi.fn(async () => ok('T1'))
    vi.stubGlobal('fetch', f)
    await getToken()                  // worker 1 logs in
    await newWorker()                 // worker 2 starts empty
    expect(await getToken()).toBe('T1')
    expect(f).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.map(c => c[0])).toContain('[autorouter] token from shared cache')
  })

  it('a rejected token is removed from the shared cache and replaced', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2'))
    vi.stubGlobal('fetch', f)
    await invalidateToken(await getToken())
    expect(shared.delete).toHaveBeenCalledWith('token')
    expect(await getToken()).toBe('T2')
    expect(shared.store.get('token')).toBe('T2')
  })

  it("does not delete a newer token another worker has already stored", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    const t1 = await getToken()
    shared.store.set('token', 'T2')   // another worker replaced it
    await invalidateToken(t1)
    expect(shared.delete).not.toHaveBeenCalled()
    expect(shared.store.get('token')).toBe('T2')
  })

  it('never reuses a token it was told is rejected, even if the cache still holds it', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2'))
    vi.stubGlobal('fetch', f)
    const t1 = await getToken()
    shared.delete.mockRejectedValueOnce(new Error('cache down'))   // the delete fails, T1 stays cached
    await invalidateToken(t1)
    expect(await getToken()).toBe('T2')
  })

  it('still logs in when reading the cache fails', async () => {
    shared.get.mockRejectedValueOnce(new Error('cache down'))
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    expect(warn.mock.calls.map(c => c[0]).join('\n')).toMatch(/shared cache read failed/)
  })

  it('still returns the token when writing the cache fails', async () => {
    shared.set.mockRejectedValueOnce(new Error('cache down'))
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    expect(warn.mock.calls.map(c => c[0]).join('\n')).toMatch(/shared cache write failed/)
  })

  it('does not wait forever for a cache that never answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    shared.get.mockImplementationOnce(() => new Promise(() => {}))   // hangs
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    const p = getToken()
    await vi.advanceTimersByTimeAsync(2_500)
    expect(await p).toBe('T1')
  })

  it('works when the shared cache cannot be created at all', async () => {
    shared.get.mockImplementation(() => { throw new Error('no runtime') })
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    shared.get.mockImplementation(async (k) => shared.store.get(k) ?? null)
  })

  it('a refused login still pauses even when the shared cache is empty', async () => {
    const f = vi.fn(async () => refused())
    vi.stubGlobal('fetch', f)
    await getToken().catch(() => {})
    await getToken().catch(() => {})
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('log lines', () => {
  it('says why each new token was requested', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2')))
    await invalidateToken(await getToken())
    await getToken()
    const lines = log.mock.calls.map(c => c[0])
    expect(lines).toEqual([
      '[autorouter] new token: cold start, valid 3600s',
      '[autorouter] new token: after a 401, valid 3600s',
    ])
  })

  it('logs a refused login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refused()))
    await getToken().catch(() => {})
    expect(warn.mock.calls[0][0]).toMatch(/^\[autorouter\] login failed: .*too many active tokens/)
  })

  it('logs a timeout and says a token may have been lost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'TimeoutError' })))
    await getToken().catch(() => {})
    expect(warn.mock.calls[0][0]).toMatch(/login failed: timed out.*may have been issued/)
  })

  it('never logs the email, password or token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok('SECRET-TOKEN-VALUE')).mockResolvedValueOnce(refused()))
    await invalidateToken(await getToken())
    await getToken().catch(() => {})
    expect(logged()).not.toMatch(/secret|pilot@example\.com|SECRET-TOKEN-VALUE/i)
  })
})
