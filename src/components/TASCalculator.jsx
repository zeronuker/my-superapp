import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { densityAltitude, isaDeviation, tasFromCas } from '../utils/aviationCalc'

const fmtFt = v => (v == null ? '—' : `${v.toLocaleString()} ft`)

export default function TASCalculator() {
  const resetCount = useCalculatorStore(s => s.resetCount)

  const [cas, setCas] = useState('')
  const [pa,  setPa]  = useState('')
  const [oat, setOat] = useState('')

  const prevReset = useRef(resetCount)
  useEffect(() => {
    if (resetCount === prevReset.current) return
    prevReset.current = resetCount
    setCas(''); setPa(''); setOat('')
  }, [resetCount])

  const da  = densityAltitude(pa, oat)
  const dev = isaDeviation(pa, oat)
  const tas = da != null ? tasFromCas(cas, da) : null

  const casNum = parseFloat(cas)
  const diff = tas != null && !isNaN(casNum) ? tas - casNum : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      <InfoBanner text="True airspeed is calibrated airspeed corrected for air density. As density falls with altitude and temperature, TAS exceeds CAS — the gap widens roughly 2% per 1,000 ft of density altitude." />

      {/* ── Inputs ── */}
      <div>
        <SectionHeader title="Inputs" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Field label="CAS / IAS (KT)"        value={cas} onChange={setCas} placeholder="e.g. 250" />
          <Field label="PRESSURE ALTITUDE (FT)" value={pa}  onChange={setPa}  placeholder="e.g. 35000" />
          <Field label="OAT (°C)"              value={oat} onChange={setOat} placeholder="e.g. -45" />
        </div>
        <div style={{ marginTop: 8, fontFamily: 'var(--cb-font-mono)', fontSize: 9,
          color: 'var(--cp-dim)', letterSpacing: '0.06em', lineHeight: 1.6 }}>
          USE PRESSURE ALTITUDE (ALTIMETER SET TO 1013). IGNORES CAS↔EAS COMPRESSIBILITY.
        </div>
      </div>

      {/* ── Results ── */}
      <div>
        <SectionHeader title="Results" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Stat label="ISA DEVIATION" value={dev == null ? '—' : `${dev > 0 ? '+' : ''}${dev} °C`} />
          <Stat label="DENSITY ALTITUDE" value={fmtFt(da)} />
          <Stat
            label="TRUE AIRSPEED"
            value={tas == null ? '—' : `${tas} kt`}
            sub={diff != null ? `${diff >= 0 ? '+' : ''}${diff} kt vs CAS` : null}
            highlight={tas != null}
          />
        </div>
      </div>
    </div>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="cp-label" style={{ marginBottom: 6 }}>{label}</div>
      <input
        type="number" inputMode="decimal" className="cp-input"
        value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 16, fontFamily: 'var(--cb-font-mono)' }}
      />
    </div>
  )
}

function Stat({ label, value, sub, highlight }) {
  return (
    <div style={{
      background: 'var(--cp-bg3)',
      border: '1px solid var(--cp-border2)',
      borderLeft: `3px solid ${highlight ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
      borderRadius: 4, padding: '14px 16px',
    }}>
      <div className="cp-label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, fontSize: 24,
        color: highlight ? 'var(--cp-acc)' : 'var(--cp-txt)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 6, fontFamily: 'var(--cb-font-mono)', fontSize: 10,
          color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function InfoBanner({ text }) {
  return (
    <div style={{
      background: 'var(--cp-bg3)',
      border: '1px solid var(--cp-border2)',
      borderLeft: '3px solid var(--cp-acc)',
      borderRadius: 4, padding: '10px 14px',
      fontFamily: 'var(--cb-font-body)', fontSize: 12,
      color: 'var(--cp-muted)', lineHeight: 1.6,
    }}>
      {text}
    </div>
  )
}
