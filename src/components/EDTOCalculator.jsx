import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { interpolateAltitude2D } from '../utils/interpolation'
import lookupTables from '../data/lookupTables.json'

export default function EDTOCalculator() {
  const {
    edto, setEDTOAircraft, setEDTOVariant, setEDTOWeight,
    setEDTOIsaDeviation, setEDTOAntiIce, setEDTOResults
  } = useCalculatorStore()

  // Accepts: 72500 · 72,500 · 72.500 · 72.5 · 72,5  (with or without "kg")
  // Values ≤ 200 → treated as 1000 kg units (tonnes); values > 200 → treated as raw kg
  // Returns kg as a number, capped at 85000, or null if invalid
  function parseWeightInput(input) {
    const clean = input.replace(/kg/gi, '').replace(/\s/g, '')
    if (clean === '') return null
    const normalised = clean.replace(/,/g, '')
    const val = parseFloat(normalised)
    if (isNaN(val) || val <= 0) return null
    const raw = Math.round(val <= 200 ? val * 1000 : val)
    return { kg: Math.min(raw, 85000), capped: raw > 85000 }
  }

  function formatWeightDisplay(kg) {
    const num = typeof kg === 'string' ? parseFloat(kg) : kg
    if (isNaN(num) || num === 0) return ''
    return num.toLocaleString('en-US') + ' kg'
  }

  const [weightDisplay, setWeightDisplay] = useState(() =>
    edto.weight ? formatWeightDisplay(edto.weight) : ''
  )
  const [weightWarning, setWeightWarning] = useState('')
  const [calcDetails, setCalcDetails] = useState(null)

  const aircraft = lookupTables[edto.aircraft]
  const variants = aircraft ? Object.entries(aircraft.variants) : []
  const currentVariant = aircraft && edto.variant ? aircraft.variants[edto.variant] : null

  // Auto-select first variant when aircraft changes and none is selected
  useEffect(() => {
    if (aircraft && !edto.variant) {
      const firstVariant = Object.keys(aircraft.variants)[0]
      if (firstVariant) setEDTOVariant(firstVariant)
    }
    // aircraft is derived from edto.aircraft (static lookup table — no extra dep needed)
    // setEDTOVariant is a stable Zustand action reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edto.aircraft, aircraft])

  useEffect(() => {
    if (!edto.weight) setWeightDisplay('')
  }, [edto.weight])

  useEffect(() => {
    if (!currentVariant || !edto.weight || edto.isaDeviation === '') {
      setEDTOResults(null, null); setCalcDetails(null); return
    }
    const weight = parseFloat(edto.weight) / 1000
    const isaDeviation = parseFloat(edto.isaDeviation)
    if (isNaN(weight) || isNaN(isaDeviation)) {
      setEDTOResults(null, null); setCalcDetails(null); return
    }

    const lrcTable = currentVariant.tables.longRangeCruise
    const lrcInterp = interpolateAltitude2D(weight, isaDeviation, lrcTable.weights, lrcTable.temperatures, lrcTable.data)
    if (!lrcInterp) { setEDTOResults(null, null); setCalcDetails(null); return }
    const lrcAltRaw = lrcInterp.altitude

    const kiasTable = currentVariant.tables.kias310 ?? null
    let kiasAltRaw = null, kiasInterp = null
    if (kiasTable) {
      kiasInterp = interpolateAltitude2D(weight, isaDeviation, kiasTable.weights, kiasTable.temperatures, kiasTable.data)
      kiasAltRaw = kiasInterp?.altitude ?? null
    }

    let lrcPenalty = 0, kiasPenalty = 0
    if (edto.antiIce === 'engine') {
      lrcPenalty = lrcTable.antiIcePenalty.engine
      kiasPenalty = kiasTable ? kiasTable.antiIcePenalty.engine : 0
    } else if (edto.antiIce === 'engine-wing') {
      lrcPenalty = lrcTable.antiIcePenalty.engineAndWing
      kiasPenalty = kiasTable ? kiasTable.antiIcePenalty.engineAndWing : 0
    }

    const kiasResult = kiasAltRaw !== null ? kiasAltRaw + kiasPenalty : null
    setEDTOResults(lrcAltRaw + lrcPenalty, kiasResult)
    setCalcDetails({ lrcAltRaw, lrcPenalty, lrcInterp, kiasAltRaw, kiasPenalty, kiasInterp, kiasAvailable: !!kiasTable })
  }, [edto.weight, edto.isaDeviation, edto.variant, edto.antiIce, currentVariant])

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
        fontFamily: "var(--cb-font-mono)",
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

  const ResultCard = ({ title, value, unit, details, accentColor = 'var(--cp-acc)' }) => (
    <div style={{
      background: 'var(--cp-bg3)',
      border: '1px solid var(--cp-border2)',
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 4,
      padding: 16,
    }}>
      <div className="cp-label" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accentColor, fontFamily: "var(--cb-font-mono)", lineHeight: 1, marginBottom: 4 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: details ? 12 : 0 }}>
        {unit}
      </div>
      {details}
    </div>
  )

  const breakdown = (interp, altRaw, penalty, finalVal, accentColor) => {
    if (!interp || finalVal === null) return null
    return (
      <div style={{ borderTop: '1px solid var(--cp-border2)', paddingTop: 10, fontSize: 12, fontFamily: "var(--cb-font-mono)" }}>
        {interp.upperCol && interp.upperAlt !== null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
              <span>{interp.lowerCol}</span><span>{interp.lowerAlt.toLocaleString()} ft</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-dim)', marginBottom: 3 }}>
              <span>{interp.upperCol}</span><span>{interp.upperAlt.toLocaleString()} ft</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-muted)', borderTop: '1px solid var(--cp-border2)', paddingTop: 4, marginBottom: 3 }}>
              <span>Interpolated</span><span>{altRaw.toLocaleString()} ft</span>
            </div>
          </>
        )}
        {interp.clamped && (
          <div style={{ color: 'var(--cp-yellow)', fontSize: 11, marginBottom: 4 }}>⚠ ISA outside table range — clamped</div>
        )}
        {edto.antiIce !== 'none' && penalty !== 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cp-orange)', marginBottom: 3 }}>
              <span>Anti-ice penalty</span><span>{penalty.toLocaleString()} ft</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: accentColor, fontWeight: 700, borderTop: '1px solid var(--cp-border2)', paddingTop: 4 }}>
              <span>Final</span><span>{finalVal.toLocaleString()} ft</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Disclaimer banner ──────────────────────────────────────────────── */}
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
        Always verify performance data against your current approved flight manuals and operator documentation.
        It is the sole responsibility of the user to verify all results against current approved aircraft flight manuals,
        operator documentation, and applicable regulations. The developers of ClaudeBorne SuperApp make no warranty
        as to the accuracy of these results and accept no liability for any outcome arising from their use.
      </div>

      {/* Step 1 */}
      <div>
        <SectionHeader title="Step 1 — Aircraft" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(lookupTables).map(([key, ac]) => (
            <ChoiceBtn key={key} active={edto.aircraft === key} onClick={() => setEDTOAircraft(key)}>
              {ac.displayName}
            </ChoiceBtn>
          ))}
        </div>
      </div>

      {/* Step 2 */}
      {aircraft && (
        <div>
          <SectionHeader title="Step 2 — Engine Variant" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {variants.map(([key, variant]) => (
              <ChoiceBtn key={key} active={edto.variant === key} onClick={() => setEDTOVariant(key)}>
                {variant.displayName}
              </ChoiceBtn>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 */}
      {currentVariant && (
        <>
          <div>
            <SectionHeader title="Step 3 — Weight & Temperature" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>Aircraft Weight</div>
                <input
                  type="text"
                  value={weightDisplay}
                  onChange={e => {
                    setWeightDisplay(e.target.value)
                    const parsed = parseWeightInput(e.target.value)
                    setEDTOWeight(parsed ? String(parsed.kg) : '')
                    setWeightWarning('')
                  }}
                  onBlur={() => {
                    const parsed = parseWeightInput(weightDisplay)
                    if (parsed) {
                      setWeightDisplay(formatWeightDisplay(parsed.kg))
                      setEDTOWeight(String(parsed.kg))
                      setWeightWarning(parsed.capped ? '⚠ Weight exceeds table max — capped at 85,000 kg' : '')
                    } else {
                      setWeightDisplay('')
                      setEDTOWeight('')
                      setWeightWarning('')
                    }
                  }}
                  placeholder="e.g. 72,500 kg or 72.5"
                  className="cp-input"
                />
                {weightWarning && (
                  <div style={{ fontSize: 11, color: 'var(--cp-yellow)', marginTop: 4,
                    letterSpacing: '0.06em', fontFamily: 'var(--cb-font-mono)' }}>
                    {weightWarning}
                  </div>
                )}
              </div>
              <div>
                <div className="cp-label" style={{ marginBottom: 6 }}>ISA Deviation (°C)</div>
                <input
                  type="number"
                  value={edto.isaDeviation}
                  onChange={e => setEDTOIsaDeviation(e.target.value)}
                  placeholder="e.g. 15"
                  className="cp-input"
                />
              </div>
            </div>
          </div>

          {/* Anti-ice */}
          <div>
            <SectionHeader title="Anti-Ice Status" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ChoiceBtn active={edto.antiIce === 'none'} onClick={() => setEDTOAntiIce('none')} accentColor="var(--cp-green)">None</ChoiceBtn>
              <ChoiceBtn active={edto.antiIce === 'engine'} onClick={() => setEDTOAntiIce('engine')} accentColor="var(--cp-yellow)">Engine</ChoiceBtn>
              <ChoiceBtn active={edto.antiIce === 'engine-wing'} onClick={() => setEDTOAntiIce('engine-wing')} accentColor="var(--cp-red)">Engine + Wing</ChoiceBtn>
            </div>
          </div>

          {/* Results */}
          <div>
            <SectionHeader title="Results" />
            {(!edto.weight || edto.isaDeviation === '') ? (
              <div style={{
                background: 'var(--cp-bg3)',
                border: '1px solid var(--cp-border2)',
                borderRadius: 4,
                padding: '28px 20px',
                textAlign: 'center',
                color: 'var(--cp-dim)',
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                ↑ Enter aircraft weight and ISA deviation above to calculate EDTO altitudes
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ResultCard
                title="Long Range Cruise Altitude"
                value={edto.longRangeCruiseAlt !== null ? edto.longRangeCruiseAlt.toLocaleString() : null}
                unit="Feet · 100 ft/min ROC · Max Continuous Thrust"
                accentColor="var(--cp-acc)"
                details={calcDetails && edto.longRangeCruiseAlt !== null
                  ? breakdown(calcDetails.lrcInterp, calcDetails.lrcAltRaw, calcDetails.lrcPenalty, edto.longRangeCruiseAlt, 'var(--cp-acc)')
                  : null}
              />
              <ResultCard
                title="310 KIAS Altitude"
                accentColor="var(--cp-acc2)"
                value={
                  calcDetails && !calcDetails.kiasAvailable ? 'N/A'
                  : edto.kias310Alt !== null ? edto.kias310Alt.toLocaleString()
                  : null
                }
                unit={
                  calcDetails && !calcDetails.kiasAvailable
                    ? 'Not available for this variant'
                    : 'Feet · 100 ft/min ROC · Max Continuous Thrust'
                }
                details={calcDetails && calcDetails.kiasAvailable && edto.kias310Alt !== null
                  ? breakdown(calcDetails.kiasInterp, calcDetails.kiasAltRaw, calcDetails.kiasPenalty, edto.kias310Alt, 'var(--cp-acc2)')
                  : null}
              />
            </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
