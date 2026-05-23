import React, { useState, useMemo } from 'react'
import { lookupFDP, getBandLabelForResult } from '../data/ftlTables'

// ── Time helpers ──────────────────────────────────────────────────────────────

/**
 * Accepts "HH:MM" or "HHMM" (4-digit) → "HH:MM", or "" on invalid.
 * Used for clock times (0000–2359).
 */
function normalizeTime(str) {
  if (!str) return ''
  const s = str.trim().replace(/[^0-9:]/g, '')
  let h, m
  if (s.includes(':')) {
    ;[h, m] = s.split(':').map(Number)
  } else if (s.length === 4) {
    h = parseInt(s.slice(0, 2), 10)
    m = parseInt(s.slice(2), 10)
  } else if (s.length === 3) {
    h = parseInt(s[0], 10)
    m = parseInt(s.slice(1), 10)
  } else {
    return ''
  }
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Accepts "H:MM", "HH:MM" or "HHMM" → minutes, or null on invalid.
 * Used for durations (rest periods, sector lengths).
 */
function parseDur(str) {
  if (!str) return null
  const s = str.trim().replace(/[^0-9:]/g, '')
  let h, m
  if (s.includes(':')) {
    ;[h, m] = s.split(':').map(Number)
  } else if (s.length === 4) {
    h = parseInt(s.slice(0, 2), 10)
    m = parseInt(s.slice(2), 10)
  } else if (s.length === 3) {
    h = parseInt(s[0], 10)
    m = parseInt(s.slice(1), 10)
  } else {
    return null
  }
  if (isNaN(h) || isNaN(m) || m > 59) return null
  return h * 60 + m
}

function toMins(hhmm) {
  const n = normalizeTime(hhmm)
  if (!n) return 0
  const [h, m] = n.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(totalMins) {
  const t = ((totalMins % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function diffMins(from, to) {
  let d = toMins(to) - toMins(from)
  if (d < 0) d += 1440
  return d
}

function fmtDur(mins) {
  if (mins == null || isNaN(mins)) return '–'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// ── FTL computation ───────────────────────────────────────────────────────────

function computeFTL({
  reportTime, sectors, crewType, acclimatised,
  isCabinCrew,
  precedingRestStr,
  longRange, longestSectorStr,
  standby, standbyStart,
  ifr, ifrType, ifrRestStr,
  splitDuty, splitRestStr,
  picDiscretion,
}) {
  const notes  = []
  const errors = []

  // Normalize clock-time inputs (accept HH:MM or HHMM)
  reportTime  = normalizeTime(reportTime)  || reportTime
  standbyStart = normalizeTime(standbyStart) || standbyStart

  // Preceding rest (hours) — needed for Table B
  const precedingRestMins = parseDur(precedingRestStr)
  const precedingRestH    = precedingRestMins != null ? precedingRestMins / 60 : 0

  if (!acclimatised && crewType === '2crew' && !precedingRestMins) {
    return { error: 'Enter preceding rest period — required for Table B (non-acclimatised)' }
  }

  // 1. Effective sector count — long range Ch. 2.11
  let effSectors = sectors
  if (longRange && crewType === '2crew') {
    const lsMins = parseDur(longestSectorStr)
    if (lsMins && lsMins >= 7 * 60) {
      let add
      if (acclimatised) {
        add = lsMins > 11 * 60 ? 4 : lsMins > 9 * 60 ? 3 : 2
      } else {
        if (lsMins > 11 * 60) {
          errors.push('Long range sector >11h: not permitted for non-acclimatised crew (Ch. 2.11)')
          add = null
        } else {
          add = 4
        }
      }
      if (add != null) {
        effSectors = (sectors - 1) + add
        if (add > 1) notes.push(`Long range Ch. 2.11: longest sector counts as ${add} → effective ${effSectors} sector(s)`)
      }
    }
  }

  // 2. Base FDP lookup
  const baseFDP = lookupFDP(reportTime, effSectors, crewType, acclimatised, precedingRestH)
  if (baseFDP == null) return { error: 'Table lookup failed — check inputs' }

  const bandLabel  = getBandLabelForResult(reportTime, crewType, acclimatised, precedingRestH)
  const tableLabel = crewType === 'single' ? 'C' : acclimatised ? 'A' : 'B'

  // 2a. Cabin crew allowance Ch. 2.21.2 (+1h on base FDP)
  const cabinAllowance = isCabinCrew ? 60 : 0
  let fdp = baseFDP + cabinAllowance
  let standbyReduction = 0

  // 3. Standby Ch. 2.9
  if (standby && standbyStart) {
    const sbMins = diffMins(standbyStart, reportTime)
    if (sbMins > 12 * 60) errors.push('Standby exceeds 12h maximum (Ch. 2.9)')
    if (sbMins >= 6 * 60) {
      standbyReduction = sbMins - 6 * 60
      fdp = Math.max(0, fdp - standbyReduction)
      notes.push(`Standby Case B (≥6h): −${fmtDur(standbyReduction)} (Ch. 2.9)`)
    } else {
      notes.push('Standby Case A (<6h): no FDP reduction (Ch. 2.9)')
    }
  }

  // 4. In-flight relief Ch. 2.12
  let ifrExtension = 0
  if (ifr) {
    const restMins = parseDur(ifrRestStr)
    if (!restMins) {
      notes.push('IFR: enter rest period duration')
    } else if (restMins < 3 * 60) {
      notes.push('IFR rest <3h: no extension applies (Ch. 2.12)')
    } else {
      const cap = ifrType === 'bunk' ? 18 * 60 : 15 * 60
      ifrExtension = ifrType === 'bunk' ? Math.floor(restMins / 2) : Math.floor(restMins / 3)
      const before = fdp
      fdp = Math.min(fdp + ifrExtension, cap)
      if (fdp < before + ifrExtension)
        notes.push(`FDP capped at ${fmtDur(cap)} (${ifrType} rest limit Ch. 2.12)`)
    }
  }

  // 5. Split duty Ch. 2.13
  let splitExtension = 0
  if (splitDuty) {
    const restMins = parseDur(splitRestStr)
    if (!restMins) {
      notes.push('Split duty: enter rest period duration')
    } else if (restMins < 3 * 60) {
      notes.push('Split duty rest <3h: no extension applies (Ch. 2.13)')
    } else if (restMins > 10 * 60) {
      notes.push('Split duty rest >10h: extension not applicable (Ch. 2.13)')
    } else {
      splitExtension = Math.floor(restMins / 2)
      fdp += splitExtension
    }
  }

  // 6. PIC discretion (+1h)
  let picExtension = 0
  if (picDiscretion) {
    picExtension = 60
    fdp += 60
  }

  return {
    ok: true,
    baseFDP, effSectors, fdp,
    endTime: toHHMM(toMins(reportTime) + fdp),
    tableLabel, bandLabel,
    breakdown: { cabinAllowance, standbyReduction, ifrExtension, splitExtension, picExtension },
    notes, errors,
  }
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--cp-border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
      {options.map((opt, i) => {
        const active = value === opt.value
        return (
          <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{
            background:  active ? 'var(--cp-accdim)' : 'transparent',
            border:      'none',
            borderRight: i < options.length - 1 ? '1px solid var(--cp-border)' : 'none',
            color:       active ? 'var(--cp-acc)' : 'var(--cp-dim)',
            fontFamily:  'var(--cb-font-mono)',
            fontSize: 10, letterSpacing: '0.1em',
            padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Row({ label, note, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="cp-label">{label}</span>
        {children}
      </div>
      {note && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', marginTop: 4, letterSpacing: '0.06em' }}>
          {note}
        </div>
      )}
    </div>
  )
}

function Section({ title, toggle, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="cp-section-header">
        <span className="cp-section-title">{title}</span>
        {toggle && <div style={{ flexShrink: 0 }}>{toggle}</div>}
        <div className="cp-divider" />
      </div>
      {children}
    </div>
  )
}

// ── Main calculator ───────────────────────────────────────────────────────────

export default function FTLCalculator() {
  const [aircraft,       setAircraft]       = useState('aeroplane')
  const [crewCat,        setCrewCat]        = useState('flight')
  const [crewType,       setCrewType]       = useState('2crew')
  const [acclimatised,   setAcclimatised]   = useState(true)
  const [reportTime,     setReportTime]     = useState('')
  const [sectors,        setSectors]        = useState(1)
  const [precedingRest,  setPrecedingRest]  = useState('')
  const [longRange,      setLongRange]      = useState(false)
  const [longestSector,  setLongestSector]  = useState('')
  const [standby,        setStandby]        = useState(false)
  const [standbyStart,   setStandbyStart]   = useState('')
  const [ifr,            setIfr]            = useState(false)
  const [ifrType,        setIfrType]        = useState('bunk')
  const [ifrRest,        setIfrRest]        = useState('')
  const [splitDuty,      setSplitDuty]      = useState(false)
  const [splitRest,      setSplitRest]      = useState('')
  const [picDisc,        setPicDisc]        = useState(false)

  const effectiveCrew  = crewCat === 'cabin' ? '2crew' : crewType
  const needsTableB    = effectiveCrew === '2crew' && !acclimatised
  const maxSectors     = 8

  const result = useMemo(() => {
    if (!reportTime) return null
    return computeFTL({
      reportTime,
      sectors:          Math.min(sectors, maxSectors),
      crewType:         effectiveCrew,
      acclimatised,
      isCabinCrew:      crewCat === 'cabin',
      precedingRestStr: precedingRest,
      longRange,        longestSectorStr: longestSector,
      standby,          standbyStart,
      ifr,              ifrType, ifrRestStr: ifrRest,
      splitDuty,        splitRestStr: splitRest,
      picDiscretion:    picDisc,
    })
  }, [
    reportTime, sectors, effectiveCrew, acclimatised, precedingRest,
    longRange, longestSector,
    standby, standbyStart,
    ifr, ifrType, ifrRest,
    splitDuty, splitRest,
    picDisc,
  ])

  const inp = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
    fontSize: 13, padding: '7px 10px', outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <div>
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
        marginBottom: 20,
      }}>
        <span style={{ color: 'var(--cb-blue)', fontWeight: 700, letterSpacing: '0.15em' }}>ℹ INFO · </span>
        This calculator is based on CAD 1901 (CAAM) and is intended as a reference aid only.
        Flight duty periods and limitation calculations must always be verified against your current approved operations manual,
        company procedures, or crewing/rostering departments. It is the sole responsibility of the user to ensure
        compliance with all applicable FTL rules. The developers of ClaudeBorne SuperApp make no warranty
        as to the accuracy of these results and accept no liability for any outcome arising from their use.
      </div>

      {/* Page header */}
      <div className="cp-section-header" style={{ marginBottom: 20 }}>
        <span className="cp-section-title">FTL CALCULATOR</span>
        <div className="cp-divider" />
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>
          CAD 1901 · CAAM MALAYSIA
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Inputs ──────────────────────────────────────────────── */}
        <div>

          {/* Crew */}
          <Section title="CREW">
            <Row label="AIRCRAFT">
              <Seg
                options={[{ value: 'aeroplane', label: 'AEROPLANE' }, { value: 'helicopter', label: 'HELICOPTER' }]}
                value={aircraft} onChange={setAircraft}
              />
            </Row>
            <Row label="POSITION">
              <Seg
                options={[{ value: 'flight', label: 'FLIGHT CREW' }, { value: 'cabin', label: 'CABIN CREW' }]}
                value={crewCat} onChange={setCrewCat}
              />
            </Row>
            {crewCat === 'flight' && (
              <Row label="TYPE">
                <Seg
                  options={[{ value: '2crew', label: '2+ CREW' }, { value: 'single', label: 'SINGLE' }]}
                  value={crewType} onChange={setCrewType}
                />
              </Row>
            )}
            <Row label="ACCLIMATISED">
              <Seg
                options={[{ value: true, label: 'YES' }, { value: false, label: 'NO' }]}
                value={acclimatised} onChange={setAcclimatised}
              />
            </Row>
          </Section>

          {/* Flight details */}
          <Section title="FLIGHT DETAILS">
            <Row label="REPORT TIME">
              <input
                type="text" value={reportTime} placeholder="HH:MM"
                onChange={e => setReportTime(e.target.value)}
                onBlur={e => { const n = normalizeTime(e.target.value); if (n) setReportTime(n) }}
                style={{ ...inp, width: 100, textAlign: 'center' }}
                maxLength={5}
              />
            </Row>
            <Row label="SECTORS">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="cp-btn" style={{ padding: '4px 12px', fontSize: 16, lineHeight: 1 }}
                  onClick={() => setSectors(s => Math.max(1, s - 1))}>−</button>
                <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--cp-txt)', minWidth: 28, textAlign: 'center' }}>
                  {Math.min(sectors, maxSectors)}
                </span>
                <button className="cp-btn" style={{ padding: '4px 12px', fontSize: 16, lineHeight: 1 }}
                  onClick={() => setSectors(s => Math.min(maxSectors, s + 1))}>+</button>
              </div>
            </Row>
            {crewCat === 'flight' && crewType === '2crew' && (
              <Row label="LONG RANGE" note={longRange ? 'Duration of longest individual sector (Ch. 2.11)' : undefined}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg
                    options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                    value={longRange} onChange={setLongRange}
                  />
                  {longRange && (
                    <input type="text" placeholder="H:MM"
                      value={longestSector} onChange={e => setLongestSector(e.target.value)}
                      onBlur={e => { const m = parseDur(e.target.value); if (m != null) setLongestSector(fmtDur(m)) }}
                      style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                    />
                  )}
                </div>
              </Row>
            )}
          </Section>

          {/* Preceding rest — only shown for Table B (not acclimatised, 2+ crew) */}
          {needsTableB && (
            <Section title="PRECEDING REST">
              <Row
                label="REST DURATION"
                note="Rest period before this duty — selects Table B row (Ch. 2.10)"
              >
                <input type="text" placeholder="H:MM or HHMM"
                  value={precedingRest} onChange={e => setPrecedingRest(e.target.value)}
                  onBlur={e => { const m = parseDur(e.target.value); if (m != null) setPrecedingRest(fmtDur(m)) }}
                  style={{ ...inp, width: 110, textAlign: 'center' }} maxLength={5}
                />
              </Row>
              <div style={{
                fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)',
                lineHeight: 1.7, letterSpacing: '0.06em', padding: '0 0 4px',
              }}>
                ≤18h or ≥30h → more restrictive FDP limit<br />
                18–30h → less restrictive FDP limit
              </div>
            </Section>
          )}

          {/* Standby */}
          <Section title="STANDBY" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={standby} onChange={setStandby} />
          }>
            {standby && (
              <Row label="STANDBY START" note="Max 12h standby (Ch. 2.9)">
                <input type="text" value={standbyStart} placeholder="HH:MM"
                  onChange={e => setStandbyStart(e.target.value)}
                  onBlur={e => { const n = normalizeTime(e.target.value); if (n) setStandbyStart(n) }}
                  style={{ ...inp, width: 100, textAlign: 'center' }}
                  maxLength={5}
                />
              </Row>
            )}
          </Section>

          {/* In-flight relief — 2+ crew only */}
          {effectiveCrew === '2crew' && (
            <Section title="IN-FLIGHT RELIEF" toggle={
              <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                value={ifr} onChange={setIfr} />
            }>
              {ifr && (
                <>
                  <Row label="REST TYPE">
                    <Seg
                      options={[
                        { value: 'bunk', label: 'BUNK  ×½  max 18h' },
                        { value: 'seat', label: 'SEAT  ×⅓  max 15h' },
                      ]}
                      value={ifrType} onChange={setIfrType}
                    />
                  </Row>
                  <Row label="REST PERIOD" note="Minimum 3h required (Ch. 2.12)">
                    <input type="text" placeholder="H:MM"
                      value={ifrRest} onChange={e => setIfrRest(e.target.value)}
                      onBlur={e => { const m = parseDur(e.target.value); if (m != null) setIfrRest(fmtDur(m)) }}
                      style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                    />
                  </Row>
                </>
              )}
            </Section>
          )}

          {/* Split duty */}
          <Section title="SPLIT DUTY" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={splitDuty} onChange={setSplitDuty} />
          }>
            {splitDuty && (
              <Row label="REST PERIOD" note="3–10h rest → ½ extension (Ch. 2.13)">
                <input type="text" placeholder="H:MM"
                  value={splitRest} onChange={e => setSplitRest(e.target.value)}
                  onBlur={e => { const m = parseDur(e.target.value); if (m != null) setSplitRest(fmtDur(m)) }}
                  style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                />
              </Row>
            )}
          </Section>

          {/* PIC discretion */}
          <Section title="PIC DISCRETION" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={picDisc} onChange={setPicDisc} />
          }>
            {picDisc && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-orange)', letterSpacing: '0.08em', paddingBottom: 8 }}>
                +1:00 applied · Must be documented in operational records
              </div>
            )}
          </Section>

        </div>

        {/* ── RIGHT: Result ─────────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 24 }}>

          <div className="cp-section-header" style={{ marginBottom: 16 }}>
            <span className="cp-section-title">RESULT</span>
            <div className="cp-divider" />
          </div>

          {!reportTime ? (
            <div className="cp-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 10 }}>◷</div>
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.14em' }}>
                ENTER REPORT TIME
              </div>
            </div>

          ) : result?.error ? (
            <div className="cp-card" style={{ textAlign: 'center', padding: '32px 20px', borderColor: 'var(--cp-red)' }}>
              <div style={{ fontSize: 20, color: 'var(--cp-red)', marginBottom: 10 }}>⚠</div>
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-red)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
                {result.error}
              </div>
            </div>

          ) : result?.ok ? (
            <>
              {/* Main result card */}
              <div style={{
                background: 'var(--cp-bg3)',
                border: '1px solid var(--cp-border)',
                borderLeft: '3px solid var(--cp-acc)',
                borderRadius: 4, padding: '18px 20px', marginBottom: 14,
              }}>
                <div style={{ marginBottom: 16 }}>
                  <div className="cp-label" style={{ marginBottom: 6 }}>MAX FDP</div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 44, fontWeight: 700, color: 'var(--cp-acc)', lineHeight: 1 }}>
                    {fmtDur(result.fdp)}
                  </div>
                </div>
                <div>
                  <div className="cp-label" style={{ marginBottom: 6 }}>FDP EXPIRES</div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--cp-txt)', lineHeight: 1 }}>
                    {result.endTime}
                    <span style={{ fontSize: 12, color: 'var(--cp-dim)', marginLeft: 8, letterSpacing: '0.1em' }}>LOCAL</span>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="cp-card" style={{ marginBottom: 14 }}>
                <div className="cp-label" style={{ marginBottom: 10 }}>BREAKDOWN</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>
                        Table {result.tableLabel} · {result.bandLabel}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--cp-muted)', fontWeight: 600 }}>
                        {fmtDur(result.baseFDP)}
                      </td>
                    </tr>
                    {result.breakdown.cabinAllowance > 0 && (
                      <tr>
                        <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>Cabin crew allowance Ch. 2.21.2</td>
                        <td style={{ textAlign: 'right', color: 'var(--cp-green)' }}>+{fmtDur(result.breakdown.cabinAllowance)}</td>
                      </tr>
                    )}
                    {result.breakdown.standbyReduction > 0 && (
                      <tr>
                        <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>Standby reduction Ch. 2.9</td>
                        <td style={{ textAlign: 'right', color: 'var(--cp-red)' }}>−{fmtDur(result.breakdown.standbyReduction)}</td>
                      </tr>
                    )}
                    {result.breakdown.ifrExtension > 0 && (
                      <tr>
                        <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>IFR extension Ch. 2.12</td>
                        <td style={{ textAlign: 'right', color: 'var(--cp-green)' }}>+{fmtDur(result.breakdown.ifrExtension)}</td>
                      </tr>
                    )}
                    {result.breakdown.splitExtension > 0 && (
                      <tr>
                        <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>Split duty Ch. 2.13</td>
                        <td style={{ textAlign: 'right', color: 'var(--cp-green)' }}>+{fmtDur(result.breakdown.splitExtension)}</td>
                      </tr>
                    )}
                    {result.breakdown.picExtension > 0 && (
                      <tr>
                        <td style={{ color: 'var(--cp-dim)', padding: '3px 0', fontSize: 11 }}>PIC discretion</td>
                        <td style={{ textAlign: 'right', color: 'var(--cp-orange)' }}>+{fmtDur(result.breakdown.picExtension)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2}><div style={{ borderTop: '1px solid var(--cp-border)', margin: '6px 0' }} /></td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--cp-muted)', fontWeight: 700, fontSize: 12 }}>Max FDP</td>
                      <td style={{ textAlign: 'right', color: 'var(--cp-acc)', fontWeight: 700, fontSize: 14 }}>{fmtDur(result.fdp)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Warnings */}
              {result.errors?.length > 0 && (
                <div className="cp-card" style={{ marginBottom: 14, borderColor: 'var(--cp-red)', borderLeft: '3px solid var(--cp-red)' }}>
                  <div className="cp-label" style={{ marginBottom: 8, color: 'var(--cp-red)' }}>WARNINGS</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-red)', marginBottom: 4 }}>⚠ {e}</div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {result.notes?.length > 0 && (
                <div className="cp-card" style={{ marginBottom: 14 }}>
                  <div className="cp-label" style={{ marginBottom: 8 }}>NOTES</div>
                  {result.notes.map((n, i) => (
                    <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginBottom: 4, lineHeight: 1.5 }}>· {n}</div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {/* Regulatory reference */}
          <div style={{ marginTop: 14, padding: '10px 12px', border: '1px solid var(--cp-border2)', borderRadius: 4 }}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em', lineHeight: 1.8 }}>
              CAD 1901 ISS01 REV01 — CAAM MALAYSIA<br />
              Ch. 2.9 Standby · Ch. 2.10 Max FDP · Ch. 2.11 Long Range<br />
              Ch. 2.12 In-Flight Relief · Ch. 2.13 Split Duty
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
