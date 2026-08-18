import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { calcQuickTurnaroundLimitWeight } from '../utils/quickTurnaroundLimitWeight'
import lookupTables from '../data/lookupTables.json'
import ResetButton from './ResetButton'

// Accepts: 72500 · 72,500 · 72.500 · 72.5 · 72,5  (with or without "kg")
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

function fmtKg(kg) {
  return `${kg > 0 ? '+' : ''}${Math.round(kg).toLocaleString('en-US')} kg`
}

export default function QuickTurnaroundLimitWeight() {
  const {
    quickTurnaround, setQuickTurnaroundAircraft, setQuickTurnaroundField, setQuickTurnaroundResults,
  } = useCalculatorStore()

  const [weightDisplay, setWeightDisplay] = useState(() =>
    quickTurnaround.landingWeight ? formatWeightDisplay(quickTurnaround.landingWeight) : ''
  )

  const handleReset = () => {
    setQuickTurnaroundAircraft('b737-8')
    setQuickTurnaroundField({
      brakeType: 'steel', oat: '', pressureAltitude: '',
      slopePercent: '', windComponent: '', landingWeight: '',
    })
    setQuickTurnaroundResults(null)
    setWeightDisplay('')
  }

  const isNG = quickTurnaround.aircraft === 'b737-800'
  const aircraft = lookupTables[quickTurnaround.aircraft]
  const table = isNG
    ? aircraft?.quickTurnaround?.[quickTurnaround.brakeType]
    : aircraft?.quickTurnaround

  useEffect(() => {
    if (!quickTurnaround.landingWeight) setWeightDisplay('')
  }, [quickTurnaround.landingWeight])

  useEffect(() => {
    const { oat, pressureAltitude, slopePercent, windComponent, landingWeight } = quickTurnaround
    if (!table || oat === '' || pressureAltitude === '' || !landingWeight) {
      setQuickTurnaroundResults(null)
      return
    }
    const result = calcQuickTurnaroundLimitWeight({
      table, oat, pressureAltitude, slopePercent, windComponent, landingWeightKg: landingWeight,
    })
    setQuickTurnaroundResults(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickTurnaround.oat, quickTurnaround.pressureAltitude, quickTurnaround.slopePercent,
      quickTurnaround.windComponent, quickTurnaround.landingWeight, quickTurnaround.brakeType,
      quickTurnaround.aircraft, table])

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

  const inputsComplete = quickTurnaround.oat !== '' && quickTurnaround.pressureAltitude !== '' && quickTurnaround.landingWeight
  const r = quickTurnaround.results

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
            <ChoiceBtn key={key} active={quickTurnaround.aircraft === key} onClick={() => setQuickTurnaroundAircraft(key)}>
              {ac.displayName}
            </ChoiceBtn>
          ))}
        </div>
      </div>

      {isNG && (
        <div>
          <SectionHeader title="Step 2 — Brake Type" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ChoiceBtn active={quickTurnaround.brakeType === 'steel'} onClick={() => setQuickTurnaroundField({ brakeType: 'steel' })}>
              Category C · Steel
            </ChoiceBtn>
            <ChoiceBtn active={quickTurnaround.brakeType === 'carbon'} onClick={() => setQuickTurnaroundField({ brakeType: 'carbon' })}>
              Category N · Carbon
            </ChoiceBtn>
          </div>
        </div>
      )}

      {table && (
        <>
          <div>
            <SectionHeader title={`Step ${isNG ? '3' : '2'} — Conditions (${table.flapsConfig})`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Landing Weight</div>
                <input
                  type="text"
                  value={weightDisplay}
                  onChange={e => {
                    setWeightDisplay(e.target.value)
                    const kg = parseWeightInput(e.target.value)
                    setQuickTurnaroundField({ landingWeight: kg ? String(kg) : '' })
                  }}
                  onBlur={() => {
                    const kg = parseWeightInput(weightDisplay)
                    if (kg) {
                      setWeightDisplay(formatWeightDisplay(kg))
                      setQuickTurnaroundField({ landingWeight: String(kg) })
                    } else {
                      setWeightDisplay('')
                      setQuickTurnaroundField({ landingWeight: '' })
                    }
                  }}
                  placeholder="e.g. 60,000 kg or 60"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Airport OAT (°C)</div>
                <input
                  type="number"
                  value={quickTurnaround.oat}
                  onChange={e => setQuickTurnaroundField({ oat: e.target.value })}
                  placeholder="e.g. 30"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Pressure Altitude (ft)</div>
                <input
                  type="number"
                  value={quickTurnaround.pressureAltitude}
                  onChange={e => setQuickTurnaroundField({ pressureAltitude: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Runway Slope (% · + uphill / − downhill)</div>
                <input
                  type="number"
                  value={quickTurnaround.slopePercent}
                  onChange={e => setQuickTurnaroundField({ slopePercent: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Wind Component (kt · + headwind / − tailwind)</div>
                <input
                  type="number"
                  value={quickTurnaround.windComponent}
                  onChange={e => setQuickTurnaroundField({ windComponent: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
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
                ↑ Enter OAT, pressure altitude and landing weight to calculate the quick turnaround limit
              </div>
            ) : !r || r.adjustedLimitKg === null ? (
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
                borderLeft: `3px solid ${r.verdict === 'ok' ? 'var(--cp-green)' : 'var(--cp-red)'}`,
                borderRadius: 4,
                padding: 16,
              }}>
                <div className="cp-label" style={{ marginBottom: 10 }}>Quick Turnaround Limit Weight</div>
                <div style={{
                  fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: r.verdict === 'ok' ? 'var(--cp-green)' : 'var(--cp-red)',
                  fontFamily: 'var(--cb-font-mono)', marginBottom: 12,
                }}>
                  {r.verdict === 'ok' ? '✓ WITHIN LIMIT' : '⚠ EXCEEDS LIMIT'}
                </div>

                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--cp-acc)', fontFamily: 'var(--cb-font-mono)', lineHeight: 1, marginBottom: 4 }}>
                  {Math.round(r.adjustedLimitKg).toLocaleString('en-US')} kg
                </div>
                <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Adjusted Quick Turnaround Limit Weight
                </div>

                <div style={{ borderTop: '1px solid var(--cp-border2)', paddingTop: 10, fontSize: 12, fontFamily: 'var(--cb-font-mono)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Base limit weight</span>
                    <span>{Math.round(r.baseLimitKg).toLocaleString('en-US')} kg</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Slope adjustment</span>
                    <span>{fmtKg(r.slopeAdjustmentKg)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Wind adjustment</span>
                    <span>{fmtKg(r.windAdjustmentKg)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-txt)', borderTop: '1px solid var(--cp-border2)', paddingTop: 4, marginBottom: 3 }}>
                    <span>Actual landing weight</span>
                    <span>{parseFloat(quickTurnaround.landingWeight).toLocaleString('en-US')} kg</span>
                  </div>
                </div>

                {r.verdict === 'exceeds' && (
                  <div style={{
                    marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cp-border2)',
                    fontSize: 11.5, color: 'var(--cp-red)', lineHeight: 1.6, fontFamily: 'var(--cb-font-mono)',
                  }}>
                    Wait at least <b>{table.corrections.waitMinutes} minutes</b> and check wheel thermal plugs before the next takeoff
                    {table.corrections.brakeTempThresholdC != null && (
                      <> — or verify each brake pressure plate is below {table.corrections.brakeTempThresholdC}°C</>
                    )}
                    . If BTMS is installed: no wait is required if the BRAKE TEMP light stays off 10–15 min after parking,
                    and all readings stay below {table.corrections.btmsThreshold}.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
