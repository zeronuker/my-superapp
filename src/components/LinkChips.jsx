const mono = 'var(--cb-font-mono)'

const TONES = {
  amber: { color: 'var(--cp-yellow)', background: 'rgba(252,211,77,0.12)', border: '1px solid var(--cp-yellow)' },
  mint:  { color: 'var(--cp-acc)', background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)' },
}

// The small chip that opens the linked thing, or (dashed) starts linking one.
export function LinkChip({ linked, tone, label, emptyLabel, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', fontWeight: 500, cursor: 'pointer',
      padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
      ...(linked ? TONES[tone] : { color: 'var(--cp-dim)', background: 'transparent', border: '1px dashed var(--cp-border)' }),
    }}>{linked ? `${label} ›` : `+ ${emptyLabel}`}</button>
  )
}

const lineBtn = { fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', color: 'var(--cp-acc)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '0 2px' }

// "Briefing linked by you · MH2623 · CHANGE · UNLINK" under a linked sector or in the briefing header.
export function LinkLine({ text, onChange, onUnlink, unlinkLabel = 'UNLINK', style }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.04em', color: 'var(--cp-dim)', ...style }}>
      {text} · <button onClick={onChange} style={lineBtn}>CHANGE</button> · <button onClick={onUnlink} style={lineBtn}>{unlinkLabel}</button>
    </div>
  )
}
