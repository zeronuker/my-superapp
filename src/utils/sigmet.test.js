import { describe, it, expect } from 'vitest'
import { normalizeSigmet, filterSigmetsByFir, reviveSigmets, fmtHazard, hazardColor, fmtSigmetAlt, fmtSigmetTime } from './sigmet'

// Shape confirmed against a live /isigmet response (aviationweather.gov,
// 10 Jul 2026) — including a real Malaysia-region entry.
const RAW_WMKK = {
  icaoId: 'WMKK', firId: 'WBFC', firName: 'WBFC KOTA KINABALU',
  validTimeFrom: 1783652400, validTimeTo: 1783663200,
  hazard: 'TS', qualifier: 'EMBD', base: null, top: 52000,
  dir: '-', spd: '0', chng: 'NC',
  rawSigmet: 'WSMS31 WMKK 100244\nWBFC SIGMET 1 VALID 100300/100600 WBKK-\nWBFC KOTA KINABALU FIR EMBD TS TOP FL520 STNR NC=',
}
const RAW_MOVING = {
  icaoId: 'RCTP', firId: 'RCAA', firName: 'RCAA TAIPEI',
  validTimeFrom: 1783659600, validTimeTo: 1783674000,
  hazard: 'TS', qualifier: 'EMBD', base: null, top: 48000,
  dir: 'W', spd: '20', chng: 'NC',
  rawSigmet: 'WSCI31 RCTP 100434\nRCAA SIGMET 2 VALID 100500/100900 RCTP-',
}

describe('normalizeSigmet', () => {
  it('maps hazard/qualifier/altitude/validity', () => {
    const s = normalizeSigmet(RAW_WMKK)
    expect(s.firId).toBe('WBFC')
    expect(s.firName).toBe('WBFC KOTA KINABALU')
    expect(s.hazard).toBe('TS')
    expect(s.qualifier).toBe('EMBD')
    expect(s.top).toBe(52000)
    expect(s.base).toBeNull()
    expect(s.validFrom).toBeInstanceOf(Date)
    expect(s.validTo).toBeInstanceOf(Date)
    expect(s.raw).toContain('WBFC SIGMET 1')
  })
  it('treats placeholder movement values ("-", "0", "NC") as no data', () => {
    const s = normalizeSigmet(RAW_WMKK)
    expect(s.dir).toBeNull()
    expect(s.spd).toBeNull()
    expect(s.chng).toBeNull()
  })
  it('keeps real movement data', () => {
    const s = normalizeSigmet(RAW_MOVING)
    expect(s.dir).toBe('W')
    expect(s.spd).toBe('20')
  })
})

describe('filterSigmetsByFir', () => {
  const sigmets = [normalizeSigmet(RAW_WMKK), normalizeSigmet(RAW_MOVING)]
  it('keeps only SIGMETs in the requested FIRs', () => {
    const result = filterSigmetsByFir(sigmets, new Set(['WBFC']))
    expect(result).toHaveLength(1)
    expect(result[0].firId).toBe('WBFC')
  })
  it('returns nothing for an empty FIR set', () => {
    expect(filterSigmetsByFir(sigmets, new Set())).toEqual([])
  })
})

describe('fmtHazard / hazardColor', () => {
  it('expands known hazard codes', () => { expect(fmtHazard('TS')).toBe('Thunderstorm') })
  it('falls back to the raw code for unknown hazards', () => { expect(fmtHazard('XYZ')).toBe('XYZ') })
  it('colors turbulence orange and thunderstorm red', () => {
    expect(hazardColor('TURB')).toBe('var(--cp-orange)')
    expect(hazardColor('TS')).toBe('var(--cp-red)')
  })
})

describe('fmtSigmetAlt', () => {
  it('shows flight levels above 18000 ft', () => { expect(fmtSigmetAlt(52000)).toBe('FL520') })
  it('shows feet below 18000 ft', () => { expect(fmtSigmetAlt(3000)).toBe('3,000 ft') })
  it('returns null for missing altitude', () => { expect(fmtSigmetAlt(null)).toBeNull() })
})

describe('fmtSigmetTime', () => {
  it('formats a Date as HHMMZ', () => { expect(fmtSigmetTime(new Date(Date.UTC(2026, 6, 10, 3, 0)))).toBe('0300Z') })
  it('returns null for missing time', () => { expect(fmtSigmetTime(null)).toBeNull() })
})

describe('reviveSigmets', () => {
  it('turns JSON-round-tripped ISO strings back into Dates (the old Saved Briefings case)', () => {
    const stored = JSON.parse(JSON.stringify([normalizeSigmet(RAW_WMKK)]))
    expect(typeof stored[0].validTo).toBe('string')
    const [s] = reviveSigmets(stored)
    expect(s.validFrom).toBeInstanceOf(Date)
    expect(s.validTo).toBeInstanceOf(Date)
    expect(s.validTo.getTime()).toBe(RAW_WMKK.validTimeTo * 1000)
    expect(fmtSigmetTime(s.validTo)).toBe(fmtSigmetTime(new Date(RAW_WMKK.validTimeTo * 1000)))
  })
  it('keeps already-live Dates (and the same moment in time)', () => {
    const live = [normalizeSigmet(RAW_WMKK)]
    const [s] = reviveSigmets(live)
    expect(s.validTo).toBeInstanceOf(Date)
    expect(s.validTo.getTime()).toBe(live[0].validTo.getTime())
  })
  it('leaves missing times as null and keeps every other field', () => {
    const [s] = reviveSigmets([{ hazard: 'TS', validFrom: null, validTo: undefined, raw: 'X' }])
    expect(s.validFrom).toBeNull()
    expect(s.validTo).toBeNull()
    expect(s.hazard).toBe('TS')
    expect(s.raw).toBe('X')
  })
  it('returns [] for undefined / null input and does not mutate the input', () => {
    expect(reviveSigmets(undefined)).toEqual([])
    expect(reviveSigmets(null)).toEqual([])
    const stored = [{ validTo: '2026-10-10T06:00:00.000Z' }]
    reviveSigmets(stored)
    expect(typeof stored[0].validTo).toBe('string')
  })
})
