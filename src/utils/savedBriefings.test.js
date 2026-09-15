import { describe, it, expect } from 'vitest'
import { autoBriefingName, sortByNewest, findOldest, isAtCap, pickNextAfterDelete, makeBriefingId } from './savedBriefings'

describe('autoBriefingName', () => {
  it('formats dep + arr + date + time', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20) // 15 Sep 2026 14:20 UTC
    expect(autoBriefingName({ dep: 'WMKK', arr: 'WSSS' }, ts)).toBe('WMKK → WSSS · 15 Sep 14:20')
  })
  it('falls back to whichever of dep/arr exists', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20)
    expect(autoBriefingName({ dep: 'WMKK', arr: '' }, ts)).toBe('WMKK · 15 Sep 14:20')
    expect(autoBriefingName({ dep: '', arr: 'WSSS' }, ts)).toBe('WSSS · 15 Sep 14:20')
  })
  it('falls back to a generic label with neither', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20)
    expect(autoBriefingName({ dep: '', arr: '' }, ts)).toBe('Briefing · 15 Sep 14:20')
  })
})

describe('sortByNewest', () => {
  it('orders by savedAt descending without mutating the input', () => {
    const list = [{ id: 'a', savedAt: 100 }, { id: 'b', savedAt: 300 }, { id: 'c', savedAt: 200 }]
    const sorted = sortByNewest(list)
    expect(sorted.map(b => b.id)).toEqual(['b', 'c', 'a'])
    expect(list.map(b => b.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('findOldest', () => {
  it('returns the entry with the smallest savedAt', () => {
    const list = [{ id: 'a', savedAt: 100 }, { id: 'b', savedAt: 300 }, { id: 'c', savedAt: 200 }]
    expect(findOldest(list).id).toBe('a')
  })
  it('returns null for an empty list', () => {
    expect(findOldest([])).toBeNull()
  })
})

describe('isAtCap', () => {
  it('is false below the cap and true at or above it', () => {
    const under = Array.from({ length: 29 }, (_, i) => ({ id: String(i), savedAt: i }))
    const at = Array.from({ length: 30 }, (_, i) => ({ id: String(i), savedAt: i }))
    expect(isAtCap(under, 30)).toBe(false)
    expect(isAtCap(at, 30)).toBe(true)
  })
})

describe('pickNextAfterDelete', () => {
  const sorted = [{ id: 'newest', savedAt: 300 }, { id: 'mid', savedAt: 200 }, { id: 'oldest', savedAt: 100 }]
  it('picks the entry after the deleted one when it is not last', () => {
    expect(pickNextAfterDelete(sorted, 'newest')).toBe('mid')
  })
  it('falls back to the previous entry when the deleted one was last', () => {
    expect(pickNextAfterDelete(sorted, 'oldest')).toBe('mid')
  })
  it('returns null once the list would become empty', () => {
    expect(pickNextAfterDelete([{ id: 'only', savedAt: 1 }], 'only')).toBeNull()
  })
  it('returns null if the id is not found', () => {
    expect(pickNextAfterDelete(sorted, 'missing')).toBeNull()
  })
})

describe('makeBriefingId', () => {
  it('generates non-empty, unique ids', () => {
    const a = makeBriefingId()
    const b = makeBriefingId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
