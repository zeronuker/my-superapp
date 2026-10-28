// Pure helpers for MonthBrowser (components/MonthBrowser.jsx): a list shown one month at a
// time. `getYM(item)` returns { year, month } (month 1-12) or null for an undated item.

export const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// How many items fall in each month (index 0 = January) of `year`.
export function monthCounts(items, getYM, year) {
  const counts = Array(12).fill(0)
  for (const it of items) {
    const ym = getYM(it)
    if (ym && ym.year === year) counts[ym.month - 1]++
  }
  return counts
}

export function itemsInMonth(items, getYM, year, month) {
  return items.filter(it => {
    const ym = getYM(it)
    return ym && ym.year === year && ym.month === month
  })
}

// First and last year worth showing: the years that have items, widened to include `curYear`.
export function yearBounds(items, getYM, curYear) {
  let min = curYear, max = curYear
  for (const it of items) {
    const ym = getYM(it)
    if (!ym) continue
    if (ym.year < min) min = ym.year
    if (ym.year > max) max = ym.year
  }
  return { min, max }
}

// One page of `list`; `page` is clamped, so deleting the last item on a page lands on the one before.
export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const cur = Math.min(Math.max(1, page), pages)
  return { shown: list.slice((cur - 1) * size, cur * size), pages, cur }
}
