import { describe, it, expect } from 'vitest'
import { splitRowsByIcao } from './notamSplit'

const row = (id, itema, extra = {}) => ({ id, itema, ...extra })

describe('splitRowsByIcao', () => {
  it('sorts rows back to the airport they belong to', () => {
    const out = splitRowsByIcao(
      [row(1, ['WMKK']), row(2, ['WSSS']), row(3, ['WMKK'])],
      ['WMKK', 'WSSS'],
    )
    expect(out.WMKK.map(r => r.id)).toEqual([1, 3])
    expect(out.WSSS.map(r => r.id)).toEqual([2])
  })

  it('accepts item A as a plain string as well as a list', () => {
    const out = splitRowsByIcao([row(1, 'WMKK'), row(2, ['WSSS'])], ['WMKK', 'WSSS'])
    expect(out.WMKK.map(r => r.id)).toEqual([1])
    expect(out.WSSS.map(r => r.id)).toEqual([2])
  })

  it('gives a multi-location NOTAM to every requested airport it names', () => {
    const out = splitRowsByIcao([row(1, ['WMKK', 'WMKL'])], ['WMKK', 'WMKL', 'WSSS'])
    expect(out.WMKK).toHaveLength(1)
    expect(out.WMKL).toHaveLength(1)
    expect(out.WSSS).toEqual([])
  })

  it('splits a space-separated item A', () => {
    const out = splitRowsByIcao([row(1, 'WMKK WMKL')], ['WMKK', 'WMKL'])
    expect(out.WMKK).toHaveLength(1)
    expect(out.WMKL).toHaveLength(1)
  })

  it('matches FIR NOTAMs by the fir field when item A is empty', () => {
    const out = splitRowsByIcao([row(1, [], { fir: 'WMFC' })], ['WMKK', 'WMFC'])
    expect(out.WMFC.map(r => r.id)).toEqual([1])
    expect(out.WMKK).toEqual([])
  })

  it('is case-insensitive on both sides', () => {
    const out = splitRowsByIcao([row(1, ['wmkk'])], ['wmkk'])
    expect(out.WMKK).toHaveLength(1)
  })

  it('never loses a row: an unmatched row goes to the first airport', () => {
    const out = splitRowsByIcao([row(1, ['ZZZZ'])], ['WMKK', 'WSSS'])
    expect(out.WMKK.map(r => r.id)).toEqual([1])
  })

  it('returns an empty list for an airport with no NOTAMs', () => {
    const out = splitRowsByIcao([], ['WMKK', 'WSSS'])
    expect(out).toEqual({ WMKK: [], WSSS: [] })
  })

  it('handles missing input', () => {
    expect(splitRowsByIcao(undefined, ['WMKK'])).toEqual({ WMKK: [] })
    expect(splitRowsByIcao([row(1, ['WMKK'])], [])).toEqual({})
  })
})
