import React, { useState, useMemo } from 'react'
import { lookupFDP, getBandLabelForResult } from '../data/ftlTables'
import ResetButton from './ResetButton'

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

/** Effective sector count for table lookup — long range Ch. 2.11 */
function resolveEffSectors({ sectors, crewType, acclimatised, longRange, longestSectorStr }, notes, errors, pendingNotes) {
  let effSectors = sectors
  if (longRange && crewType === '2crew') {
    const lsMins = parseDur(longestSectorStr)
    if (lsMins == null) {
      pendingNotes.push('Long range: enter longest sector duration')
    } else if (lsMins > 7 * 60) {
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
  return effSectors
}

export function computeFTL({
  reportTime, sectors, crewType, acclimatised,
  isCabinCrew, cabinReportTime,
  precedingRestStr,
  longRange, longestSectorStr,
  delayedReporting, actualReportTimeStr,
  positioning, positioningReportTimeStr,
  standby, standbyStart, standbyLocation, homeShortNotice,
  ifr, ifrType, ifrRestStr,
  splitDuty, splitRestStr,
  reducedPrecedingRest,
  picDiscretion, picExtensionStr, picBeforeLastSector,
}) {
  const notes        = []
  const errors       = []
  const pendingNotes = []
  const caamNotes    = []

  if (standbyStart) {
    const normStandbyStart = normalizeTime(standbyStart)
    if (!normStandbyStart) {
      return { error: 'Invalid standby start time — use HH:MM or HHMM (0000–2359)' }
    }
    standbyStart = normStandbyStart
  }

  // Preceding rest (hours) — needed for Table B
  const precedingRestMins = parseDur(precedingRestStr)
  const precedingRestH    = precedingRestMins != null ? precedingRestMins / 60 : 0

  if (!acclimatised && crewType === '2crew' && !precedingRestMins) {
    return { error: 'Enter preceding rest period — required for Table B (non-acclimatised)' }
  }

  // Airport standby (Ch. 2.9.2): the allowable FDP duration is a pure lookup
  // from the standby-start band and doesn't depend on a report time at all —
  // it's a separate, later event (Ch. 2.9.3, 2.9.4 Note 2). Show MAX FDP now;
  // FDP EXPIRES and the Case A/B duration math need the actual call-out time.
  if (!reportTime && standby && standbyLocation === 'airport' && standbyStart) {
    let effSectors = resolveEffSectors({ sectors, crewType, acclimatised, longRange, longestSectorStr }, notes, errors, pendingNotes)
    if (positioning && splitDuty) {
      effSectors += 1
      notes.push('Positioning leg counted as a sector — required when claiming split duty after positioning (Ch. 2.8.2)')
    }
    const baseFDP = lookupFDP(standbyStart, effSectors, crewType, acclimatised, precedingRestH)
    if (baseFDP == null) return { error: 'Table lookup failed — check inputs' }

    const bandLabel       = getBandLabelForResult(standbyStart, crewType, acclimatised, precedingRestH)
    const tableLabel      = crewType === 'single' ? 'C' : acclimatised ? 'A' : 'B'
    const cabinAllowance  = isCabinCrew ? 60 : 0
    const fdp = baseFDP + cabinAllowance

    pendingNotes.push('Airport standby — FDP based on standby start time (Ch. 2.9.2). Enter report time once called out for FDP expiry and standby Case A/B.')

    return {
      ok: true,
      pending: true,
      baseFDP, effSectors, fdp, fdpPrePIC: fdp,
      endTime: null,
      tableLabel, bandLabel,
      breakdown: { cabinAllowance, standbyReduction: 0, ifrExtension: 0, splitExtension: 0, picExtension: 0 },
      picRef: null,
      notes, errors, pendingNotes, caamNotes,
    }
  }

  // 1. Effective sector count — long range Ch. 2.11, plus Ch. 2.8.2: the
  // positioning leg must be counted as a sector when split duty is claimed
  // after it (split duty, by definition, is a sub-minimum rest gap, which is
  // exactly 2.8.2's trigger condition).
  let effSectors = resolveEffSectors({ sectors, crewType, acclimatised, longRange, longestSectorStr }, notes, errors, pendingNotes)
  if (positioning && splitDuty) {
    effSectors += 1
    notes.push('Positioning leg counted as a sector — required when claiming split duty after positioning (Ch. 2.8.2)')
  }

  // 1b. Resolve the band time (for table lookup) and the baseline FDP clock
  // start. Positioning (Ch. 2.8.1) is self-sufficient — the FDP commences at
  // the positioning report time itself, with no dependency on a flight report
  // time at all. Delayed reporting, by contrast, needs the ORIGINAL report
  // time since the delay is measured relative to it. Mutually exclusive in
  // the UI (a duty is modelled with at most one).
  let bandTime, clockStart

  if (positioning && positioningReportTimeStr) {
    const posTime = normalizeTime(positioningReportTimeStr)
    if (!posTime) return { error: 'Invalid positioning report time — use HH:MM or HHMM (0000–2359)' }
    bandTime   = posTime
    clockStart = posTime
    notes.push(`Positioning: FDP commences at positioning report time ${posTime}, not the flight report time (Ch. 2.8.1)`)
  } else {
    // Normalize clock-time inputs (accept HH:MM or HHMM) — reject rather than
    // silently falling back to the raw string, which getTimeBandAC would parse
    // as hour 0 and return a real (wrong) FDP band instead of an error.
    const normReportTime = normalizeTime(reportTime)
    if (!normReportTime) {
      return { error: 'Invalid report time — use HH:MM or HHMM (0000–2359)' }
    }
    reportTime = normReportTime
    bandTime   = reportTime
    clockStart = reportTime

    if (delayedReporting && actualReportTimeStr) {
      const actualReportTime = normalizeTime(actualReportTimeStr)
      if (!actualReportTime) return { error: 'Invalid actual report time — use HH:MM or HHMM (0000–2359)' }
      const delayMins = diffMins(reportTime, actualReportTime)
      if (delayMins < 4 * 60) {
        // Delay <4h: band stays on the original report time; clock starts at the actual report time.
        clockStart = actualReportTime
        notes.push(`Delay <4h: FDP based on original report time band, clock starts at actual report ${actualReportTime} (Ch. 2.7.1)`)
      } else {
        // Delay ≥4h: band is the more limiting of planned/actual; clock starts exactly 4h after the original report time.
        const fdpOriginal = lookupFDP(reportTime, effSectors, crewType, acclimatised, precedingRestH)
        const fdpActual    = lookupFDP(actualReportTime, effSectors, crewType, acclimatised, precedingRestH)
        bandTime   = (fdpActual != null && (fdpOriginal == null || fdpActual < fdpOriginal)) ? actualReportTime : reportTime
        clockStart = toHHMM(toMins(reportTime) + 4 * 60)
        notes.push('Delay ≥4h: FDP based on more limiting of planned/actual report bands, clock starts 4h after original report time (Ch. 2.7.1)')
      }
    }
  }

  // Cabin crew's own report time (Ch. 2.21.2a) — the FDP clock starts here,
  // overriding any delay/positioning-derived clock start, but the table band/
  // early-start classification still uses the flight crew timing resolved above.
  let fdpStartTime = clockStart
  if (isCabinCrew && cabinReportTime) {
    const normCabinReportTime = normalizeTime(cabinReportTime)
    if (!normCabinReportTime) {
      return { error: 'Invalid cabin crew report time — use HH:MM or HHMM (0000–2359)' }
    }
    fdpStartTime = normCabinReportTime
  }

  // 2. Base FDP lookup
  let baseFDP = lookupFDP(bandTime, effSectors, crewType, acclimatised, precedingRestH)
  if (baseFDP == null) return { error: 'Table lookup failed — check inputs' }

  let bandLabel    = getBandLabelForResult(bandTime, crewType, acclimatised, precedingRestH)
  const tableLabel = crewType === 'single' ? 'C' : acclimatised ? 'A' : 'B'

  // 2a. Standby — which band governs the table lookup depends on location/notice:
  //  - Airport standby (Ch. 2.9.2): always use the standby-start band.
  //  - Home standby, ≤2h notice during 2200–0800 (Ch. 2.9.1 exception): the
  //    standby-start band is not applied at all — band stays as resolved above.
  //  - Otherwise (general case, Ch. 2.9.1): compare both bands, take the more limiting.
  // Only applies to Tables A/C (time-band based); Table B is keyed by preceding
  // rest, not local time, so there's no second band to compare against.
  const usesTimeBand = crewType === 'single' || acclimatised
  if (standby && standbyStart && usesTimeBand) {
    if (standbyLocation === 'airport') {
      const fdpFromStandbyBand = lookupFDP(standbyStart, effSectors, crewType, acclimatised, precedingRestH)
      if (fdpFromStandbyBand != null) {
        baseFDP   = fdpFromStandbyBand
        bandLabel = getBandLabelForResult(standbyStart, crewType, acclimatised, precedingRestH)
        notes.push('Airport standby — FDP based on standby start time (Ch. 2.9.2)')
      }
    } else if (homeShortNotice) {
      notes.push('Home standby, ≤2h notice (2200–0800) — standby-start band not applied (Ch. 2.9.1 exception)')
    } else {
      const fdpFromStandbyBand = lookupFDP(standbyStart, effSectors, crewType, acclimatised, precedingRestH)
      if (fdpFromStandbyBand != null && fdpFromStandbyBand < baseFDP) {
        notes.push('Standby-start time band is more limiting than report-time band — FDP based on standby start (Ch. 2.9.1)')
        baseFDP   = fdpFromStandbyBand
        bandLabel = getBandLabelForResult(standbyStart, crewType, acclimatised, precedingRestH)
      }
    }
  }

  // 2b. Cabin crew allowance Ch. 2.21.2 (+1h on base FDP)
  const cabinAllowance = isCabinCrew ? 60 : 0
  let fdp = baseFDP + cabinAllowance
  let standbyReduction = 0

  // 3. Standby Ch. 2.9 — standby ends at the individual's own report time
  if (standby && standbyStart) {
    const sbMins = diffMins(standbyStart, fdpStartTime)
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
  // Caps differ by crew type: bunk 18h (flight) / 19h (cabin); seat 15h (flight) / 16h (cabin)
  let ifrExtension = 0
  if (ifr) {
    const restMins = parseDur(ifrRestStr)
    if (!restMins) {
      pendingNotes.push('IFR: enter rest period duration')
    } else if (restMins < 3 * 60) {
      notes.push('IFR rest <3h: no extension applies (Ch. 2.12.3)')
    } else {
      const cap = ifrType === 'bunk'
        ? (isCabinCrew ? 19 * 60 : 18 * 60)
        : (isCabinCrew ? 16 * 60 : 15 * 60)
      ifrExtension = ifrType === 'bunk' ? Math.floor(restMins / 2) : Math.floor(restMins / 3)
      const before = fdp
      fdp = Math.min(fdp + ifrExtension, cap)
      if (fdp < before + ifrExtension)
        notes.push(`FDP capped at ${fmtDur(cap)} (${ifrType} rest, ${isCabinCrew ? 'cabin crew' : 'flight crew'} limit Ch. 2.12.3)`)
    }
  }

  // 5. Split duty Ch. 2.13 — not permitted following a reduced rest (Ch. 2.13.4)
  let splitExtension = 0
  if (splitDuty) {
    if (reducedPrecedingRest) {
      errors.push('Split duty not permitted following a reduced rest period (Ch. 2.13.4)')
    } else {
      const restMins = parseDur(splitRestStr)
      if (!restMins) {
        pendingNotes.push('Split duty: enter rest period duration')
      } else if (restMins < 3 * 60) {
        notes.push('Split duty rest <3h: no extension applies (Ch. 2.13)')
      } else if (restMins > 10 * 60) {
        notes.push('Split duty rest >10h: extension not applicable (Ch. 2.13)')
      } else {
        splitExtension = Math.floor(restMins / 2)
        fdp += splitExtension
      }
    }
  }

  // 6. PIC discretion — Ch. 2.15
  // Full 3h is only permitted on a single-sector flight, or immediately before
  // the last sector of a multi-sector FDP. Before any earlier sector, the cap
  // is 2h (Ch. 2.15.2). Uses the real sector count, not effSectors — the
  // long-range table-lookup substitution (Ch. 2.11) is only for entering the
  // table and must not be mistaken for an actual multi-sector duty.
  // If the preceding rest was itself reduced (Ch. 2.16), discretion here is
  // restricted to immediately before the last sector and must be reported to
  // CAAM regardless of duration (Ch. 2.15.3, 2.15.4).
  const fdpPrePIC = fdp   // save FDP before PIC extension (used for reference times)
  const picCap = (sectors <= 1 || picBeforeLastSector) ? 3 * 60 : 2 * 60
  let picExtension = 0
  if (picDiscretion) {
    picExtension = parseDur(picExtensionStr) || 0
    if (reducedPrecedingRest && sectors > 1 && !picBeforeLastSector && picExtension > 0) {
      errors.push('PIC discretion after a reduced rest may only be exercised immediately before the last sector (Ch. 2.15.3)')
    }
    if (picExtension > picCap) {
      errors.push(`PIC extension exceeds ${fmtDur(picCap)} maximum for ${picCap === 3 * 60 ? 'single/last sector' : 'a non-final sector'} (Ch. 2.15.2)`)
      picExtension = picCap   // cap at the applicable maximum
    }
    if (reducedPrecedingRest && picExtension > 0) {
      caamNotes.push('Extension follows a reduced rest — must be exceptional, limited to unforeseen circumstances (Ch. 2.15.3); Discretion Report to CAAM required regardless of duration (Ch. 2.15.4)')
    } else if (picExtension > 2 * 60) {
      caamNotes.push('Extension >2h: operator must submit Discretion Report to CAAM within 14 days (Ch. 2.15.4)')
    }
    if (picExtension > 0) fdp += picExtension
  }

  // PIC reference times: what FDP expiry would be at +1h / +2h / +3h
  const picRef = picDiscretion ? {
    h1: { label: '+1:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 60),  caam: false },
    h2: { label: '+2:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 120), caam: false },
    h3: { label: '+3:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 180), caam: true  },
  } : null

  return {
    ok: true,
    baseFDP, effSectors, fdp, fdpPrePIC,
    endTime: toHHMM(toMins(fdpStartTime) + fdp),
    tableLabel, bandLabel,
    breakdown: { cabinAllowance, standbyReduction, ifrExtension, splitExtension, picExtension },
    picRef,
    notes, errors, pendingNotes, caamNotes,
  }
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--cp-border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
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
  const [diffCabinTime,  setDiffCabinTime]  = useState(false)
  const [cabinReportTime, setCabinReportTime] = useState('')
  const [sectors,        setSectors]        = useState(1)
  const [precedingRest,  setPrecedingRest]  = useState('')
  const [longRange,      setLongRange]      = useState(false)
  const [longestSector,  setLongestSector]  = useState('')
  const [delayedReporting, setDelayedReporting] = useState(false)
  const [actualReportTime, setActualReportTime] = useState('')
  const [positioning,    setPositioning]    = useState(false)
  const [positioningReportTime, setPositioningReportTime] = useState('')
  const [standby,        setStandby]        = useState(false)
  const [standbyStart,   setStandbyStart]   = useState('')
  const [standbyLocation, setStandbyLocation] = useState('home')
  const [homeShortNotice, setHomeShortNotice] = useState(false)
  const [ifr,            setIfr]            = useState(false)
  const [ifrType,        setIfrType]        = useState('bunk')
  const [ifrRest,        setIfrRest]        = useState('')
  const [reducedRest,    setReducedRest]    = useState(false)
  const [splitDuty,      setSplitDuty]      = useState(false)
  const [splitRest,      setSplitRest]      = useState('')
  const [picDisc,        setPicDisc]        = useState(false)
  const [picExtStr,      setPicExtStr]      = useState('')
  const [picLastSector,  setPicLastSector]  = useState(true)

  const handleReset = () => {
    setAircraft('aeroplane')
    setCrewCat('flight')
    setCrewType('2crew')
    setAcclimatised(true)
    setReportTime('')
    setDiffCabinTime(false)
    setCabinReportTime('')
    setSectors(1)
    setPrecedingRest('')
    setLongRange(false)
    setLongestSector('')
    setDelayedReporting(false)
    setActualReportTime('')
    setPositioning(false)
    setPositioningReportTime('')
    setStandby(false)
    setStandbyStart('')
    setStandbyLocation('home')
    setHomeShortNotice(false)
    setIfr(false)
    setIfrType('bunk')
    setIfrRest('')
    setReducedRest(false)
    setSplitDuty(false)
    setSplitRest('')
    setPicDisc(false)
    setPicExtStr('')
    setPicLastSector(true)
  }

  const effectiveCrew  = crewCat === 'cabin' ? '2crew' : crewType
  const needsTableB    = effectiveCrew === '2crew' && !acclimatised
  const maxSectors     = 8

  // Single-pilot ops have no defined "Not Acclimatised" table in CAD 1901 — force acclimatised.
  const handleCrewTypeChange = (v) => {
    setCrewType(v)
    if (v === 'single') setAcclimatised(true)
  }

  const airportStandbyPending = standby && standbyLocation === 'airport' && !!standbyStart && !reportTime
  const positioningReady      = positioning && !!positioningReportTime

  const result = useMemo(() => {
    if (!reportTime && !airportStandbyPending && !positioningReady) return null
    return computeFTL({
      reportTime,
      sectors:          Math.min(sectors, maxSectors),
      crewType:         effectiveCrew,
      acclimatised,
      isCabinCrew:      crewCat === 'cabin',
      cabinReportTime:  diffCabinTime ? cabinReportTime : '',
      precedingRestStr: precedingRest,
      longRange,        longestSectorStr: longestSector,
      delayedReporting, actualReportTimeStr: actualReportTime,
      positioning,      positioningReportTimeStr: positioningReportTime,
      standby,          standbyStart, standbyLocation, homeShortNotice,
      ifr,              ifrType, ifrRestStr: ifrRest,
      reducedPrecedingRest: reducedRest,
      splitDuty,        splitRestStr: splitRest,
      picDiscretion:    picDisc,
      picExtensionStr:  picExtStr,
      picBeforeLastSector: picLastSector,
    })
  }, [
    reportTime, sectors, crewCat, effectiveCrew, acclimatised, precedingRest,
    diffCabinTime, cabinReportTime,
    longRange, longestSector,
    delayedReporting, actualReportTime,
    positioning, positioningReportTime,
    standby, standbyStart, standbyLocation, homeShortNotice,
    ifr, ifrType, ifrRest,
    reducedRest,
    splitDuty, splitRest,
    picDisc, picExtStr, picLastSector,
  ])

  const inp = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
    fontSize: 13, padding: '7px 10px', outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <ResetButton onReset={handleReset} />
      </div>

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
        Flight duty periods and limitation calculations must always be verified against your current approved operations manual,
        company procedures, or crewing/rostering departments. Compliance with all applicable FTL rules remains the sole responsibility of the user.
      </div>

      {/* Page header */}
      <div className="cp-section-header" style={{ marginBottom: 20 }}>
        <span className="cp-section-title">FLIGHT TIME LIMITATIONS</span>
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
                options={[
                  { value: 'aeroplane', label: 'AEROPLANE' },
                  { value: 'helicopter', label: 'HELICOPTER', disabled: true, disabledTitle: 'Helicopter FTL not yet implemented — aeroplane tables only' },
                ]}
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
                  value={crewType} onChange={handleCrewTypeChange}
                />
              </Row>
            )}
            <Row label="ACCLIMATISED" note={effectiveCrew === 'single' ? 'CAD 1901 defines no Not-Acclimatised table for single-pilot ops' : undefined}>
              <Seg
                options={[
                  { value: true, label: 'YES' },
                  { value: false, label: 'NO', disabled: effectiveCrew === 'single', disabledTitle: 'No Not-Acclimatised table exists for single-pilot ops in CAD 1901' },
                ]}
                value={acclimatised} onChange={setAcclimatised}
              />
            </Row>
          </Section>

          {/* Flight details */}
          <Section title="FLIGHT DETAILS">
            <Row label={crewCat === 'cabin' ? 'FLIGHT CREW REPORT TIME' : 'REPORT TIME'}
              note={
                airportStandbyPending ? 'Optional while on airport standby — MAX FDP is based on standby start until you\'re called out (Ch. 2.9.2)' :
                positioning ? 'Not required while positioning — FDP commences at the positioning report time instead (Ch. 2.8.1)' :
                undefined
              }>
              <input
                type="text" value={reportTime} placeholder="HH:MM"
                onChange={e => setReportTime(e.target.value)}
                onBlur={e => { const n = normalizeTime(e.target.value); if (n) setReportTime(n) }}
                style={{ ...inp, width: 100, textAlign: 'center' }}
                maxLength={5}
              />
            </Row>
            {crewCat === 'cabin' && (
              <Row label="CABIN REPORTS SEPARATELY" note={diffCabinTime ? 'Determines FDP start/end clock — table band still uses flight crew time (Ch. 2.21.2a)' : undefined}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg
                    options={[{ value: false, label: 'NO' }, { value: true, label: 'YES' }]}
                    value={diffCabinTime} onChange={setDiffCabinTime}
                  />
                  {diffCabinTime && (
                    <input type="text" placeholder="HH:MM"
                      value={cabinReportTime} onChange={e => setCabinReportTime(e.target.value)}
                      onBlur={e => { const n = normalizeTime(e.target.value); if (n) setCabinReportTime(n) }}
                      style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                    />
                  )}
                </div>
              </Row>
            )}
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

          {/* Delayed reporting — Ch. 2.7. Mutually exclusive with Positioning. */}
          <Section title="DELAYED REPORTING" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={delayedReporting} onChange={v => { setDelayedReporting(v); if (v) setPositioning(false) }} />
          }>
            {delayedReporting && (
              <Row label="ACTUAL REPORT TIME" note="REPORT TIME above is treated as the original/planned time (Ch. 2.7.1)">
                <input type="text" value={actualReportTime} placeholder="HH:MM"
                  onChange={e => setActualReportTime(e.target.value)}
                  onBlur={e => { const n = normalizeTime(e.target.value); if (n) setActualReportTime(n) }}
                  style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                />
              </Row>
            )}
          </Section>

          {/* Positioning — Ch. 2.8. Mutually exclusive with Delayed Reporting. */}
          <Section title="POSITIONING" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={positioning} onChange={v => { setPositioning(v); if (v) setDelayedReporting(false) }} />
          }>
            {positioning && (
              <Row label="POSITIONING REPORT TIME" note="FDP commences here, not at the flight report time (Ch. 2.8.1)">
                <input type="text" value={positioningReportTime} placeholder="HH:MM"
                  onChange={e => setPositioningReportTime(e.target.value)}
                  onBlur={e => { const n = normalizeTime(e.target.value); if (n) setPositioningReportTime(n) }}
                  style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                />
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
              <>
                <Row label="STANDBY START" note="Max 12h standby (Ch. 2.9)">
                  <input type="text" value={standbyStart} placeholder="HH:MM"
                    onChange={e => setStandbyStart(e.target.value)}
                    onBlur={e => { const n = normalizeTime(e.target.value); if (n) setStandbyStart(n) }}
                    style={{ ...inp, width: 100, textAlign: 'center' }}
                    maxLength={5}
                  />
                </Row>
                <Row label="LOCATION">
                  <Seg
                    options={[{ value: 'home', label: 'HOME' }, { value: 'airport', label: 'AIRPORT' }]}
                    value={standbyLocation} onChange={setStandbyLocation}
                  />
                </Row>
                {standbyLocation === 'airport' && (
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', lineHeight: 1.6, paddingBottom: 4 }}>
                    Immediate readiness — FDP always based on standby start time (Ch. 2.9.2)
                  </div>
                )}
                {standbyLocation === 'home' && (
                  <Row label="SHORT NOTICE" note="≤2h notice, standby during 2200–0800 — skips standby-start band (Ch. 2.9.1 exception)">
                    <Seg
                      options={[{ value: false, label: 'NO' }, { value: true, label: 'YES' }]}
                      value={homeShortNotice} onChange={setHomeShortNotice}
                    />
                  </Row>
                )}
              </>
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
                        { value: 'bunk', label: `BUNK  ×½  max ${crewCat === 'cabin' ? '19h' : '18h'}` },
                        { value: 'seat', label: `SEAT  ×⅓  max ${crewCat === 'cabin' ? '16h' : '15h'}` },
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

          {/* Reduced preceding rest — gates split duty (2.13.4) and PIC discretion (2.15.3/2.15.4) below */}
          <Section title="REDUCED PRECEDING REST" toggle={
            <Seg options={[{ value: false, label: 'NO' }, { value: true, label: 'YES' }]}
              value={reducedRest} onChange={setReducedRest} />
          }>
            {reducedRest && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-orange)', lineHeight: 1.6, paddingBottom: 4 }}>
                Was the rest before this duty itself reduced via PIC discretion (Ch. 2.16)? If so: split duty
                is not permitted (Ch. 2.13.4), and PIC discretion below is restricted to immediately before
                the last sector, exceptional circumstances only (Ch. 2.15.3) — reportable to CAAM regardless
                of duration (Ch. 2.15.4).
              </div>
            )}
          </Section>

          {/* Split duty */}
          <Section title="SPLIT DUTY" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={splitDuty} onChange={setSplitDuty} />
          }>
            {splitDuty && reducedRest && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-red)', lineHeight: 1.6, paddingBottom: 4 }}>
                ⚠ Not permitted following a reduced rest period (Ch. 2.13.4)
              </div>
            )}
            {splitDuty && !reducedRest && (
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
              value={picDisc} onChange={v => { setPicDisc(v); if (!v) setPicExtStr('') }} />
          }>
            {picDisc && (
              <>
                {Math.min(sectors, maxSectors) > 1 && (
                  <Row label="BEFORE LAST SECTOR" note="Max 3h only before last sector · max 2h before any earlier sector (Ch. 2.15.2)">
                    <Seg
                      options={[{ value: true, label: 'YES (max 3h)' }, { value: false, label: 'NO (max 2h)' }]}
                      value={picLastSector} onChange={setPicLastSector}
                    />
                  </Row>
                )}
                <Row label="EXTENSION" note="Max 2h before sectors · Max 3h before last sector (Ch. 2.15)">
                  <input type="text" placeholder="H:MM"
                    value={picExtStr} onChange={e => setPicExtStr(e.target.value)}
                    onBlur={e => { const m = parseDur(e.target.value); if (m != null) setPicExtStr(fmtDur(m)) }}
                    style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                  />
                </Row>
                <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-orange)', letterSpacing: '0.08em', paddingBottom: 4, lineHeight: 1.6 }}>
                  Must be documented · Discretion Report Form required (Ch. 2.15.4)
                </div>
              </>
            )}
          </Section>

        </div>

        {/* ── RIGHT: Result ─────────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 24 }}>

          <div className="cp-section-header" style={{ marginBottom: 16 }}>
            <span className="cp-section-title">RESULT</span>
            <div className="cp-divider" />
          </div>

          {!result ? (
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
                  {result.pending ? (
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--cp-orange)', lineHeight: 1.4 }}>
                      PENDING — enter report time once called out
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--cp-txt)', lineHeight: 1 }}>
                      {result.endTime}
                      <span style={{ fontSize: 12, color: 'var(--cp-dim)', marginLeft: 8, letterSpacing: '0.1em' }}>LOCAL TIME AT REPORTING</span>
                    </div>
                  )}
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

              {/* PIC discretion reference panel */}
              {result.picRef && (
                <div className="cp-card" style={{ marginBottom: 14 }}>
                  <div className="cp-label" style={{ marginBottom: 10 }}>PIC DISCRETION REFERENCE</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'left', paddingBottom: 6, fontWeight: 'normal' }}>EXTENSION</th>
                        <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'right', paddingBottom: 6, fontWeight: 'normal' }}>FDP EXPIRES</th>
                        <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'right', paddingBottom: 6, fontWeight: 'normal' }}>CAAM REPORT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(result.picRef).map(row => (
                        <tr key={row.label}>
                          <td style={{ color: 'var(--cp-muted)', padding: '4px 0' }}>{row.label}</td>
                          <td style={{ textAlign: 'right', color: row.caam ? 'var(--cp-red)' : 'var(--cp-txt)', fontWeight: 600 }}>{row.end} LOCAL</td>
                          <td style={{ textAlign: 'right', color: row.caam ? 'var(--cp-red)' : 'var(--cp-dim)', fontSize: 10 }}>{row.caam ? '⚠ REQUIRED' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.06em', lineHeight: 1.6 }}>
                    Extension &gt;2h requires operator to submit report to CAAM within 14 days (Ch. 2.15.4)
                  </div>
                </div>
              )}

              {/* Warnings — restrictions / violations */}
              {result.errors?.length > 0 && (
                <div className="cp-card" style={{ marginBottom: 14, borderColor: 'var(--cp-red)', borderLeft: '3px solid var(--cp-red)' }}>
                  <div className="cp-label" style={{ marginBottom: 8, color: 'var(--cp-red)' }}>WARNINGS</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-red)', marginBottom: 4 }}>⚠ {e}</div>
                  ))}
                </div>
              )}

              {/* CAAM reporting required — mandatory follow-up, not a restriction, still red */}
              {result.caamNotes?.length > 0 && (
                <div className="cp-card" style={{ marginBottom: 14, borderColor: 'var(--cp-red)', borderLeft: '3px solid var(--cp-red)' }}>
                  <div className="cp-label" style={{ marginBottom: 8, color: 'var(--cp-red)' }}>CAAM REPORTING REQUIRED</div>
                  {result.caamNotes.map((n, i) => (
                    <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-red)', marginBottom: 4, lineHeight: 1.5 }}>⚠ {n}</div>
                  ))}
                </div>
              )}

              {/* Pending — incomplete inputs, calculation still proceeding without that part applied */}
              {result.pendingNotes?.length > 0 && (
                <div className="cp-card" style={{ marginBottom: 14, borderColor: 'var(--cp-orange)', borderLeft: '3px solid var(--cp-orange)' }}>
                  <div className="cp-label" style={{ marginBottom: 8, color: 'var(--cp-orange)' }}>PENDING</div>
                  {result.pendingNotes.map((n, i) => (
                    <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-orange)', marginBottom: 4, lineHeight: 1.5 }}>· {n}</div>
                  ))}
                </div>
              )}

              {/* Notes — purely explanatory */}
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
