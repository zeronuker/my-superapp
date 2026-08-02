// Shared button styling for the Basic/Scientific/Time calculators, so a given
// button role (digit, operator, utility, clear, equals) is the same size
// across all three modes. Buttons sit in a CSS Grid with 1fr rows/columns —
// the grid stretches each button to fill its cell, so button size comes from
// the grid, not from padding/font math. Font sizes are fixed rather than
// computed from viewport size — comfortable at the range of sizes a
// full-screen grid actually produces on phones through tablets.
const base = {
  fontFamily: 'var(--cb-font-mono)',
  fontWeight: 700,
  border: '1px solid var(--cp-border)',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.1s',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const CALC_GRID_GAP = 8

export const CALC_BTN = {
  base,
  num:      { ...base, fontSize: 26, background: 'var(--cp-bg3)',           color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  op:       { ...base, fontSize: 26, background: 'var(--cp-accdim)',        color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  opActive: { ...base, fontSize: 26, background: 'var(--cp-accdim)',        color: 'var(--cp-acc)',    borderColor: 'var(--cp-acc)', boxShadow: '0 0 8px var(--cp-accdim)' },
  util:     { ...base, fontSize: 15, background: 'var(--cp-bg2)',           color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:      { ...base, fontSize: 13, background: 'rgba(239,68,68,0.12)',    color: 'var(--cp-red)',    borderColor: 'rgba(239,68,68,0.4)' },
  eq:       { ...base, fontSize: 28, background: 'rgba(34,197,94,0.12)',    color: 'var(--cp-green)',  borderColor: 'rgba(34,197,94,0.4)' },
  // Scientific-only extras — no Basic/Time equivalent to match, sized smaller
  // to fit multi-character labels (sin, cos⁻¹, ...) in a 6-column grid.
  sci:      { ...base, fontSize: 14, background: 'var(--cp-bg2)',           color: 'var(--cp-acc2)',   borderColor: 'var(--cp-border)'  },
  pi:       { ...base, fontSize: 15, background: 'rgba(167,139,250,0.12)',  color: 'var(--cp-purple)', borderColor: 'rgba(167,139,250,0.4)' },
}
