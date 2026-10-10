import { describe, it, expect } from 'vitest'
import { matchesCurrency, currencyPickerRows } from './currencyPicker'

const ALL = [
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'BND', name: 'Brunei Dollar' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'USD', name: 'US Dollar' },
]
const BY_CODE = Object.fromEntries(ALL.map(c => [c.code, c]))
const rows = (over) => currencyPickerRows({ query: '', all: ALL, byCode: BY_CODE, baseline: [], current: [], base: 'MYR', ...over })
const codes = (list) => list.map(c => c.code)

describe('matchesCurrency', () => {
  it('matches on code or name, case-insensitively', () => {
    expect(matchesCurrency(BY_CODE.AUD, 'aud')).toBe(true)
    expect(matchesCurrency(BY_CODE.AUD, 'AUSTRAL')).toBe(true)
    expect(matchesCurrency(BY_CODE.AUD, 'yen')).toBe(false)
  })
  it('treats an empty or blank query as a match', () => {
    expect(matchesCurrency(BY_CODE.AUD, '')).toBe(true)
    expect(matchesCurrency(BY_CODE.AUD, '   ')).toBe(true)
    expect(matchesCurrency(BY_CODE.AUD, undefined)).toBe(true)
  })
  it('ignores spaces around the query', () => {
    expect(matchesCurrency(BY_CODE.JPY, '  yen ')).toBe(true)
  })
})

describe('currencyPickerRows — typing', () => {
  it('returns every match in the data order', () => {
    expect(codes(rows({ query: 'dollar' }))).toEqual(['AUD', 'BND', 'USD'])
  })
  it('never offers the current base, even if it matches', () => {
    expect(codes(rows({ query: 'ringgit' }))).toEqual([])
    expect(codes(rows({ query: 'm', base: 'JPY' }))).toContain('MYR')
    expect(codes(rows({ query: 'yen', base: 'JPY' }))).toEqual([])
  })
  it('ignores the user\'s own lists while typing', () => {
    expect(codes(rows({ query: 'rupiah', baseline: ['AUD'], current: ['AUD'] }))).toEqual(['IDR'])
  })
})

describe('currencyPickerRows — empty box', () => {
  it('shows only the baseline, in the user\'s own order, without the base', () => {
    expect(codes(rows({ baseline: ['USD', 'MYR', 'AUD'], current: ['USD', 'MYR', 'AUD'] }))).toEqual(['USD', 'AUD'])
  })
  it('keeps a row that was removed since the picker opened (so it can be re-ticked)', () => {
    expect(codes(rows({ baseline: ['AUD', 'JPY'], current: ['AUD'] }))).toEqual(['AUD', 'JPY'])
  })
  it('appends anything added since the picker opened', () => {
    expect(codes(rows({ baseline: ['AUD'], current: ['AUD', 'IDR'] }))).toEqual(['AUD', 'IDR'])
  })
  it('does not duplicate rows and skips unknown codes', () => {
    expect(codes(rows({ baseline: ['AUD', 'XXX'], current: ['AUD', 'AUD', 'JPY'] }))).toEqual(['AUD', 'JPY'])
  })
  it('is empty when the user has nothing selected', () => {
    expect(rows({ baseline: [], current: [] })).toEqual([])
  })
  it('treats a blank query as empty', () => {
    expect(codes(rows({ query: '   ', baseline: ['JPY'], current: ['JPY'] }))).toEqual(['JPY'])
  })
})
