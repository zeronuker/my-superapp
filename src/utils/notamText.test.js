import { describe, it, expect } from 'vitest'
import { notamText } from './notamText'

describe('notamText', () => {
  it('takes the E) item from autorouter-style item lines', () => {
    const raw = 'A) WMKK\nD) 0100-2100 DLY\nE) RWY 14R/32L CLSD\nDUE WORKS\nF) SFC\nG) UNL'
    expect(notamText({ raw, summary: 'Runway' })).toBe('RWY 14R/32L CLSD DUE WORKS')
  })
  it('works on a single-line NOTAM string', () => {
    const raw = '(A1234/26 NOTAMN Q) WMFC/QMRLC/IV/NBO/A/000/999 A) WMKK B) 2610010100 C) 2610302100 E) TWY K CLSD F) SFC G) UNL)'
    expect(notamText({ raw, summary: 'x' })).toBe('TWY K CLSD')
  })
  it('stops at the end when there is no F)/G)', () => {
    expect(notamText({ raw: 'A) WMKK\nE) CRANE 150FT AGL', summary: 'x' })).toBe('CRANE 150FT AGL')
  })
  it('falls back to the summary', () => {
    expect(notamText({ raw: '{"id":1}', summary: 'Runway' })).toBe('Runway')
    expect(notamText({ summary: 'Runway' })).toBe('Runway')
  })
})
