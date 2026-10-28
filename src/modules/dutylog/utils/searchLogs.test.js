import { describe, it, expect } from 'vitest'
import { matchField } from './searchLogs'

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
    expect(matchField(makeLog(), '')).toBeNull()
  })

  it('matches a full ISO date', () => {
    expect(matchField(makeLog(), '2026-09-18')).toBe('date')
  })

  it('matches a year-month prefix', () => {
    expect(matchField(makeLog(), '2026-09')).toBe('date')
  })

  it('matches a year prefix', () => {
    expect(matchField(makeLog(), '2026')).toBe('date')
  })

  it('matches month names and day/month text', () => {
    expect(matchField(makeLog(), 'sep')).toBe('date')
    expect(matchField(makeLog(), 'september')).toBe('date')
    expect(matchField(makeLog(), '18 sep')).toBe('date')
  })

  it('matches route, flight no, reg, crew and notes', () => {
    expect(matchField(makeLog(), 'wmkk')).toBe('route')
    expect(matchField(makeLog(), 'mh1234')).toBe('flight no')
    expect(matchField(makeLog(), '9m-xyz')).toBe('reg')
    expect(matchField(makeLog(), 'chen')).toBe('crew')
    expect(matchField(makeLog(), 'diverted')).toBeNull()
    expect(matchField(makeLog({ notes: 'diverted for weather' }), 'diverted')).toBe('notes')
  })

  it('is case-insensitive and returns null when nothing matches', () => {
    expect(matchField(makeLog(), 'ZZZZ')).toBeNull()
  })
})
