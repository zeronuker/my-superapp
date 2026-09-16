import React, { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
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

/**
 * Accepts "+5:30", "-3:00", "5:30" (sign optional, defaults +), "0800" →
 * signed minutes off UTC, or null on invalid. Free-typed rather than a
 * preset list so no offset — including the odd 30/45-min ones — is ever
 * unreachable.
 */
function parseOffset(str) {
  const s = (str || '').trim()
  const m = /^([+-]?)(\d{1,2}):?(\d{2})$/.exec(s)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const h = +m[2], mi = +m[3]
  if (h > 14 || mi > 59) return null
  return sign * (h * 60 + mi)
}

function fmtOffset(min) {
  const abs = Math.abs(min)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${min >= 0 ? '+' : '-'}${h}:${m}`
}

// Converts a station-local clock time into another UTC offset — display
// only, same instant. `days` is the date shift relative to that clock time
// (e.g. +1 if the conversion pushes it past midnight).
function convertClock(hhmm, stationOffMin, hereOffMin) {
  const total = toMins(hhmm) + (hereOffMin - stationOffMin)
  return { time: toHHMM(total), days: Math.floor(total / 1440) }
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
  picDiscretion, picActualEndStr, picBeforeLastSector,
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
  //
  // Discretion can't be planned — it's derived from what actually happened.
  // The pilot enters the actual FDP end time (e.g. actual on-blocks) once
  // known; the extension used is the difference from the FDP already
  // calculated above, not a duration typed in ahead of time.
  const fdpPrePIC = fdp   // FDP before PIC extension (also the pre-discretion expiry basis)
  const originalExpiry = toHHMM(toMins(fdpStartTime) + fdpPrePIC)
  const picCap = (sectors <= 1 || picBeforeLastSector) ? 3 * 60 : 2 * 60
  let picExtension = 0
  let picEmployerNote = null
  if (picDiscretion) {
    if (picActualEndStr) {
      const actualEnd = normalizeTime(picActualEndStr)
      if (!actualEnd) return { error: 'Invalid actual FDP end time — use HH:MM or HHMM (0000–2359)' }
      picExtension = diffMins(originalExpiry, actualEnd)
      if (reducedPrecedingRest && sectors > 1 && !picBeforeLastSector && picExtension > 0) {
        errors.push('PIC discretion after a reduced rest may only be exercised immediately before the last sector (Ch. 2.15.3)')
      }
      if (picExtension > picCap) {
        errors.push(`PIC extension exceeds ${fmtDur(picCap)} maximum for ${picCap === 3 * 60 ? 'single/last sector' : 'a non-final sector'} (Ch. 2.15.2)`)
        picExtension = picCap   // cap at the applicable maximum
      }
      // Any extension at all must be reported to the employer (Ch. 2.15.4,
      // first sentence) — CAAM submission is a separate, higher bar that only
      // applies on top of this when the extension is >2h or follows a
      // reduced rest. Kept out of the shared `notes` list and surfaced
      // directly on the PIC discretion reference panel instead.
      if (picExtension > 0) {
        picEmployerNote = 'Extension must be reported to the employer on a Discretion Report Form (Ch. 2.15.4)'
      }
      if (reducedPrecedingRest && picExtension > 0) {
        caamNotes.push('Extension follows a reduced rest — must be exceptional, limited to unforeseen circumstances (Ch. 2.15.3); Discretion Report to CAAM required regardless of duration (Ch. 2.15.4)')
      } else if (picExtension > 2 * 60) {
        caamNotes.push('Extension >2h: operator must submit Discretion Report to CAAM within 14 days (Ch. 2.15.4)')
      }
      if (picExtension > 0) fdp += picExtension
    } else {
      pendingNotes.push('PIC discretion: enter the actual FDP end time once known to calculate the extension used (Ch. 2.15) — this cannot be planned in advance')
    }
  }

  // PIC reference: the original (pre-discretion) expiry, plus what FDP expiry
  // would be at +1h / +2h / +3h of discretion — useful while the actual end
  // time isn't known yet.
  const picRef = picDiscretion ? {
    orig: { label: 'ORIGINAL', end: originalExpiry, employer: false, caam: false },
    h1: { label: '+1:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 60),  employer: true, caam: reducedPrecedingRest },
    h2: { label: '+2:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 120), employer: true, caam: reducedPrecedingRest },
    h3: { label: '+3:00', end: toHHMM(toMins(fdpStartTime) + fdpPrePIC + 180), employer: true, caam: true  },
  } : null

  return {
    ok: true,
    baseFDP, effSectors, fdp, fdpPrePIC,
    endTime: toHHMM(toMins(fdpStartTime) + fdp),
    tableLabel, bandLabel,
    breakdown: { cabinAllowance, standbyReduction, ifrExtension, splitExtension, picExtension },
    picRef, picEmployerNote,
    notes, errors, pendingNotes, caamNotes,
  }
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

// The Original row's highlight box is a plain absolutely-positioned element,
// measured against the row's actual rect and repositioned in an effect —
// not a `position: relative` trick on the <tr> itself, which isn't a
// reliable containing block for an overlay across browsers (it can escape
// to a distant ancestor and cover far more than just the row).
const PIC_ORIGINAL_ROW_OVERHANG = 9 // px, each side

function PicDiscretionTable({ picRef, picEmployerNote, caamNotes, tz }) {
  const wrapEl = useRef(null)
  const origRowEl = useRef(null)
  const boxEl = useRef(null)

  function ConvertedLine({ end }) {
    if (!tz) return null
    const { time, days } = convertClock(end, tz.stOff, tz.hereOff)
    return (
      <div style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--cp-acc2)', letterSpacing: '0.04em', marginTop: 2 }}>
        {time} UTC{fmtOffset(tz.hereOff)}{days !== 0 ? ` · ${days > 0 ? '+' : ''}${days}D` : ''}
      </div>
    )
  }

  useLayoutEffect(() => {
    function layout() {
      const wrap = wrapEl.current, row = origRowEl.current, box = boxEl.current
      if (!wrap || !row || !box) return
      // offsetTop/offsetHeight/clientWidth are local layout values in the
      // element's own coordinate space, unlike getBoundingClientRect() —
      // which returns screen pixels already scaled by the app's zoom/
      // font-scale setting (App.jsx applies CSS `zoom` or a `transform:
      // scale` fallback). Writing screen pixels back as plain style values
      // inside that same scaled region would double-scale the box.
      box.style.top = `${row.offsetTop}px`
      box.style.height = `${row.offsetHeight}px`
      box.style.left = `${-PIC_ORIGINAL_ROW_OVERHANG}px`
      box.style.width = `${wrap.clientWidth + PIC_ORIGINAL_ROW_OVERHANG * 2}px`
    }
    layout()
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
  })

  const { orig, h1, h2, h3 } = picRef
  const reducedRestCase = h1.caam   // any-duration CAAM only kicks in via reduced rest — >2h alone only flags h3

  return (
    <div className="cp-card" style={{ marginBottom: 14 }}>
      <div className="cp-label" style={{ marginBottom: 10 }}>PIC DISCRETION REFERENCE</div>
      <div ref={wrapEl} style={{ position: 'relative', zIndex: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--cb-font-mono)', fontSize: 12, position: 'relative', zIndex: 1 }}>
          <thead>
            <tr>
              <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'left', paddingBottom: 6, fontWeight: 'normal' }}>EXTENSION</th>
              <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'right', paddingBottom: 6, fontWeight: 'normal', whiteSpace: 'nowrap' }}>FDP EXPIRES</th>
              <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'right', paddingBottom: 6, fontWeight: 'normal' }}>EMPLOYER</th>
              <th style={{ color: 'var(--cp-dim)', fontSize: 10, letterSpacing: '0.12em', textAlign: 'right', paddingBottom: 6, fontWeight: 'normal' }}>CAAM</th>
            </tr>
          </thead>
          <tbody>
            <tr ref={origRowEl}>
              <td style={{ color: 'var(--cp-muted)', padding: '9px 0' }}>{orig.label}</td>
              <td style={{ textAlign: 'right', color: 'var(--cp-txt)', fontWeight: 600, padding: '9px 0', whiteSpace: 'nowrap' }}>{orig.end} LOCAL<ConvertedLine end={orig.end} /></td>
              <td colSpan={2} style={{ padding: '9px 0' }}></td>
            </tr>
            {reducedRestCase ? (
              <>
                <tr>
                  <td style={{ color: 'var(--cp-muted)', padding: '4px 0' }}>{h1.label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--cp-red)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h1.end} LOCAL<ConvertedLine end={h1.end} /></td>
                  <td colSpan={2} rowSpan={3} style={{ verticalAlign: 'middle', padding: '4px 0 4px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(248,113,113,0.12)', border: '1px solid var(--cp-red)', borderRadius: 14, padding: '6px 10px', fontSize: 9.5, color: 'var(--cp-red)', lineHeight: 1.35 }}>
                      <span>⚠</span>
                      <span>Preceding rest was reduced — any extension above must be reported to both the employer (Discretion Report Form) and CAAM, regardless of duration (Ch. 2.15.3 / 2.15.4)</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--cp-muted)', padding: '4px 0' }}>{h2.label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--cp-red)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h2.end} LOCAL<ConvertedLine end={h2.end} /></td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--cp-muted)', padding: '4px 0' }}>{h3.label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--cp-red)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h3.end} LOCAL<ConvertedLine end={h3.end} /></td>
                </tr>
              </>
            ) : (
              [h1, h2, h3].map(row => (
                <tr key={row.label}>
                  <td style={{ color: 'var(--cp-muted)', padding: '4px 0' }}>{row.label}</td>
                  <td style={{ textAlign: 'right', color: row.caam ? 'var(--cp-red)' : 'var(--cp-txt)', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.end} LOCAL<ConvertedLine end={row.end} /></td>
                  <td style={{ textAlign: 'right', color: 'var(--cp-orange)', fontSize: 10 }}>⚠ REQUIRED</td>
                  <td style={{ textAlign: 'right', color: row.caam ? 'var(--cp-red)' : 'var(--cp-dim)', fontSize: 10 }}>{row.caam ? '⚠ REQUIRED' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div ref={boxEl} style={{ position: 'absolute', zIndex: 0, background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 4, pointerEvents: 'none' }} />
      </div>
      {!reducedRestCase && (picEmployerNote || caamNotes?.length > 0) && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {picEmployerNote && (
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-orange)', lineHeight: 1.5 }}>⚠ {picEmployerNote}</div>
          )}
          {caamNotes?.map((n, i) => (
            <div key={i} style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-red)', lineHeight: 1.5 }}>⚠ {n}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Seg({ options, value, onChange }) {
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

function Row({ label, note, children, stacked }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={stacked
        ? { display: 'flex', flexDirection: 'column', gap: 8 }
        : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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

// A fused "UTC" chip on the input itself — makes an offset field read as a
// different kind of input from a bare clock-time box at a glance, instead of
// relying on the user noticing a lone +/- sign.
function UtcOffsetInput({ value, onChange, onBlur, maxLength = 6 }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'stretch', width: 130,
      border: '1px solid var(--cp-acc2)', borderRadius: 4, overflow: 'hidden',
      background: 'color-mix(in srgb, var(--cp-acc2) 8%, var(--cp-bginput))',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', padding: '0 8px',
        fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        color: 'var(--cp-acc2)', background: 'color-mix(in srgb, var(--cp-acc2) 16%, transparent)',
        borderRight: '1px solid var(--cp-acc2)',
      }}>UTC</span>
      <input type="text" inputMode="tel" placeholder="+HH:MM" value={value} onChange={onChange} onBlur={onBlur} maxLength={maxLength}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--cp-acc2)', fontFamily: 'var(--cb-font-mono)', fontSize: 13,
          textAlign: 'center', padding: '7px 6px 7px 2px',
        }}
      />
    </div>
  )
}

// Extension severity → tint, same idea as the wind/weather severity colours
// in metarSeverity.js. Thresholds mirror PIC discretion's own regulatory
// caps (Ch. 2.15.2): up to 1h yellow, up to 2h amber, up to 3h (the hard
// cap) red.
const EXTENSION_TONE = {
  green:  'var(--cp-green)',
  yellow: 'var(--cp-yellow)',
  amber:  'var(--cp-orange)',
  red:    'var(--cp-red)',
}
function extensionTier(mins) {
  if (mins <= 60) return 'yellow'
  if (mins <= 120) return 'amber'
  return 'red'
}

// Before/after pair — allowable vs actual FDP, or due-to-expire vs
// actual-finish. Only ever shown once PIC discretion has actually been
// exercised (an extension > 0), so the "before" side reads as a real
// comparison rather than a redundant echo of the number above it. Left
// tile is always green (the regulatory baseline); right tile tints by
// how large the extension is.
function CompareTiles({ leftLabel, leftValue, rightLabel, rightValue, tone }) {
  const tileStyle = (t) => ({
    flex: 1, borderRadius: 6, padding: '10px 12px',
    background: `color-mix(in srgb, ${EXTENSION_TONE[t]} 12%, transparent)`,
    border: `1px solid ${EXTENSION_TONE[t]}`,
  })
  const tileLabel = { fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginBottom: 4 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <div style={tileStyle('green')}>
        <div style={tileLabel}>{leftLabel}</div>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 20, fontWeight: 700, color: EXTENSION_TONE.green }}>{leftValue}</div>
      </div>
      <span style={{ fontSize: 15, color: 'var(--cp-dim)', flexShrink: 0 }}>→</span>
      <div style={tileStyle(tone)}>
        <div style={tileLabel}>{rightLabel}</div>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 20, fontWeight: 700, color: EXTENSION_TONE[tone] }}>{rightValue}</div>
      </div>
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
  const { ftl, setFTLField } = useCalculatorStore()
  const {
    aircraft, crewCat, crewType, acclimatised, reportTime, diffCabinTime, cabinReportTime,
    sectors, precedingRest, longRange, longestSector, delayedReporting, actualReportTime,
    positioning, positioningReportTime, standby, standbyStart, standbyLocation, homeShortNotice,
    ifr, ifrType, ifrRest, reducedRest, splitDuty, splitRest, picDisc, picActualEnd, picLastSector,
    tzConvert, stationOffset, hereOffset,
  } = ftl

  // ACTUAL FDP END TIME input mode — lets the pilot type the time off
  // whichever clock they're actually looking at instead of doing the station
  // conversion in their head. picActualEnd itself always stays station-local,
  // since that's the frame computeFTL requires; 'local' mode just writes into
  // it via a live conversion. hereEndInput holds the raw local-mode text
  // (kept separate so switching modes doesn't clobber what's mid-typing).
  const [picEndMode, setPicEndMode] = useState('station')
  const [hereEndInput, setHereEndInput] = useState('')

  const handleReset = () => {
    setFTLField({
      aircraft: 'aeroplane', crewCat: 'flight', crewType: '2crew', acclimatised: true,
      reportTime: '', diffCabinTime: false, cabinReportTime: '',
      sectors: 1, precedingRest: '',
      longRange: false, longestSector: '',
      delayedReporting: false, actualReportTime: '',
      positioning: false, positioningReportTime: '',
      standby: false, standbyStart: '', standbyLocation: 'home', homeShortNotice: false,
      ifr: false, ifrType: 'bunk', ifrRest: '',
      reducedRest: false,
      splitDuty: false, splitRest: '',
      picDisc: false, picActualEnd: '', picLastSector: true,
      tzConvert: false, stationOffset: '', hereOffset: '',
    })
    setPicEndMode('station')
    setHereEndInput('')
  }

  const effectiveCrew  = crewCat === 'cabin' ? '2crew' : crewType
  const needsTableB    = effectiveCrew === '2crew' && !acclimatised
  const maxSectors     = 8

  // Single-pilot ops have no defined "Not Acclimatised" table in CAD 1901 — force acclimatised.
  const handleCrewTypeChange = (v) => {
    setFTLField(v === 'single' ? { crewType: v, acclimatised: true } : { crewType: v })
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
      picActualEndStr:  picActualEnd,
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
    picDisc, picActualEnd, picLastSector,
  ])

  // Display-only conversion of station-local clock times to another UTC
  // offset — feeds both the FDP EXPIRES line and the PIC discretion table.
  // Null unless the toggle is on and both offsets parse.
  const tzOffsets = useMemo(() => {
    if (!tzConvert) return null
    const stOff = parseOffset(stationOffset)
    const hereOff = parseOffset(hereOffset)
    return (stOff != null && hereOff != null) ? { stOff, hereOff } : null
  }, [tzConvert, stationOffset, hereOffset])

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
                value={aircraft} onChange={v => setFTLField({ aircraft: v })}
              />
            </Row>
            <Row label="POSITION">
              <Seg
                options={[{ value: 'flight', label: 'FLIGHT CREW' }, { value: 'cabin', label: 'CABIN CREW' }]}
                value={crewCat} onChange={v => setFTLField({ crewCat: v })}
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
                value={acclimatised} onChange={v => setFTLField({ acclimatised: v })}
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
                inputMode="numeric" pattern="[0-9]*"
                onChange={e => setFTLField({ reportTime: e.target.value })}
                onBlur={e => { const n = normalizeTime(e.target.value); if (n) setFTLField({ reportTime: n }) }}
                style={{ ...inp, width: 100, textAlign: 'center' }}
                maxLength={5}
              />
            </Row>
            {crewCat === 'cabin' && (
              <Row label="CABIN REPORTS SEPARATELY" note={diffCabinTime ? 'Determines FDP start/end clock — table band still uses flight crew time (Ch. 2.21.2a)' : undefined}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg
                    options={[{ value: false, label: 'NO' }, { value: true, label: 'YES' }]}
                    value={diffCabinTime} onChange={v => setFTLField({ diffCabinTime: v })}
                  />
                  {diffCabinTime && (
                    <input type="text" placeholder="HH:MM"
                      inputMode="numeric" pattern="[0-9]*"
                      value={cabinReportTime} onChange={e => setFTLField({ cabinReportTime: e.target.value })}
                      onBlur={e => { const n = normalizeTime(e.target.value); if (n) setFTLField({ cabinReportTime: n }) }}
                      style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                    />
                  )}
                </div>
              </Row>
            )}
            <Row label="SECTORS">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="cp-btn" style={{ padding: '4px 12px', fontSize: 16, lineHeight: 1 }}
                  onClick={() => setFTLField({ sectors: Math.max(1, sectors - 1) })}>−</button>
                <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--cp-txt)', minWidth: 28, textAlign: 'center' }}>
                  {Math.min(sectors, maxSectors)}
                </span>
                <button className="cp-btn" style={{ padding: '4px 12px', fontSize: 16, lineHeight: 1 }}
                  onClick={() => setFTLField({ sectors: Math.min(maxSectors, sectors + 1) })}>+</button>
              </div>
            </Row>
            {crewCat === 'flight' && crewType === '2crew' && (
              <Row label="LONG RANGE" note={longRange ? 'Duration of longest individual sector (Ch. 2.11)' : undefined}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg
                    options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                    value={longRange} onChange={v => setFTLField({ longRange: v })}
                  />
                  {longRange && (
                    <input type="text" placeholder="H:MM"
                      inputMode="numeric" pattern="[0-9]*"
                      value={longestSector} onChange={e => setFTLField({ longestSector: e.target.value })}
                      onBlur={e => { const m = parseDur(e.target.value); if (m != null) setFTLField({ longestSector: fmtDur(m) }) }}
                      style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                    />
                  )}
                </div>
              </Row>
            )}

            {/* Timezone conversion — display only, does not affect the FDP
                calculation. FDP stays anchored to local time at the
                reporting station throughout the duty (that's the
                regulatorily-binding number); this just converts the same
                expiry instant into whatever clock you're reading it
                against right now. */}
            <Row label="TIMEZONE CONVERSION" note={tzConvert ? undefined : 'Show FDP expiry converted to another UTC offset'}>
              <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                value={tzConvert} onChange={v => setFTLField({ tzConvert: v })} />
            </Row>
            {tzConvert && (
              <>
                <Row label="REPORTING STATION" note="e.g. +04:00">
                  <UtcOffsetInput value={stationOffset}
                    onChange={e => setFTLField({ stationOffset: e.target.value })}
                    onBlur={e => { const m = parseOffset(e.target.value); if (m != null) setFTLField({ stationOffset: fmtOffset(m) }) }}
                  />
                </Row>
                <Row label="WHERE YOU ARE NOW" note="Conversion only — read off your EFB or phone clock">
                  <UtcOffsetInput value={hereOffset}
                    onChange={e => setFTLField({ hereOffset: e.target.value })}
                    onBlur={e => { const m = parseOffset(e.target.value); if (m != null) setFTLField({ hereOffset: fmtOffset(m) }) }}
                  />
                </Row>
              </>
            )}
          </Section>

          {/* Delayed reporting — Ch. 2.7. Mutually exclusive with Positioning. */}
          <Section title="DELAYED REPORTING" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={delayedReporting} onChange={v => setFTLField(v ? { delayedReporting: v, positioning: false } : { delayedReporting: v })} />
          }>
            {delayedReporting && (
              <Row label="ACTUAL REPORT TIME" note="REPORT TIME above is treated as the original/planned time (Ch. 2.7.1)">
                <input type="text" value={actualReportTime} placeholder="HH:MM"
                  inputMode="numeric" pattern="[0-9]*"
                  onChange={e => setFTLField({ actualReportTime: e.target.value })}
                  onBlur={e => { const n = normalizeTime(e.target.value); if (n) setFTLField({ actualReportTime: n }) }}
                  style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                />
              </Row>
            )}
          </Section>

          {/* Positioning — Ch. 2.8. Mutually exclusive with Delayed Reporting. */}
          <Section title="POSITIONING" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={positioning} onChange={v => setFTLField(v ? { positioning: v, delayedReporting: false } : { positioning: v })} />
          }>
            {positioning && (
              <Row label="POSITIONING REPORT TIME" note="FDP commences here, not at the flight report time (Ch. 2.8.1)">
                <input type="text" value={positioningReportTime} placeholder="HH:MM"
                  inputMode="numeric" pattern="[0-9]*"
                  onChange={e => setFTLField({ positioningReportTime: e.target.value })}
                  onBlur={e => { const n = normalizeTime(e.target.value); if (n) setFTLField({ positioningReportTime: n }) }}
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
                  inputMode="numeric" pattern="[0-9]*"
                  value={precedingRest} onChange={e => setFTLField({ precedingRest: e.target.value })}
                  onBlur={e => { const m = parseDur(e.target.value); if (m != null) setFTLField({ precedingRest: fmtDur(m) }) }}
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
              value={standby} onChange={v => setFTLField({ standby: v })} />
          }>
            {standby && (
              <>
                <Row label="STANDBY START" note="Max 12h standby (Ch. 2.9)">
                  <input type="text" value={standbyStart} placeholder="HH:MM"
                    inputMode="numeric" pattern="[0-9]*"
                    onChange={e => setFTLField({ standbyStart: e.target.value })}
                    onBlur={e => { const n = normalizeTime(e.target.value); if (n) setFTLField({ standbyStart: n }) }}
                    style={{ ...inp, width: 100, textAlign: 'center' }}
                    maxLength={5}
                  />
                </Row>
                <Row label="LOCATION">
                  <Seg
                    options={[{ value: 'home', label: 'HOME' }, { value: 'airport', label: 'AIRPORT' }]}
                    value={standbyLocation} onChange={v => setFTLField({ standbyLocation: v })}
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
                      value={homeShortNotice} onChange={v => setFTLField({ homeShortNotice: v })}
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
                value={ifr} onChange={v => setFTLField({ ifr: v })} />
            }>
              {ifr && (
                <>
                  <Row label="REST TYPE">
                    <Seg
                      options={[
                        { value: 'bunk', label: `BUNK  ×½  max ${crewCat === 'cabin' ? '19h' : '18h'}` },
                        { value: 'seat', label: `SEAT  ×⅓  max ${crewCat === 'cabin' ? '16h' : '15h'}` },
                      ]}
                      value={ifrType} onChange={v => setFTLField({ ifrType: v })}
                    />
                  </Row>
                  <Row label="REST PERIOD" note="Minimum 3h required (Ch. 2.12)">
                    <input type="text" placeholder="H:MM"
                      inputMode="numeric" pattern="[0-9]*"
                      value={ifrRest} onChange={e => setFTLField({ ifrRest: e.target.value })}
                      onBlur={e => { const m = parseDur(e.target.value); if (m != null) setFTLField({ ifrRest: fmtDur(m) }) }}
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
              value={reducedRest} onChange={v => setFTLField({ reducedRest: v })} />
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
              value={splitDuty} onChange={v => setFTLField({ splitDuty: v })} />
          }>
            {splitDuty && reducedRest && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-red)', lineHeight: 1.6, paddingBottom: 4 }}>
                ⚠ Not permitted following a reduced rest period (Ch. 2.13.4)
              </div>
            )}
            {splitDuty && !reducedRest && (
              <Row label="REST PERIOD" note="3–10h rest → ½ extension (Ch. 2.13)">
                <input type="text" placeholder="H:MM"
                  inputMode="numeric" pattern="[0-9]*"
                  value={splitRest} onChange={e => setFTLField({ splitRest: e.target.value })}
                  onBlur={e => { const m = parseDur(e.target.value); if (m != null) setFTLField({ splitRest: fmtDur(m) }) }}
                  style={{ ...inp, width: 80, textAlign: 'center' }} maxLength={5}
                />
              </Row>
            )}
          </Section>

          {/* PIC discretion */}
          <Section title="PIC DISCRETION" toggle={
            <Seg options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
              value={picDisc} onChange={v => setFTLField(v ? { picDisc: v } : { picDisc: v, picActualEnd: '' })} />
          }>
            {picDisc && (
              <>
                <div style={{
                  borderLeft: '2px solid var(--cp-orange)',
                  background: 'color-mix(in srgb, var(--cp-orange) 8%, transparent)',
                  padding: '6px 10px', marginBottom: 14,
                  fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-orange)', letterSpacing: '0.08em', lineHeight: 1.6,
                }}>
                  ⚠ Must be documented · Discretion Report Form required (Ch. 2.15.4)
                </div>
                {Math.min(sectors, maxSectors) > 1 && (
                  <Row label="BEFORE LAST SECTOR" note="Max 3h only before last sector · max 2h before any earlier sector (Ch. 2.15.2)">
                    <Seg
                      options={[{ value: true, label: 'YES (max 3h)' }, { value: false, label: 'NO (max 2h)' }]}
                      value={picLastSector} onChange={v => setFTLField({ picLastSector: v })}
                    />
                  </Row>
                )}
                <Row label="ACTUAL FDP END TIME" stacked note={
                  !tzConvert
                    ? "Enter actual end of duty and any extension will be calculated automatically. Different time zone? Turn on Timezone Conversion above."
                    : !tzOffsets
                    ? 'Enter both UTC offsets above to switch frames'
                    : picEndMode === 'station'
                    ? `Station-local (UTC${fmtOffset(tzOffsets.stOff)}) — e.g. actual on-blocks`
                    : `Your local time (UTC${fmtOffset(tzOffsets.hereOff)}) — converts automatically`
                }>
                  <div>
                    {tzConvert && tzOffsets && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
                        background: 'color-mix(in srgb, var(--cp-acc2) 10%, transparent)',
                        border: '1px solid var(--cp-acc2)', borderRadius: 20, padding: '4px 11px',
                        fontFamily: 'var(--cb-font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--cp-acc2)', letterSpacing: '0.03em',
                      }}>
                        🌐 UTC{fmtOffset(tzOffsets.stOff)} → UTC{fmtOffset(tzOffsets.hereOff)}
                      </div>
                    )}
                    {tzConvert && (
                      <div style={{ marginBottom: 8 }}>
                        <Seg
                          options={[{ value: 'station', label: 'STATION' }, { value: 'local', label: 'MY LOCAL', disabled: !tzOffsets, disabledTitle: 'Enter both UTC offsets above first' }]}
                          value={picEndMode}
                          onChange={v => {
                            if (v === 'local' && tzOffsets && picActualEnd) {
                              const n = normalizeTime(picActualEnd)
                              if (n) { const { time } = convertClock(n, tzOffsets.stOff, tzOffsets.hereOff); setHereEndInput(time) }
                            }
                            setPicEndMode(v)
                          }}
                        />
                      </div>
                    )}
                    <input type="text" placeholder="HH:MM"
                      inputMode="numeric" pattern="[0-9]*"
                      value={picEndMode === 'local' ? hereEndInput : picActualEnd}
                      onChange={e => {
                        const raw = e.target.value
                        if (picEndMode === 'local') {
                          setHereEndInput(raw)
                          if (tzOffsets) {
                            const n = normalizeTime(raw)
                            if (n) { const { time } = convertClock(n, tzOffsets.hereOff, tzOffsets.stOff); setFTLField({ picActualEnd: time }) }
                          }
                        } else {
                          setFTLField({ picActualEnd: raw })
                        }
                      }}
                      onBlur={e => {
                        const n = normalizeTime(e.target.value)
                        if (!n) return
                        if (picEndMode === 'local') setHereEndInput(n)
                        else setFTLField({ picActualEnd: n })
                      }}
                      style={{ ...inp, width: 100, textAlign: 'center' }} maxLength={5}
                    />
                    {tzConvert && tzOffsets && (() => {
                      const current = picEndMode === 'local' ? hereEndInput : picActualEnd
                      const n = normalizeTime(current)
                      if (!n) return null
                      const { time } = picEndMode === 'local'
                        ? convertClock(n, tzOffsets.hereOff, tzOffsets.stOff)
                        : convertClock(n, tzOffsets.stOff, tzOffsets.hereOff)
                      const otherLabel = picEndMode === 'local'
                        ? `station-local (UTC${fmtOffset(tzOffsets.stOff)})`
                        : `your local (UTC${fmtOffset(tzOffsets.hereOff)})`
                      return (
                        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-acc2)', marginTop: 6, letterSpacing: '0.03em' }}>
                          = {time} {otherLabel}
                        </div>
                      )
                    })()}
                  </div>
                </Row>
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

          ) : result?.ok ? (() => {
            // An extension is only real once PIC discretion has actually
            // been exercised (picExtension > 0) — picDisc alone (toggle on,
            // no actual end time yet) has nothing to compare against.
            const hasExtension = !!result.picRef && result.breakdown.picExtension > 0
            const extTone = hasExtension ? extensionTier(result.breakdown.picExtension) : null
            return (
            <>
              {/* Main result card */}
              <div style={{
                background: 'var(--cp-bg3)',
                border: '1px solid var(--cp-border)',
                borderLeft: '3px solid var(--cp-acc)',
                borderRadius: 4, padding: '18px 20px', marginBottom: 14,
              }}>
                <div style={{ marginBottom: 16 }}>
                  <div className="cp-label" style={{ marginBottom: 6 }}>{hasExtension ? 'ACTUAL FDP' : 'MAX FDP'}</div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 44, fontWeight: 700, color: 'var(--cp-acc)', lineHeight: 1 }}>
                    {fmtDur(result.fdp)}
                  </div>
                  {hasExtension && (
                    <CompareTiles leftLabel="ALLOWABLE FDP" leftValue={fmtDur(result.fdpPrePIC)} rightLabel="ACTUAL FDP" rightValue={fmtDur(result.fdp)} tone={extTone} />
                  )}
                </div>
                <div>
                  <div className="cp-label" style={{ marginBottom: 6 }}>FDP EXPIRES</div>
                  {result.pending ? (
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--cp-orange)', lineHeight: 1.4 }}>
                      PENDING — enter report time once called out
                    </div>
                  ) : hasExtension ? (
                    <CompareTiles leftLabel="DUE TO EXPIRE" leftValue={result.picRef.orig.end} rightLabel="ACTUAL FINISH" rightValue={result.endTime} tone={extTone} />
                  ) : (
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--cp-txt)', lineHeight: 1 }}>
                      {result.endTime}
                      <span style={{ fontSize: 12, color: 'var(--cp-dim)', marginLeft: 8, letterSpacing: '0.1em' }}>LOCAL TIME AT REPORTING</span>
                    </div>
                  )}
                  {hasExtension && !result.pending && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-orange)', letterSpacing: '0.03em' }}>
                      <span style={{ fontSize: 13 }}>⏱</span>
                      {fmtDur(result.breakdown.picExtension)} extension under PIC discretion
                    </div>
                  )}
                  {tzConvert && !result.pending && (
                    tzOffsets ? (() => {
                      const { time, days } = convertClock(result.endTime, tzOffsets.stOff, tzOffsets.hereOff)
                      return (
                        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--cp-acc2)', lineHeight: 1, marginTop: 10 }}>
                          {time}
                          <span style={{ fontSize: 11, color: 'var(--cp-dim)', marginLeft: 8, letterSpacing: '0.08em', fontWeight: 400 }}>
                            AT UTC{fmtOffset(tzOffsets.hereOff)}{days !== 0 ? ` · ${days > 0 ? '+' : ''}${days} DAY` : ''}
                          </span>
                        </div>
                      )
                    })() : (
                      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 8 }}>
                        Enter both UTC offsets above to convert
                      </div>
                    )
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
                <PicDiscretionTable
                  picRef={result.picRef}
                  picEmployerNote={result.picEmployerNote}
                  caamNotes={result.caamNotes}
                  tz={tzOffsets}
                />
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
            )
          })() : null}

        </div>
      </div>
    </div>
  )
}
