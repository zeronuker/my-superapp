import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { calcGoAroundClimbGradient } from '../utils/goAroundClimbGradient'
import lookupTables from '../data/lookupTables.json'
import ResetButton from './ResetButton'

// Variant labels are shared with EDTO's picker (lookupTables displayName),
// except CFM56-7B26 — its Go-Around Climb Gradient table is identical under
// FAA and JAA, so that's called out here specifically. This context doesn't
// apply to EDTO (its tables don't vary by authority), so it's kept local to
// this component rather than changing the shared displayName.
const VARIANT_LABEL_OVERRIDE = { 'cfm56-7b26': 'CFM56-7B26 (FAA/JAA)' }

// Accepts: 72500 · 72,500 · 72.500 · 72.5 · 72,5  (with or without "kg")
// Values ≤ 200 → treated as 1000 kg units (tonnes); values > 200 → treated as raw kg
function parseWeightInput(input) {
  const clean = input.replace(/kg/gi, '').replace(/\s/g, '')
  if (clean === '') return null
  const normalised = clean.replace(/,/g, '')
  const val = parseFloat(normalised)
  if (isNaN(val) || val <= 0) return null
  return Math.round(val <= 200 ? val * 1000 : val)
}

function formatWeightDisplay(kg) {
  const num = typeof kg === 'string' ? parseFloat(kg) : kg
  if (isNaN(num) || num === 0) return ''
  return num.toLocaleString('en-US') + ' kg'
}

