import { describe, it, expect } from 'vitest'
import { matchField, altDateText } from './searchLogs'

function makeLog(overrides = {}) {
  return {
    date: '2026-09-18',
    aircraft: [{ reg: '9M-XYZ', type: 'B738' }],
    sectors: [{ fltNo: 'MH1234', from: 'WSSS', dest: 'WMKK', remark: '' }],
    crew: [{ name: 'Capt. Aria Chen' }],
    notes: '',
    ...overrides,
  }
}

describe('matchField', () => {
  it('returns null for an empty query', () => {
    expect(matchField(makeLog(), '', true)).toBeNull()
  })

  it('matches a full ISO date', () => {
    expect(matchField(makeLog(), '2026-09-18', true)).toBe('date')
  })

  it('matches a year-month prefix', () => {
    expect(matchField(makeLog(), '2026-09', true)).toBe('date')
  })

  it('matches a year prefix', () => {
    expect(matchField(makeLog(), '2026', true)).toBe('date')
  })

  it('does not match a month name when monthMode is off', () => {
    expect(matchField(makeLog(), 'sep', false)).toBeNull()
  })

  it('matches a month abbreviation when monthMode is on', () => {
    expect(matchField(makeLog(), 'sep', true)).toBe('date')
  })

  it('matches route, flight no, reg, crew and notes', () => {
    expect(matchField(makeLog(), 'wmkk', true)).toBe('route')
    expect(matchField(makeLog(), 'mh1234', true)).toBe('flight no')
    expect(matchField(makeLog(), '9m-xyz', true)).toBe('reg')
    expect(matchField(makeLog(), 'chen', true)).toBe('crew')
    expect(matchField(makeLog(), 'diverted', true)).toBeNull()
    expect(matchField(makeLog({ notes: 'diverted for weather' }), 'diverted', true)).toBe('notes')
  })

  it('is case-insensitive and returns null when nothing matches', () => {
    expect(matchField(makeLog(), 'ZZZZ', true)).toBeNull()
  })
})

describe('altDateText', () => {
  it('returns an empty string for an undated log', () => {
    expect(altDateText(makeLog({ date: '' }))).toBe('')
  })

  it('includes day, short month, full month and year', () => {
    expect(altDateText(makeLog({ date: '2026-09-05' }))).toBe('05 SEP 2026 SEPTEMBER 2026')
  })
})
