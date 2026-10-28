import { describe, it, expect } from 'vitest'
import { monthCounts, itemsInMonth, yearBounds, paginate } from './monthGroups'

const getYM = x => x.ym
const items = [
  { id: 'a', ym: { year: 2026, month: 10 } },
  { id: 'b', ym: { year: 2026, month: 10 } },
  { id: 'c', ym: { year: 2026, month: 3 } },
  { id: 'd', ym: { year: 2025, month: 12 } },
  { id: 'e', ym: null },
]

describe('monthCounts', () => {
  it('counts per month of one year, ignoring other years and undated items', () => {
    const c = monthCounts(items, getYM, 2026)
    expect(c).toHaveLength(12)
    expect(c[9]).toBe(2)
    expect(c[2]).toBe(1)
    expect(c.reduce((s, n) => s + n, 0)).toBe(3)
  })
})

describe('itemsInMonth', () => {
  it('returns only that month, keeping order', () => {
    expect(itemsInMonth(items, getYM, 2026, 10).map(x => x.id)).toEqual(['a', 'b'])
    expect(itemsInMonth(items, getYM, 2026, 4)).toEqual([])
  })
})

describe('yearBounds', () => {
  it('spans the data and always includes the current year', () => {
    expect(yearBounds(items, getYM, 2026)).toEqual({ min: 2025, max: 2026 })
    expect(yearBounds([], getYM, 2026)).toEqual({ min: 2026, max: 2026 })
    expect(yearBounds(items, getYM, 2027)).toEqual({ min: 2025, max: 2027 })
  })
})

describe('paginate', () => {
  const list = [1, 2, 3, 4, 5, 6, 7]
  it('slices a page and counts pages', () => {
    expect(paginate(list, 1, 5)).toEqual({ shown: [1, 2, 3, 4, 5], pages: 2, cur: 1 })
    expect(paginate(list, 2, 5)).toEqual({ shown: [6, 7], pages: 2, cur: 2 })
  })
  it('clamps an out-of-range page and handles an empty list', () => {
    expect(paginate(list, 9, 5).cur).toBe(2)
    expect(paginate([], 3, 5)).toEqual({ shown: [], pages: 1, cur: 1 })
  })
})
