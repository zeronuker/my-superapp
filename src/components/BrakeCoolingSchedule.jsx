import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { calcBrakeCoolingSchedule } from '../utils/brakeCoolingSchedule'
import lookupTables from '../data/lookupTables.json'

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

const EVENTS = [
  { id: 'rtoMaxMan', label: 'RTO · Max Manual' },
  { id: 'maxMan', label: 'Landing · Max Manual' },
  { id: 'maxAuto', label: 'Landing · Max Auto' },
  { id: 'autobrake3', label: 'Autobrake 3' },
  { id: 'autobrake2', label: 'Autobrake 2' },
  { id: 'autobrake1', label: 'Autobrake 1' },
]

const ZONE_INFO = {
  none:              { label: '✓ No Wait Required', color: 'var(--cp-green)' },
  noSpecialProcedure:{ label: '✓ No Special Procedure Required', color: 'var(--cp-green)' },
  caution:           { label: '⚠ Caution — Fuse Plugs May Melt', color: 'var(--cp-yellow)' },
  fusePlugMelt:      { label: '⚠ Fuse Plug Melt Zone', color: 'var(--cp-red)' },
}

const ZONE_GUIDANCE = {
  caution: 'Wheel fuse plugs may melt. Delay takeoff and inspect after one hour. If overheat occurs after takeoff, extend gear soon for at least 7 minutes.',
  fusePlugMelt: 'Clear runway immediately. Unless required, do not set parking brake. Do not approach gear or attempt to taxi for one hour. Tire, wheel and brake replacement may be required. If overheat occurs after takeoff, extend gear soon for at least 12 minutes.',
}

function fmt(n, digits = 1) {
  return n == null ? '—' : n.toFixed(digits)
}