export default function GoAroundClimbGradient() {
  const {
    goAround, setGoAroundAircraft, setGoAroundVariant, setGoAroundField, setGoAroundResults,
  } = useCalculatorStore()

  const [weightDisplay, setWeightDisplay] = useState(() =>
    goAround.weight ? formatWeightDisplay(goAround.weight) : ''
  )

  const handleReset = () => {
    setGoAroundAircraft('b737-8')
    setGoAroundVariant('leap-1b25')
    setGoAroundField({
      weight: '', oat: '', pressureAltitude: '', speedOffset: '',
      bleedConfig: 'packsOn', antiIce: 'none', icingConditions: false,
    })
    setGoAroundResults(null)
    setWeightDisplay('')
  }

  const aircraft = lookupTables[goAround.aircraft]
  const variants = aircraft ? Object.entries(aircraft.variants) : []
  const currentVariant = aircraft && goAround.variant ? aircraft.variants[goAround.variant] : null
  const table = currentVariant?.tables?.goAroundClimbGradient ?? null

  // Auto-select first variant when aircraft changes and none is selected
  useEffect(() => {
    if (aircraft && !goAround.variant) {
      const firstVariant = Object.keys(aircraft.variants)[0]
      if (firstVariant) setGoAroundVariant(firstVariant)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goAround.aircraft, aircraft])

  useEffect(() => {
    if (!goAround.weight) setWeightDisplay('')
  }, [goAround.weight])

  useEffect(() => {
    const { weight, oat, pressureAltitude, speedOffset, bleedConfig, antiIce, icingConditions } = goAround
    if (!table || !weight || oat === '' || pressureAltitude === '' || speedOffset === '') {
      setGoAroundResults(null)
      return
    }
    const result = calcGoAroundClimbGradient({
      table, weightKg: weight, oat, pressureAltitude, speedOffset, bleedConfig, antiIce, icingConditions,
    })
    setGoAroundResults(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goAround.weight, goAround.oat, goAround.pressureAltitude, goAround.speedOffset,
      goAround.bleedConfig, goAround.antiIce, goAround.icingConditions, goAround.variant, table])

  const SectionHeader = ({ title }) => (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )

  const ChoiceBtn = ({ active, onClick, children, accentColor }) => (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--cp-accdim)' : 'transparent',
        border: `1px solid ${active ? (accentColor || 'var(--cp-acc)') : 'var(--cp-border)'}`,
        borderRadius: 4,
        color: active ? (accentColor || 'var(--cp-acc)') : 'var(--cp-dim)',
        fontFamily: 'var(--cb-font-mono)',
        fontSize: 12,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '7px 18px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )

  const sel = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
    fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer', width: '100%',
  }

  const inputsComplete = goAround.weight && goAround.oat !== '' && goAround.pressureAltitude !== '' && goAround.speedOffset !== ''
  const r = goAround.results

  const StageRow = ({ label, value, unit = '%' }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
      <span>{label}</span>
      <span>{value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <ResetButton onReset={handleReset} />

      <div style={{
        background: 'rgba(59,141,255,0.06)',
        border: '1px solid rgba(59,141,255,0.2)',
        borderLeft: '3px solid var(--cb-blue)',
        borderRadius: 4,
        padding: '10px 14px',
        fontFamily: 'var(--cb-font-mono)',
        fontSize: 11,
        letterSpacing: '0.08em',
        lineHeight: 1.7,
        color: 'var(--cp-dim)',
        textAlign: 'justify',
      }}>
        <span style={{ color: 'var(--cb-blue)', fontWeight: 700, letterSpacing: '0.15em' }}>ℹ INFO · </span>
        Performance data must always be verified against your current approved aircraft flight manuals and operator documentation.
        Compliance with all applicable regulations remains the sole responsibility of the user.
      </div>

      <div>
        <SectionHeader title="Step 1 — Aircraft" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(lookupTables).map(([key, ac]) => (
            <ChoiceBtn key={key} active={goAround.aircraft === key} onClick={() => setGoAroundAircraft(key)}>
              {ac.displayName}
            </ChoiceBtn>
          ))}
        </div>
      </div>

      {aircraft && (
        <div>
          <SectionHeader title="Step 2 — Engine Variant" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {variants.map(([key, variant]) => (
              <ChoiceBtn key={key} active={goAround.variant === key} onClick={() => setGoAroundVariant(key)}>
                {VARIANT_LABEL_OVERRIDE[key] || variant.displayName}
              </ChoiceBtn>
            ))}
          </div>
        </div>
      )}

      {table && (
        <>
          <div>
            <SectionHeader title={`Step 3 — Conditions (${table.flapsConfig})`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Airport OAT (°C)</div>
                <input
                  type="number"
                  value={goAround.oat}
                  onChange={e => setGoAroundField({ oat: e.target.value })}
                  placeholder="e.g. 30"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Pressure Altitude (ft)</div>
                <input
                  type="number"
                  value={goAround.pressureAltitude}
                  onChange={e => setGoAroundField({ pressureAltitude: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Landing Weight</div>
                <input
                  type="text"
                  value={weightDisplay}
                  onChange={e => {
                    setWeightDisplay(e.target.value)
                    const kg = parseWeightInput(e.target.value)
                    setGoAroundField({ weight: kg ? String(kg) : '' })
                  }}
                  onBlur={() => {
                    const kg = parseWeightInput(weightDisplay)
                    if (kg) {
                      setWeightDisplay(formatWeightDisplay(kg))
                      setGoAroundField({ weight: String(kg) })
                    } else {
                      setWeightDisplay('')
                      setGoAroundField({ weight: '' })
                    }
                  }}
                  placeholder="e.g. 60,000 kg or 60"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Speed above VREF40</div>
                <select
                  value={goAround.speedOffset}
                  onChange={e => setGoAroundField({ speedOffset: e.target.value })}
                  style={sel}
                >
                  <option value="" disabled>Select…</option>
                  {table.speedAdjustment.speedOffset.map(offset => (
                    <option key={offset} value={offset}>{offset === 0 ? 'VREF40' : `VREF40+${offset}`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <SectionHeader title="Engine Bleed" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ChoiceBtn active={goAround.bleedConfig === 'packsOn'} onClick={() => setGoAroundField({ bleedConfig: 'packsOn' })} accentColor="var(--cp-green)">Packs On</ChoiceBtn>
              <ChoiceBtn active={goAround.bleedConfig === 'packsOff'} onClick={() => setGoAroundField({ bleedConfig: 'packsOff' })} accentColor="var(--cp-yellow)">Packs Off</ChoiceBtn>
            </div>
          </div>

          <div>
            <SectionHeader title="Anti-Ice Status" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ChoiceBtn active={goAround.antiIce === 'none'} onClick={() => setGoAroundField({ antiIce: 'none' })} accentColor="var(--cp-green)">None</ChoiceBtn>
              <ChoiceBtn active={goAround.antiIce === 'engine'} onClick={() => setGoAroundField({ antiIce: 'engine' })} accentColor="var(--cp-yellow)">Engine</ChoiceBtn>
              <ChoiceBtn active={goAround.antiIce === 'engineAndWing'} onClick={() => setGoAroundField({ antiIce: 'engineAndWing' })} accentColor="var(--cp-red)">Engine + Wing</ChoiceBtn>
            </div>
          </div>

          <div>
            <SectionHeader title="Icing Conditions" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ChoiceBtn active={!goAround.icingConditions} onClick={() => setGoAroundField({ icingConditions: false })} accentColor="var(--cp-green)">No</ChoiceBtn>
              <ChoiceBtn active={goAround.icingConditions} onClick={() => setGoAroundField({ icingConditions: true })} accentColor="var(--cp-red)">
                Yes — forecast landing temp {table.corrections.icingInclusive ? '≤' : '<'} {table.corrections.icingThresholdC}°C
              </ChoiceBtn>
            </div>
          </div>

          <div>
            <SectionHeader title="Results" />
            {!inputsComplete ? (
              <div className="cp-card-bg3" style={{
                border: '1px solid var(--cp-border2)',
                borderRadius: 4,
                padding: '28px 20px',
                textAlign: 'center',
                color: 'var(--cp-dim)',
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                ↑ Enter weight, OAT, pressure altitude and speed above to calculate the go-around climb gradient
              </div>
            ) : !r || r.finalGradient === null ? (
              <div className="cp-card-bg3" style={{
                border: '1px solid var(--cp-border2)',
                borderLeft: '3px solid var(--cp-yellow)',
                borderRadius: 4,
                padding: '16px 20px',
                color: 'var(--cp-yellow)',
                fontSize: 12,
                letterSpacing: '0.06em',
              }}>
                ⚠ No published data for this combination of inputs — outside the table's range, or an
                uncertified OAT/pressure-altitude combination. Check your entries against the source manual.
              </div>
            ) : (
              <div className="cp-card-bg3" style={{
                border: '1px solid var(--cp-border2)',
                borderLeft: '3px solid var(--cp-acc)',
                borderRadius: 4,
                padding: 16,
              }}>
                <div className="cp-label" style={{ marginBottom: 10 }}>Go-Around Climb Gradient (ENG INOP)</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--cp-acc)', fontFamily: 'var(--cb-font-mono)', lineHeight: 1, marginBottom: 4 }}>
                  {r.finalGradient > 0 ? '+' : ''}{r.finalGradient.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                  {table.flapsConfig}
                </div>

                <div style={{ borderTop: '1px solid var(--cp-border2)', paddingTop: 10, fontSize: 12, fontFamily: 'var(--cb-font-mono)' }}>
                  <StageRow label="Reference gradient" value={r.referenceGradient} />
                  <StageRow label="Weight adjustment" value={r.weightAdjustment} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-muted)', borderTop: '1px solid var(--cp-border2)', paddingTop: 4, marginBottom: 3 }}>
                    <span>Weight-adjusted gradient</span>
                    <span>{r.weightAdjustedGradient == null ? '—' : `${r.weightAdjustedGradient.toFixed(2)}%`}</span>
                  </div>
                  <StageRow label="Speed adjustment" value={r.speedAdjustment} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-muted)', borderTop: '1px solid var(--cp-border2)', paddingTop: 4, marginBottom: 3 }}>
                    <span>Speed-adjusted gradient</span>
                    <span>{r.speedAdjustedGradient == null ? '—' : `${r.speedAdjustedGradient.toFixed(2)}%`}</span>
                  </div>
                  {r.corrections.packsOff !== 0 && <StageRow label="Packs off correction" value={r.corrections.packsOff} />}
                  {r.corrections.antiIce !== 0 && <StageRow label="Anti-ice correction" value={r.corrections.antiIce} />}
                  {r.corrections.icing !== 0 && <StageRow label="Icing conditions correction" value={r.corrections.icing} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-acc)', fontWeight: 700, borderTop: '1px solid var(--cp-border2)', paddingTop: 4 }}>
                    <span>Final gradient</span>
                    <span>{r.finalGradient.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
