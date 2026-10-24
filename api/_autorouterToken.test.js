import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A stand-in for the shared store (Firestore), shared by every "worker" (module reload) in a test.
const store = vi.hoisted(() => ({
  token: null,
  read: vi.fn(async () => store.token),
  write: vi.fn(async (t) => { store.token = t }),
  del: vi.fn(async (failed) => { if (store.token === failed) store.token = null }),
}))
vi.mock('./_tokenStore.js', () => ({
  readStoredToken: (...a) => store.read(...a),
  writeStoredToken: (...a) => store.write(...a),
  deleteStoredToken: (...a) => store.del(...a),
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
const warned = () => warn.mock.calls.map(c => c[0]).join('\n')
const loginLines = () => log.mock.calls.map(c => c[0]).filter(l => /new token/.test(l))
const newWorker = async () => {   // a fresh serverless instance: empty memory, same shared store
  vi.resetModules()
  ;({ getToken, invalidateToken } = await import('./_autorouterToken.js'))
}

beforeEach(async () => {
  store.token = null
  store.read.mockClear(); store.write.mockClear(); store.del.mockClear()
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

describe('shared store between workers', () => {
  it('a new login is saved to the shared store with its lifetime', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1', 259200)))
    await getToken()
    expect(store.write).toHaveBeenCalledWith('T1', 259200)
  })

  it('a second worker uses the stored token and does not log in', async () => {
    const f = vi.fn(async () => ok('T1'))
    vi.stubGlobal('fetch', f)
    await getToken()                  // worker 1 logs in
    await newWorker()                 // worker 2 starts empty
    expect(await getToken()).toBe('T1')
    expect(f).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.map(c => c[0]).some(l => /^\[autorouter\] token from shared store \(\d+ ms\)$/.test(l))).toBe(true)
  })

  it('says how long saving and reading took', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    await getToken()
    expect(log.mock.calls.map(c => c[0]).some(l => /^\[autorouter\] token saved to shared store \(\d+ ms\)$/.test(l))).toBe(true)
  })

  it('asks the store to drop a rejected token, then replaces it', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2'))
    vi.stubGlobal('fetch', f)
    await invalidateToken(await getToken())
    expect(store.del).toHaveBeenCalledWith('T1')
    expect(await getToken()).toBe('T2')
    expect(store.token).toBe('T2')
  })

  it('never reuses a token it was told is rejected, even if the store still holds it', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('T1')).mockResolvedValueOnce(ok('T2'))
    vi.stubGlobal('fetch', f)
    const t1 = await getToken()
    store.del.mockRejectedValueOnce(new Error('store down'))   // the delete fails, T1 stays stored
    await invalidateToken(t1)
    expect(await getToken()).toBe('T2')
  })

  it('still logs in when reading the store fails', async () => {
    store.read.mockRejectedValueOnce(new Error('store down'))
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    expect(warned()).toMatch(/shared store read failed/)
  })

  it('still returns the token when saving it fails', async () => {
    store.write.mockRejectedValueOnce(new Error('store down'))
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    expect(warned()).toMatch(/shared store write failed/)
  })

  it('does not wait forever for a store that never answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    store.read.mockImplementationOnce(() => new Promise(() => {}))   // hangs
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    const p = getToken()
    await vi.advanceTimersByTimeAsync(5_500)
    expect(await p).toBe('T1')
    expect(warned()).toMatch(/shared store read failed: timed out/)
  })

  it('gives the store time to wake up: no give-up before 4 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    store.read.mockImplementationOnce(() => new Promise(r => setTimeout(() => r('SLOW'), 3_500)))   // a cold Firestore
    const f = vi.fn(async () => ok('T1'))
    vi.stubGlobal('fetch', f)
    const p = getToken()
    await vi.advanceTimersByTimeAsync(3_600)
    expect(await p).toBe('SLOW')
    expect(f).not.toHaveBeenCalled()
  })

  it('works when the store cannot be reached at all', async () => {
    store.read.mockImplementation(() => { throw new Error('no firebase') })
    vi.stubGlobal('fetch', vi.fn(async () => ok('T1')))
    expect(await getToken()).toBe('T1')
    store.read.mockImplementation(async () => store.token)
  })

  it('a refused login still pauses even when the shared store is empty', async () => {
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
    expect(loginLines()).toEqual([
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
