import { describe, it, expect } from 'vitest'
import {
  getTimeBandAC,
  tableBRowId,
  lookupFDP,
  getBandLabelForResult,
} from './ftlTables'

// h(decHours) → minutes, same conversion the table uses
const h = dec => Math.round(dec * 60)

describe('getTimeBandAC — local report time → band', () => {
  it('0600–0759 → b0', () => {
    expect(getTimeBandAC('06:00')).toBe('b0')
    expect(getTimeBandAC('07:59')).toBe('b0')
  })
  it('0800–1259 → b1', () => {
    expect(getTimeBandAC('08:00')).toBe('b1')
    expect(getTimeBandAC('12:59')).toBe('b1')
  })
  it('1300–1759 → b2', () => {
    expect(getTimeBandAC('13:00')).toBe('b2')
    expect(getTimeBandAC('17:59')).toBe('b2')
  })
  it('1800–2159 → b3', () => {
    expect(getTimeBandAC('18:00')).toBe('b3')
    expect(getTimeBandAC('21:59')).toBe('b3')
  })
  it('2200–0559 (overnight) → b4', () => {
    expect(getTimeBandAC('22:00')).toBe('b4')
    expect(getTimeBandAC('00:00')).toBe('b4')
    expect(getTimeBandAC('05:59')).toBe('b4')
  })
})

describe('tableBRowId — preceding rest → Table B row', () => {
  it('rest strictly between 18h and 30h → r1', () => {
    expect(tableBRowId(19)).toBe('r1')
    expect(tableBRowId(29)).toBe('r1')
  })
  it('rest ≤18h or ≥30h → r0', () => {
    expect(tableBRowId(18)).toBe('r0')
    expect(tableBRowId(30)).toBe('r0')
    expect(tableBRowId(10)).toBe('r0')
  })
})

describe('lookupFDP — Table A (2+ crew, acclimatised)', () => {
  it('0800–1259 band, 1 sector → 14h', () => {
    expect(lookupFDP('08:00', 1, '2crew', true)).toBe(h(14))
  })
  it('caps sectors at 8+ column', () => {
    expect(lookupFDP('08:00', 8, '2crew', true)).toBe(h(9.5))
    expect(lookupFDP('08:00', 12, '2crew', true)).toBe(h(9.5)) // clamps to 8+
  })
  it('overnight band, 1 sector → 11h', () => {
    expect(lookupFDP('23:00', 1, '2crew', true)).toBe(h(11))
  })
})

describe('lookupFDP — Table B (2+ crew, NOT acclimatised)', () => {
  it('uses preceding rest, not local time (≤18h rest → r0)', () => {
    expect(lookupFDP('08:00', 1, '2crew', false, 10)).toBe(h(13))
  })
  it('18–30h rest selects r1', () => {
    expect(lookupFDP('08:00', 1, '2crew', false, 20)).toBe(h(11.5))
  })
})

describe('lookupFDP — Table C (single pilot)', () => {
  it('0800–1259 band, ≤4 sectors → 11h', () => {
    expect(lookupFDP('08:00', 3, 'single', true)).toBe(h(11))
  })
  it('5 sectors uses the next column', () => {
    expect(lookupFDP('08:00', 5, 'single', true)).toBe(h(10.25))
  })
})

describe('getBandLabelForResult', () => {
  it('returns the Table C band label for single pilot', () => {
    expect(getBandLabelForResult('08:00', 'single', true)).toBe('0800–1259')
  })
  it('returns the Table B rest-band label when not acclimatised', () => {
    expect(getBandLabelForResult('08:00', '2crew', false, 20))
      .toBe('Preceding rest 18–30h')
  })
})
