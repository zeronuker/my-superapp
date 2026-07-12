// Shared role → {color, soft} background-tint map (dep/arr cyan, dest-alt white,
// enroute purple, FIR amber, other gray). Used by both NotamViewer.jsx and
// METARTAFCalculator.jsx, which previously each hand-rolled their own copy —
// color and background-tint alpha had already drifted identical, but border
// alpha is tuned separately per component and stays local to each file.
export const ROLE_TINT = {
  dep:     { color: '#06b6d4', soft: 'rgba(6,182,212,0.10)' },
  arr:     { color: '#06b6d4', soft: 'rgba(6,182,212,0.10)' },
  destalt: { color: '#e2e8f0', soft: 'rgba(226,232,240,0.08)' },
  era:     { color: '#a78bfa', soft: 'rgba(167,139,250,0.10)' },
  fir:     { color: '#fbbf24', soft: 'rgba(251,191,36,0.10)' },
  other:   { color: '#94a3b8', soft: 'rgba(148,163,184,0.10)' },
}
