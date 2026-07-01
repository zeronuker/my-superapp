// Shared button styling for the Basic/Scientific/Time calculators, so a given
// button role (digit, operator, utility, clear, equals) is the same size
// across all three modes, and shrinks together via vh-based clamps to fit
// short viewports without needing to scroll — floored so buttons never get
// small enough to be hard to tap.
const base = {
  fontFamily: 'var(--cb-font-mono)',
  fontWeight: 700,
  border: '1px solid var(--cp-border)',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 'clamp(4px, 0.9vh, 9px) 0',
  transition: 'all 0.1s',
  userSelect: 'none',
}

export const CALC_GRID_GAP = 'clamp(2px, 0.5vh, 4px)'

export const CALC_BTN = {
  base,
  num:      { ...base, fontSize: 'clamp(13px, 2vh, 17px)', background: 'var(--cp-bg3)',              color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  op:       { ...base, fontSize: 'clamp(13px, 2vh, 17px)', background: 'var(--cp-accdim)',           color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  opActive: { ...base, fontSize: 'clamp(13px, 2vh, 17px)', background: 'var(--cp-accdim)',           color: 'var(--cp-acc)',    borderColor: 'var(--cp-acc)', boxShadow: '0 0 8px var(--cp-accdim)' },
  util:     { ...base, fontSize: 'clamp(10px, 1.6vh, 13px)', background: 'var(--cp-bg2)',            color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:      { ...base, fontSize: 'clamp(9px, 1.4vh, 12px)', background: 'rgba(239,68,68,0.12)',      color: 'var(--cp-red)',    borderColor: 'rgba(239,68,68,0.4)' },
  eq:       { ...base, fontSize: 'clamp(13px, 2.2vh, 18px)', background: 'rgba(34,197,94,0.12)',     color: 'var(--cp-green)',  borderColor: 'rgba(34,197,94,0.4)' },
  // Scientific-only extras — no Basic/Time equivalent to match, sized smaller
  // to fit multi-character labels (sin, cos⁻¹, ...) in a 6-column grid.
  sci:      { ...base, fontSize: 'clamp(8px, 1.1vh, 10px)', background: 'var(--cp-bg2)',             color: 'var(--cp-acc2)',   borderColor: 'var(--cp-border)'  },
  pi:       { ...base, fontSize: 'clamp(9px, 1.2vh, 11px)', background: 'rgba(167,139,250,0.12)',    color: 'var(--cp-purple)', borderColor: 'rgba(167,139,250,0.4)' },
}
