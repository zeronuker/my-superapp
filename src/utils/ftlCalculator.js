import { lookupFDP, getBandLabelForResult } from '../data/ftlTables'

// ── Time helpers ──────────────────────────────────────────────────────────────

/**
 * Accepts "HH:MM" or "HHMM" (4-digit) → "HH:MM", or "" on invalid.
 * Used for clock times (0000–2359).
 */
export function normalizeTime(str) {
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
export function parseDur(str) {
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

export function fmtDur(mins) {
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
export function parseOffset(str) {
  const s = (str || '').trim()
  const m = /^([+-]?)(\d{1,2}):?(\d{2})$/.exec(s)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const h = +m[2], mi = +m[3]
  if (h > 14 || mi > 59) return null
  return sign * (h * 60 + mi)
}

export function fmtOffset(min) {
  const abs = Math.abs(min)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${min >= 0 ? '+' : '-'}${h}:${m}`
}

// Converts a station-local clock time into another UTC offset — display
// only, same instant. `days` is the date shift relative to that clock time
// (e.g. +1 if the conversion pushes it past midnight).
export function convertClock(hhmm, stationOffMin, hereOffMin) {
  const total = toMins(hhmm) + (hereOffMin - stationOffMin)
  return { time: toHHMM(total), days: Math.floor(total / 1440) }
}

// ── FTL computation ───────────────────────────────────────────────────────────

/**
 * Effective sector count for table lookup — long range Ch. 2.11. Applies only
 * to a flight crew of exactly two pilots: never to cabin crew (Ch. 2.11.1,
 * 2.21.2f), and not when in-flight relief is carried, since relieving a pilot
 * needs an additional pilot (Ch. 2.12.1 → 2.11.2). Returns null when the
 * sector isn't permitted at all (not acclimatised, over 11h) — no FDP exists.
 */
function resolveEffSectors({ sectors, crewType, acclimatised, isCabinCrew, ifr, longRange, longestSectorStr }, notes, pendingNotes) {
  let effSectors = sectors
  if (longRange && crewType === '2crew' && !isCabinCrew && ifr) {
    notes.push('Long range limits not applied — in-flight relief means an additional pilot is carried (Ch. 2.11.2)')
  } else if (longRange && crewType === '2crew' && !isCabinCrew) {
    const lsMins = parseDur(longestSectorStr)
    if (lsMins == null) {
      pendingNotes.push('Long range: enter longest sector duration')
    } else if (lsMins > 7 * 60) {
      if (!acclimatised && lsMins > 11 * 60) return null
      const add = acclimatised ? (lsMins > 11 * 60 ? 4 : lsMins > 9 * 60 ? 3 : 2) : 4
      effSectors = (sectors - 1) + add
      notes.push(`Long range Ch. 2.11: longest sector counts as ${add} → effective ${effSectors} sector(s)`)
    }
  }
  return effSectors
}

export function computeFTL({
  reportTime, sectors, crewType, acclimatised,
  isCabinCrew, cabinReportTime,
  precedingRestStr,
  longRange, longestSectorStr,
  delayedReporting, actualReportTimeStr, delayUndisturbed,
  positioning, positioningReportTimeStr,
  standby, standbyStart, standbyLocation, homeShortNotice,
  ifr, ifrType, ifrRestStr,
  splitDuty, splitRestStr, positioningAsSector = true,
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

  if (!acclimatised && crewType === '2crew' && /^\d{3}$/.test((precedingRestStr || '').trim())) {
    // "240" could mean 2:40 or 24:00 — preceding rest is usually 10h+, so don't guess.
    return { error: 'Enter rest as HH:MM or HHMM (e.g. 24:00 or 2400)' }
  }
  if (!acclimatised && crewType === '2crew' && !precedingRestMins) {
    return { error: 'Enter preceding rest period — required for Table B (non-acclimatised)' }
  }

  // Split duty (Ch. 2.13) — hard blocks: no FDP is shown at all when the duty
  // doesn't qualify. It needs two or more sectors, one of which can be a
  // positioning journey counted as a sector (Ch. 2.13.1, 2.8.2), a rest of
  // 3–10h (anything outside that is not a split duty), and must not follow a
  // reduced rest (Ch. 2.13.4).
  const positioningCountsAsSector = positioning && splitDuty && positioningAsSector
  const splitRestMins = splitDuty ? parseDur(splitRestStr) : null
  if (splitDuty) {
    if (reducedPrecedingRest) {
      return { error: 'Split duty not permitted following a reduced rest period (Ch. 2.13.4)' }
    }
    if (sectors + (positioningCountsAsSector ? 1 : 0) < 2) {
      return { error: 'Split duty requires two or more sectors (Ch. 2.13.1)' }
    }
    if (splitRestMins != null && (splitRestMins < 3 * 60 || splitRestMins > 10 * 60)) {
      return { error: 'Split duty requires a rest of 3–10h (Ch. 2.13.1)' }
    }
  }

  // 1. Effective sector count — long range Ch. 2.11, plus Ch. 2.8.2: the
  // positioning leg counts as a sector when split duty is claimed and the
  // user confirms it's counted (POSITIONING COUNTED AS SECTOR, default YES).
  let effSectors = resolveEffSectors({ sectors, crewType, acclimatised, isCabinCrew, ifr, longRange, longestSectorStr }, notes, pendingNotes)
  if (effSectors == null) {
    return { error: 'Two non-acclimatised pilots: a sector over 11h is not permitted (Ch. 2.11.1) — an additional pilot is required (Ch. 2.11.2)' }
  }
  if (positioningCountsAsSector) {
    effSectors += 1
    notes.push('Positioning leg counted as a sector — required when claiming split duty after positioning (Ch. 2.8.2)')
  }

  // Airport standby (Ch. 2.9.2): the allowable FDP duration is a pure lookup
  // from the standby-start band and doesn't depend on a report time at all —
  // it's a separate, later event (Ch. 2.9.3, 2.9.4 Note 2). Show MAX FDP now;
  // FDP EXPIRES and the Case A/B duration math need the actual call-out time.
  // A positioning report time is a call-out too (Ch. 2.8.1).
  if (!reportTime && !(positioning && positioningReportTimeStr) && standby && standbyLocation === 'airport' && standbyStart) {
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

    // A delay after call-out from standby isn't a Ch. 2.7 delay — standby is
    // duty, not rest, and runs until the crew member actually reports
    // (Ch. 2.9.3), so REPORT TIME is the actual report and Case A/B applies.
    // The section is hidden while Standby is on; this guards stale state.
    if (delayedReporting && actualReportTimeStr && !(standby && standbyStart)) {
      const actualReportTime = normalizeTime(actualReportTimeStr)
      if (!actualReportTime) return { error: 'Invalid actual report time — use HH:MM or HHMM (0000–2359)' }
      const delayMins = diffMins(reportTime, actualReportTime)
      // Times carry no date, so an actual report earlier than planned wraps
      // to a "delay" of nearly 24h. Ch. 2.7 has no provision for a report
      // time moving earlier — anything over 12h is rejected outright.
      if (delayMins > 12 * 60) {
        return { error: 'Actual report time is earlier than planned, or delayed more than 12h — Ch. 2.7 only covers delays. Turn off Delayed Reporting and enter the new time as REPORT TIME.' }
      }
      if (delayMins >= 10 * 60 && delayUndisturbed) {
        // Delay ≥10h, crew not disturbed until the agreed hour: the elapsed
        // time is a rest period, so the FDP is simply the new report time's.
        bandTime   = actualReportTime
        clockStart = actualReportTime
        notes.push(`Delay ≥10h, undisturbed: elapsed time counts as rest — FDP calculated from the new report time ${actualReportTime} (Ch. 2.7.2)`)
      } else if (delayMins < 4 * 60) {
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
  //  - Home standby, ≤2h notice during 2200–0800 (Ch. 2.9.1 exception): the
  //    standby-start band is not applied at all — band stays as resolved above.
  //  - Otherwise, home or airport (Ch. 2.9.1, 2.9.2): the standby start time
  //    determines the allowable FDP, except that when the actual FDP starts
  //    in a more limiting time band, that FDP limit applies.
  // Only applies to Tables A/C (time-band based); Table B is keyed by preceding
  // rest, not local time, so there's no second band to compare against.
  const usesTimeBand = crewType === 'single' || acclimatised
  if (standby && standbyStart && usesTimeBand) {
    if (standbyLocation !== 'airport' && homeShortNotice) {
      notes.push('Home standby, ≤2h notice (2200–0800) — standby-start band not applied (Ch. 2.9.1 exception)')
    } else {
      const fdpFromStandbyBand = lookupFDP(standbyStart, effSectors, crewType, acclimatised, precedingRestH)
      if (fdpFromStandbyBand != null && fdpFromStandbyBand > baseFDP) {
        notes.push('Actual FDP start is in a more limiting time band than standby start — that FDP limit applies (Ch. 2.9.1)')
      } else if (fdpFromStandbyBand != null) {
        if (fdpFromStandbyBand < baseFDP) {
          notes.push('Standby-start time band is more limiting than report-time band — FDP based on standby start (Ch. 2.9.1)')
        }
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

  // 4. In-flight relief Ch. 2.12 — 2+ crew only (the section is hidden for
  // single pilot, so a stale toggle must not still extend the FDP).
  // Caps differ by crew type: bunk 18h (flight) / 19h (cabin); seat 15h (flight) / 16h (cabin).
  // The cap is applied after split duty below — it's the maximum FDP permissible.
  let ifrExtension = 0
  let ifrCap = null
  if (ifr && crewType === '2crew') {
    const restMins = parseDur(ifrRestStr)
    if (!restMins) {
      pendingNotes.push('IFR: enter rest period duration')
    } else if (restMins < 3 * 60) {
      notes.push('IFR rest <3h: no extension applies (Ch. 2.12.3)')
    } else {
      ifrCap = ifrType === 'bunk'
        ? (isCabinCrew ? 19 * 60 : 18 * 60)
        : (isCabinCrew ? 16 * 60 : 15 * 60)
      ifrExtension = ifrType === 'bunk' ? Math.floor(restMins / 2) : Math.floor(restMins / 3)
      fdp += ifrExtension
    }
  }

  // 5. Split duty Ch. 2.13 — qualifying conditions already hard-blocked above
  let splitExtension = 0
  if (splitDuty) {
    if (splitRestMins == null) {
      pendingNotes.push('Split duty: enter rest period duration')
    } else {
      splitExtension = Math.floor(splitRestMins / 2)
      fdp += splitExtension
    }
  }

  let reliefCapReduction = 0
  if (ifrCap != null && fdp > ifrCap) {
    reliefCapReduction = fdp - ifrCap
    fdp = ifrCap
    notes.push(`FDP capped at ${fmtDur(ifrCap)} (${ifrType} rest, ${isCabinCrew ? 'cabin crew' : 'flight crew'} limit Ch. 2.12.3)`)
  }

  // 6. PIC discretion — Ch. 2.15
  // Full 3h is only permitted on a single-sector flight, or immediately before
  // the last sector of a multi-sector FDP. Before any earlier sector, the limit
  // is 2h (Ch. 2.15.2). Uses the real sector count, not effSectors — the
  // long-range table-lookup substitution (Ch. 2.11) is only for entering the
  // table and must not be mistaken for an actual multi-sector duty. Going over
  // the limit is warned about but never capped: the extension, finish time and
  // CAAM check all reflect what actually happened (Ch. 2.15.1).
  // If the preceding rest was itself reduced (Ch. 2.14.3, 2.14.4, 2.16), discretion here is
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
      // Times carry no date, so an actual end before the original expiry
      // wraps to a near-24h "extension". Over 12h means the FDP finished
      // early — no discretion used (Ch. 2.15.1: what actually happens).
      if (picExtension > 12 * 60) {
        picExtension = 0
        notes.push('Finished within allowable FDP — no discretion used (Ch. 2.15.1)')
      }
      if (reducedPrecedingRest && sectors > 1 && !picBeforeLastSector && picExtension > 0) {
        errors.push('PIC discretion after a reduced rest may only be exercised immediately before the last sector (Ch. 2.15.3)')
      }
      if (picExtension > picCap) {
        errors.push(picCap === 3 * 60
          ? 'Extension over 3:00 — only permitted in an emergency (Ch. 2.15.1 Note 1)'
          : 'Extension over 2:00 before a non-final sector — exceeds the Ch. 2.15.2 limit')
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
  // `days` on each time: how many midnights it falls after the FDP start day.
  const at = mins => ({ end: toHHMM(toMins(fdpStartTime) + mins), days: Math.floor((toMins(fdpStartTime) + mins) / 1440) })
  const picRef = picDiscretion ? {
    orig: { label: 'ORIGINAL', ...at(fdpPrePIC), employer: false, caam: false },
    h1: { label: '+1:00', ...at(fdpPrePIC + 60),  employer: true, caam: reducedPrecedingRest },
    h2: { label: '+2:00', ...at(fdpPrePIC + 120), employer: true, caam: reducedPrecedingRest },
    h3: { label: '+3:00', ...at(fdpPrePIC + 180), employer: true, caam: true  },
  } : null

  return {
    ok: true,
    baseFDP, effSectors, fdp, fdpPrePIC,
    endTime: at(fdp).end, endDays: at(fdp).days,
    tableLabel, bandLabel,
    breakdown: { cabinAllowance, standbyReduction, ifrExtension, splitExtension, reliefCapReduction, picExtension },
    picRef, picEmployerNote,
    notes, errors, pendingNotes, caamNotes,
  }
}
