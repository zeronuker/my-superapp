import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import {
  pressureAltitude, densityAltitude, isaDeviation, isaTempC,
} from '../utils/aviationCalc'

const fmtFt = v => (v == null ? '—' : `${v.toLocaleString()} ft`)

export default function DensityAltitudeCalculator() {
  const resetCount = useCalculatorStore(s => s.resetCount)

  const [elev, setElev] = useState('')
  const [qnh,  setQnh]  = useState('1013')
  const [oat,  setOat]  = useState('')

  // React to global "Reset All"
  const prevReset = useRef(resetCount)
  useEffect(() => {
    if (resetCount === prevReset.current) return
    prevReset.current = resetCount
    setElev(''); setQnh('1013'); setOat('')
  }, [resetCount])

  const pa  = pressureAltitude(elev, qnh)
  const dev = pa != null ? isaDeviation(pa, oat) : null
  const da  = pa != null ? densityAltitude(pa, oat) : null
  const isa = pa != null ? isaTempC(pa) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      <InfoBanner text="Density altitude is the pressure altitude corrected for non-standard temperature — the altitude the aircraft 'feels'. High density altitude degrades climb, takeoff and engine performance." />

      {/* ── Inputs ── */}
      <div>
        <SectionHeader title="Inputs" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Field label="FIELD ELEVATION (FT)" value={elev} onChange={setElev} placeholder="e.g. 5000" />
          <Field label="QNH (hPa)"            value={qnh}  onChange={setQnh}  placeholder="1013" />
          <Field label="OAT (°C)"             value={oat}  onChange={setOat}  placeholder="e.g. 30" />
        </div>
      </div>

      {/* ── Results ── */}
      <div>
        <SectionHeader title="Results" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Stat label="PRESSURE ALTITUDE" value={fmtFt(pa)} />
          <Stat
            label="ISA DEVIATION"
            value={dev == null ? '—' : `${dev > 0 ? '+' : ''}${dev} °C`}
            sub={isa == null ? null : `ISA ${Math.round(isa)} °C`}
          />
          <Stat
            label="DENSITY ALTITUDE"
            value={fmtFt(da)}
            highlight={da != null}
            warn={da != null && pa != null && da - pa > 2000}
          />
        </div>
        {da != null && pa != null && da - pa > 2000 && (
          <div style={{
            marginTop: 10, fontFamily: 'var(--cb-font-mono)', fontSize: 10,
            letterSpacing: '0.08em', color: 'var(--cp-yellow)',
          }}>
            ⚠ DENSITY ALTITUDE {fmtFt(da - pa)} ABOVE PRESSURE ALTITUDE — EXPECT REDUCED PERFORMANCE
          </div>
        )}
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

function Stat({ label, value, sub, highlight, warn }) {
  const color = warn ? 'var(--cp-yellow)' : highlight ? 'var(--cp-acc)' : 'var(--cp-txt)'
  return (
    <div style={{
      background: 'var(--cp-bg3)',
      border: '1px solid var(--cp-border2)',
      borderLeft: `3px solid ${warn ? 'var(--cp-yellow)' : highlight ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
      borderRadius: 4, padding: '14px 16px',
    }}>
      <div className="cp-label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, fontSize: 24, color, lineHeight: 1 }}>
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
