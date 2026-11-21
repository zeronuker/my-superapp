import { describe, it, expect, beforeEach, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetchAladhan: vi.fn() }))
vi.mock('./aladhanAPI', () => ({ fetchAladhan: api.fetchAladhan }))

import { getPrayerTimes } from './prayerTimes'

const store = {}
const apiTimes = (date) => ({ Fajr: '05:00', fajrDate: new Date(date.getTime()), source: 'api', timeZone: 'Asia/Kuala_Lumpur', methodId: 17 })
const online = (v) => vi.stubGlobal('navigator', { onLine: v })

beforeEach(() => {
  for (const k in store) delete store[k]
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] } }
  api.fetchAladhan.mockReset()
  vi.unstubAllGlobals()
})

const date = new Date('2026-11-20T04:00:00Z')
const ask = () => getPrayerTimes(3.1, 101.7, date, 'auto', 'shafi', '24hr')

describe('getPrayerTimes (locally calculated times are not kept once online)', () => {
  it('replaces a locally calculated entry with the real times when the phone is online again', async () => {
    online(false)
    const offline = await ask()
    expect(offline.source).toBe('local')
    expect(api.fetchAladhan).not.toHaveBeenCalled()

    online(true)
    api.fetchAladhan.mockImplementation(async (_la, _lo, d) => apiTimes(d))
    const back = await ask()
    expect(back.source).toBe('api')
    expect(api.fetchAladhan).toHaveBeenCalled()
  })

  it('also retries when the phone says it is online but the lookup failed earlier', async () => {
    online(true)
    api.fetchAladhan.mockRejectedValueOnce(new Error('timeout'))
    expect((await ask()).source).toBe('local')
    api.fetchAladhan.mockImplementation(async (_la, _lo, d) => apiTimes(d))
    expect((await ask()).source).toBe('api')
  })

  it('serves a real (api) entry from the cache without asking again', async () => {
    online(true)
    api.fetchAladhan.mockImplementation(async (_la, _lo, d) => apiTimes(d))
    await ask()
    await new Promise(r => setTimeout(r, 30))   // let the background pre-fetch of the next days finish
    const calls = api.fetchAladhan.mock.calls.length
    expect((await ask()).source).toBe('api')
    expect(api.fetchAladhan.mock.calls.length).toBe(calls)
  })

  it('offline, a locally calculated entry is served from the cache', async () => {
    online(false)
    await ask()
    expect((await ask()).source).toBe('local')
    expect(api.fetchAladhan).not.toHaveBeenCalled()
  })
})
