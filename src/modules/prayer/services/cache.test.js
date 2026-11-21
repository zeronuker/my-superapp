import { describe, it, expect, beforeEach } from 'vitest'
import { getCached, saveCache } from './cache'

const store = {}
beforeEach(() => {
  for (const k in store) delete store[k]
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] } }
})

// Makkah is UTC+3. Fajr 05:00 there on 20 Nov = 02:00Z.
const makkahFajr = (day) => new Date(`2026-11-${day}T02:00:00Z`)
const entry = (fajrDate, extra = {}) => ({ fajrDate, timeZone: 'Asia/Riyadh', source: 'api', Fajr: '05:00', ...extra })
const args = (date) => [21.4, 39.8, date, 'auto', 'shafi', '24hr']

describe('getCached (the day is the place\'s day, not the device\'s)', () => {
  it('serves an entry for the same place day', () => {
    const date = new Date('2026-11-20T10:00:00Z')
    saveCache(...args(date), entry(makkahFajr('20')))
    expect(getCached(...args(new Date('2026-11-20T10:10:00Z')))?.Fajr).toBe('05:00')
  })

  it('does not serve yesterday\'s times once it is the next day at the place', () => {
    // 20:55Z is 23:55 on the 20th in Makkah; 21:05Z is 00:05 on the 21st. A device east of Makkah
    // can still be on one calendar day for both, so the key matches: the place's day must decide.
    saveCache(...args(new Date('2026-11-20T20:55:00Z')), entry(makkahFajr('20')))
    expect(getCached(...args(new Date('2026-11-20T21:05:00Z')))).toBeNull()
  })

  it('still rejects an entry with no zone that is from another device day', () => {
    const date = new Date('2026-11-20T10:00:00Z')
    saveCache(...args(date), { fajrDate: new Date('2026-11-18T02:00:00Z'), source: 'local', Fajr: '05:00' })
    expect(getCached(...args(date))).toBeNull()
  })
})
