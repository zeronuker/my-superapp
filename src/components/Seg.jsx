// Small segmented control, e.g. OFF | ON — the look of the toggles in the FTL
// module (moved here from FTLCalculator.jsx so the Briefing map's FIX toggle
// can share it). options: [{ value, label, disabled?, disabledTitle? }]
export default function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--cp-border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
      {options.map((opt, i) => {
        const active   = value === opt.value
        const disabled = !!opt.disabled
        return (
          <button key={String(opt.value)}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            title={disabled ? opt.disabledTitle : undefined}
            style={{
              background:  active ? 'var(--cp-accdim)' : 'transparent',
              border:      'none',
              borderRight: i < options.length - 1 ? '1px solid var(--cp-border)' : 'none',
              color:       active ? 'var(--cp-acc)' : 'var(--cp-dim)',
              fontFamily:  'var(--cb-font-mono)',
              fontSize: 10, letterSpacing: '0.1em',
              padding: '5px 10px', whiteSpace: 'nowrap',
              cursor:   disabled ? 'not-allowed' : 'pointer',
              opacity:  disabled ? 0.4 : 1,
            }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
