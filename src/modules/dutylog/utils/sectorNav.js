// Which sector of a duty log is open in the editor, and how ‹ › move between them. Pure — no React.
// One sector is open at a time; the others show as one-line rows.

// The sector to show: the picked one, else (it was removed) the one now at its old place, else the last.
// Resolves { index, sector }.
export function pickSelected(sectors, selId, lastIndex = 0) {
  const at = sectors.findIndex(s => s.id === selId)
  const index = at >= 0 ? at : Math.max(0, Math.min(lastIndex, sectors.length - 1))
  return { index, sector: sectors[index] }
}

// The sector one step away (dir -1 = previous, 1 = next), or null at either end.
export const neighbour = (sectors, index, dir) => sectors[index + dir] ?? null

// What a folded row shows: "MH103" and "WMKK → VHHH", with — for what is not filled in yet.
export const rowText = (s) => ({ flight: s.fltNo || '—', route: `${s.from || '—'} → ${s.dest || '—'}` })

// True when the MORE part (ENG OUT and remarks) holds something, so MORE can show a dot.
export const hasMore = (s) => [s.engN1, s.engAlt, s.engIas, s.remark].some(v => String(v ?? '').trim() !== '')

// The folded aircraft line: "9M-LNQ · B738 · C16Y138", or NEW AIRCRAFT while nothing is typed.
export function aircraftText(a) {
  if (![a.reg, a.type, a.config].some(Boolean)) return { main: 'NEW AIRCRAFT', rest: '' }
  return { main: a.reg || '—', rest: ` · ${a.type || '—'} · ${a.config || '—'}` }
}
