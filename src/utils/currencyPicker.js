// Pure row-selection logic for the Currency tab's two pickers (base currency
// and edit list). Kept out of the component so it can be unit-tested.

// Case-insensitive match on code or name. An empty query matches everything.
export function matchesCurrency(c, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
}

// Rows a picker should show.
// - Typing: every currency matching the query, in the data's own order.
// - Empty box: only the user's own currencies — `baseline` (what was selected
//   when the picker opened) followed by anything added since, so a row never
//   vanishes from under the user's finger when they untick or un-star it.
// The current `base` is never offered (you are already on it).
export function currencyPickerRows({ query, all, byCode, baseline, current, base }) {
  if ((query || '').trim()) return all.filter(c => c.code !== base && matchesCurrency(c, query))
  const codes = [...baseline, ...current.filter(code => !baseline.includes(code))]
  return codes.filter(code => code !== base).map(code => byCode[code]).filter(Boolean)
}
