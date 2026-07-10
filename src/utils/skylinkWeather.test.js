import { describe, it, expect } from 'vitest'
import { skylinkMetarToAWCShape, skylinkTafToAWCShape } from './skylinkWeather'
import { getMetarFlightCat, getWindSev } from './metarSeverity'

// Shape confirmed against live /weather/metar/WMKK and /weather/taf/WMKK
// responses (RapidAPI console + production, 10 Jul 2026).
const RAW_METAR = {
  raw: 'METAR WMKK 100530Z VRB04KT 9000 SCT018 32/24 Q1010 NOSIG',
  icao: 'WMKK', airport_name: 'Kuala Lumpur International Airport',
  timestamp: '2026-07-10T05:48:39.357119Z',
}
const RAW_TAF = {
  raw: 'TAF WMKK 100500Z 1006/1112 VRB03KT 9999 FEW018 PROB30 1007/1011 5000 TSRA FEW017CB',
  icao: 'WMKK', airport_name: 'Kuala Lumpur International Airport',
  timestamp: '2026-07-10T05:49:08.415311Z',
}

describe('skylinkMetarToAWCShape', () => {
  it('parses wind, temp/dewp, QNH, visibility (converted to statute miles), and cloud layers', () => {
    const m = skylinkMetarToAWCShape(RAW_METAR)
    expect(m.rawOb).toBe(RAW_METAR.raw)
    expect(m.icaoId).toBe('WMKK')
    expect(m.name).toBe('Kuala Lumpur International Airport')
    expect(m.wdir).toBe('VRB')
    expect(m.wspd).toBe(4)
    expect(m.wgst).toBeUndefined()
    expect(m.temp).toBe(32)
    expect(m.dewp).toBe(24)
    expect(m.altim).toBe(1010)
    // 9000 m ICAO visibility, round-tripped through the SM convention
    // getMetarFlightCat expects — must come back to ~9000 m, not 9000 SM.
    expect(m.visib).toBeCloseTo(9000 / 1609.34, 5)
    expect(m.clouds).toEqual([{ cover: 'SCT', base: 1800 }])
    expect(m.wxString).toBe('')
  })
  it('does not leak the ICAO station identifier into the weather string', () => {
    // Regression check: WMKK is 4 letters, same shape as a real weather
    // group like "TSRA" — must be stripped positionally, not by content.
    const m = skylinkMetarToAWCShape(RAW_METAR)
    expect(m.wxString).not.toContain('WMKK')
  })
  it('round-trips correctly into a VFR flight category (9000 m, no ceiling, no hazard)', () => {
    const m = skylinkMetarToAWCShape(RAW_METAR)
    expect(getMetarFlightCat(m)).toBe('VFR')
    expect(getWindSev(m.wspd, m.wgst)).toBe('NORMAL')
  })
  it('flags a low-visibility thunderstorm METAR as LIFR with a severe wind category', () => {
    const raw = { raw: 'METAR ZZZZ 010000Z 09015G25KT 1200 +TSRA BKN005 OVC010 18/17 Q0995', icao: 'ZZZZ', timestamp: '2026-07-10T00:00:00Z' }
    const m = skylinkMetarToAWCShape(raw)
    expect(m.visib).toBeCloseTo(1200 / 1609.34, 5)
    expect(m.clouds).toEqual([{ cover: 'BKN', base: 500 }, { cover: 'OVC', base: 1000 }])
    expect(getMetarFlightCat(m)).toBe('LIFR')
    expect(getWindSev(m.wspd, m.wgst)).toBe('STRONG')
  })
  it('returns null for a missing/malformed response', () => {
    expect(skylinkMetarToAWCShape(null)).toBeNull()
    expect(skylinkMetarToAWCShape({})).toBeNull()
  })
})

describe('skylinkTafToAWCShape', () => {
  it('passes the raw TAF text through untouched and derives an issue-time string', () => {
    const t = skylinkTafToAWCShape(RAW_TAF)
    expect(t.rawTAF).toBe(RAW_TAF.raw)
    expect(t.icaoId).toBe('WMKK')
    expect(t.issueTime).toBe('2026-07-10 05:49')
    expect(t.bulletinTime).toBe(t.issueTime)
  })
  it('returns null for a missing/malformed response', () => {
    expect(skylinkTafToAWCShape(null)).toBeNull()
    expect(skylinkTafToAWCShape({})).toBeNull()
  })
})
