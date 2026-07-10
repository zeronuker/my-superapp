// Small badge showing which data source actually supplied the current
// result — always reflects reality (including a silent fallback), never
// just which source was scheduled for today.
const LABEL = {
  skylink: 'SKYLINK',
  autorouter: 'AUTOROUTER',
  aviationweather: 'AVIATIONWEATHER.GOV',
}

export default function SourceChip({ source }) {
  if (!source) return null
  const isSkylink = source === 'skylink'
  return (
    <span style={{
      fontFamily: 'var(--cb-font-mono)', fontSize: 8, letterSpacing: '0.1em',
      padding: '3px 7px', borderRadius: 3, flexShrink: 0, whiteSpace: 'nowrap',
      color: isSkylink ? 'var(--cp-acc)' : 'var(--cp-dim)',
      background: isSkylink ? 'var(--cp-accdim)' : 'var(--cp-bg3)',
      border: `1px solid ${isSkylink ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
    }}>
      {LABEL[source] || source.toUpperCase()}
    </span>
  )
}