const BrakeCoolingSchedule = forwardRef(function BrakeCoolingSchedule(props, ref) {
  const { brakeCooling: bc, setBrakeCoolingAircraft, setBrakeCoolingField, setBrakeCoolingResults } = useCalculatorStore()

  const [weightDisplay, setWeightDisplay] = useState(() =>
    bc.weight ? formatWeightDisplay(bc.weight) : ''
  )

  const handleReset = () => {
    setBrakeCoolingAircraft('b737-8')
    setBrakeCoolingField({
      brakeType: 'steel', mode: 'single',
      weight: '', oat: '', pressureAltitude: '', speed: '', windComponent: '',
      event: 'maxMan', reverseThrust: false,
      residualEnergy: '', taxiDistance: '',
    })
    setBrakeCoolingResults(null)
    setWeightDisplay('')
  }

  useImperativeHandle(ref, () => ({ reset: handleReset }))

  const isNG = bc.aircraft === 'b737-800'
  const aircraft = lookupTables[bc.aircraft]
  const tables = isNG ? aircraft?.brakeCooling?.[bc.brakeType] : aircraft?.brakeCooling

  useEffect(() => {
    if (!bc.weight) setWeightDisplay('')
  }, [bc.weight])

  const inputsComplete = bc.weight && bc.oat !== '' && bc.pressureAltitude !== '' && bc.speed !== ''

  useEffect(() => {
    if (!tables || !inputsComplete) {
      setBrakeCoolingResults(null)
      return
    }
    const result = calcBrakeCoolingSchedule({
      ...tables,
      weightKg: bc.weight, oatC: bc.oat, altitudeFt: bc.pressureAltitude,
      speedKias: bc.speed, windKt: bc.windComponent,
      event: bc.event, reverseThrust: bc.reverseThrust,
      residualEnergy: bc.mode === 'chain' ? bc.residualEnergy : 0,
      taxiDistanceMiles: bc.mode === 'chain' ? bc.taxiDistance : 0,
    })
    setBrakeCoolingResults(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bc.weight, bc.oat, bc.pressureAltitude, bc.speed, bc.windComponent, bc.event,
      bc.reverseThrust, bc.mode, bc.residualEnergy, bc.taxiDistance, bc.aircraft, bc.brakeType, tables])

  const r = bc.results

  const carryForward = () => {
    if (!r || r.totalEnergy == null) return
    setBrakeCoolingField({ residualEnergy: r.totalEnergy.toFixed(1), taxiDistance: '' })
  }

  const SectionHeader = ({ title }) => (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )

  const sel = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
    fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer', width: '100%',
  }

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

  let step = 1
  const stepAircraft = step++
  const stepBrakeType = isNG ? step++ : null
  const stepMode = step++
  const stepConditions = step++

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

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
        <SectionHeader title={`Step ${stepAircraft} — Aircraft`} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(lookupTables).map(([key, ac]) => (
            <ChoiceBtn key={key} active={bc.aircraft === key} onClick={() => setBrakeCoolingAircraft(key)}>
              {ac.displayName}
            </ChoiceBtn>
          ))}
        </div>
      </div>

      {isNG && (
        <div>
          <SectionHeader title={`Step ${stepBrakeType} — Brake Type`} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ChoiceBtn active={bc.brakeType === 'steel'} onClick={() => setBrakeCoolingField({ brakeType: 'steel' })}>
              Category C · Steel
            </ChoiceBtn>
            <ChoiceBtn active={bc.brakeType === 'carbon'} onClick={() => setBrakeCoolingField({ brakeType: 'carbon' })}>
              Category N · Carbon
            </ChoiceBtn>
          </div>
        </div>
      )}

      <div>
        <SectionHeader title={`Step ${stepMode} — Mode`} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ChoiceBtn active={bc.mode === 'single'} onClick={() => setBrakeCoolingField({ mode: 'single' })}>
            Single Event
          </ChoiceBtn>
          <ChoiceBtn active={bc.mode === 'chain'} onClick={() => setBrakeCoolingField({ mode: 'chain' })}>
            Chain · Quick Turnaround
          </ChoiceBtn>
        </div>
      </div>

      {tables && (
        <>
          <div>
            <SectionHeader title={`Step ${stepConditions} — Conditions`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Aircraft Weight</div>
                <input
                  type="text"
                  value={weightDisplay}
                  onChange={e => {
                    setWeightDisplay(e.target.value)
                    const kg = parseWeightInput(e.target.value)
                    setBrakeCoolingField({ weight: kg ? String(kg) : '' })
                  }}
                  onBlur={() => {
                    const kg = parseWeightInput(weightDisplay)
                    if (kg) {
                      setWeightDisplay(formatWeightDisplay(kg))
                      setBrakeCoolingField({ weight: String(kg) })
                    } else {
                      setWeightDisplay('')
                      setBrakeCoolingField({ weight: '' })
                    }
                  }}
                  placeholder="e.g. 72,500 kg or 72.5"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>OAT (°C)</div>
                <input
                  type="number"
                  value={bc.oat}
                  onChange={e => setBrakeCoolingField({ oat: e.target.value })}
                  placeholder="e.g. 15"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Pressure Altitude (ft)</div>
                <input
                  type="number"
                  value={bc.pressureAltitude}
                  onChange={e => setBrakeCoolingField({ pressureAltitude: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Brakes-On Speed (KIAS)</div>
                <input
                  type="number"
                  value={bc.speed}
                  onChange={e => setBrakeCoolingField({ speed: e.target.value })}
                  placeholder="e.g. 130"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Wind Component (kt · + headwind / − tailwind)</div>
                <input
                  type="number"
                  value={bc.windComponent}
                  onChange={e => setBrakeCoolingField({ windComponent: e.target.value })}
                  placeholder="e.g. 0"
                  className="cp-input"
                />
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Event</div>
                <select
                  value={bc.event}
                  onChange={e => setBrakeCoolingField({ event: e.target.value })}
                  style={sel}
                >
                  {EVENTS.map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cp-label" style={{ marginBottom: 6 }}>Reverse Thrust</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: bc.mode === 'chain' ? 16 : 0 }}>
              <ChoiceBtn active={!bc.reverseThrust} onClick={() => setBrakeCoolingField({ reverseThrust: false })}>
                None
              </ChoiceBtn>
              <ChoiceBtn active={bc.reverseThrust} onClick={() => setBrakeCoolingField({ reverseThrust: true })}>
                Two-Engine
              </ChoiceBtn>
            </div>

            {bc.mode === 'chain' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div className="cp-label" style={{ marginBottom: 6 }}>Residual Energy (millions ft-lb/brake)</div>
                  <input
                    type="number"
                    value={bc.residualEnergy}
                    onChange={e => setBrakeCoolingField({ residualEnergy: e.target.value })}
                    placeholder="e.g. 0 — from a prior stop"
                    className="cp-input"
                  />
                </div>
                <div>
                  <div className="cp-label" style={{ marginBottom: 6 }}>Taxi Distance Since Last Stop (miles)</div>
                  <input
                    type="number"
                    value={bc.taxiDistance}
                    onChange={e => setBrakeCoolingField({ taxiDistance: e.target.value })}
                    placeholder="e.g. 0"
                    className="cp-input"
                  />
                </div>
              </div>
            )}
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
                ↑ Enter weight, OAT, pressure altitude and speed to calculate the cooling schedule
              </div>
            ) : !r || r.outOfRange ? (
              <div className="cp-card-bg3" style={{
                border: '1px solid var(--cp-border2)',
                borderLeft: '3px solid var(--cp-yellow)',
                borderRadius: 4,
                padding: '16px 20px',
                color: 'var(--cp-yellow)',
                fontSize: 12,
                letterSpacing: '0.06em',
              }}>
                ⚠ No published data for this combination of inputs — outside the table's range
                (weight, OAT, altitude or brakes-on speed). Check your entries against the source manual.
              </div>
            ) : (
              <div className="cp-card-bg3" style={{
                border: '1px solid var(--cp-border2)',
                borderLeft: `3px solid ${ZONE_INFO[r.schedule.zone].color}`,
                borderRadius: 4,
                padding: 16,
              }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: ZONE_INFO[r.schedule.zone].color,
                  fontFamily: 'var(--cb-font-mono)', marginBottom: 12,
                }}>
                  {ZONE_INFO[r.schedule.zone].label}
                </div>

                {(r.schedule.zone === 'none' || r.schedule.zone === 'noSpecialProcedure') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--cp-acc)', fontFamily: 'var(--cb-font-mono)', lineHeight: 1, marginBottom: 4 }}>
                        {fmt(r.schedule.gearDownMinutes)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Min · Inflight Gear Down
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--cp-acc2)', fontFamily: 'var(--cb-font-mono)', lineHeight: 1, marginBottom: 4 }}>
                        {fmt(r.schedule.groundMinutes)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Min · On Ground
                      </div>
                    </div>
                  </div>
                )}

                {ZONE_GUIDANCE[r.schedule.zone] && (
                  <div style={{
                    fontSize: 11.5, color: ZONE_INFO[r.schedule.zone].color, lineHeight: 1.6,
                    fontFamily: 'var(--cb-font-mono)', marginBottom: 12,
                  }}>
                    {ZONE_GUIDANCE[r.schedule.zone]}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--cp-border2)', paddingTop: 10, fontSize: 12, fontFamily: 'var(--cb-font-mono)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Wind-corrected speed</span>
                    <span>{fmt(r.effectiveSpeed)} KIAS</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Reference brake energy</span>
                    <span>{fmt(r.referenceEnergy)} M ft-lb</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                    <span>Energy added this stop</span>
                    <span>{fmt(r.addedEnergy)} M ft-lb</span>
                  </div>
                  {bc.mode === 'chain' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                        <span>Residual energy</span>
                        <span>{fmt(r.residual)} M ft-lb</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
                        <span>Taxi energy added</span>
                        <span>{fmt(r.taxiAdded)} M ft-lb</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-txt)', borderTop: '1px solid var(--cp-border2)', paddingTop: 4, marginBottom: 3 }}>
                    <span>Total event adjusted energy</span>
                    <span>{fmt(r.totalEnergy)} M ft-lb</span>
                  </div>
                  {r.schedule.brakeTempIndication != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginTop: 3 }}>
                      <span>Equivalent MFD brake-temp reading</span>
                      <span>{fmt(r.schedule.brakeTempIndication)}</span>
                    </div>
                  )}
                </div>

                {bc.mode === 'chain' && (
                  <button
                    onClick={carryForward}
                    style={{
                      marginTop: 12, width: '100%',
                      background: 'transparent', border: '1px solid var(--cp-border2)', borderRadius: 4,
                      color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 11,
                      letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 12px', cursor: 'pointer',
                    }}
                  >
                    ↳ Carry Total Forward as Next Stop's Residual
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
})

export default BrakeCoolingSchedule
