import { describe, it, expect } from 'vitest'
import { computeFTL } from './FTLCalculator'

const base = {
  reportTime: '0900', sectors: 1, crewType: '2crew', acclimatised: true,
  isCabinCrew: false, precedingRestStr: '',
  longRange: false, longestSectorStr: '',
  standby: false, standbyStart: '',
  ifr: false, ifrType: 'bunk', ifrRestStr: '',
  splitDuty: false, splitRestStr: '',
  picDiscretion: false, picActualEndStr: '', picBeforeLastSector: true,
}

// PIC discretion is keyed off an actual FDP end time, not a typed duration —
// tests derive the actual end time from the scenario's own (pre-discretion)
// expiry plus the extension being tested for, rather than hardcoding a clock time.
function addMins(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function actualEndFor(overrides, extensionMins) {
  const original = computeFTL({ ...base, ...overrides, picDiscretion: false }).endTime
  return addMins(original, extensionMins)
}

describe('computeFTL — standby band selection (Ch. 2.9.1)', () => {
  it('uses the more limiting standby-start band over the report-time band', () => {
    // Standby starts 0500 (band 2200–0559 → 11:00), called out, report 0900 (band 0800–1259 → 14:00).
    // Standby duration 4h (<6h, Case A) — must take the more limiting 11:00, not 14:00.
    const r = computeFTL({ ...base, reportTime: '0900', standby: true, standbyStart: '0500' })
    expect(r.baseFDP).toBe(11 * 60)
    expect(r.fdp).toBe(11 * 60)
    expect(r.bandLabel).toBe('2200–0559')
  })

  it('keeps the report-time band when it is the more limiting one', () => {
    // Standby starts 0900 (band 0800–1259 → 14:00), report 1800 (band 1800–2159 → 12:00).
    const r = computeFTL({ ...base, reportTime: '1800', standby: true, standbyStart: '0900' })
    expect(r.baseFDP).toBe(12 * 60)
    expect(r.bandLabel).toBe('1800–2159')
  })

  it('does not apply band comparison to Table B (not acclimatised, rest-based)', () => {
    const r = computeFTL({
      ...base, acclimatised: false, precedingRestStr: '10:00',
      standby: true, standbyStart: '0500',
    })
    // Table B row is keyed by preceding rest, independent of standby start time band.
    expect(r.tableLabel).toBe('B')
  })
})

describe('computeFTL — long range sector boundary (Ch. 2.11)', () => {
  it('does not apply long-range modifier to a sector of exactly 7:00', () => {
    const r = computeFTL({ ...base, longRange: true, longestSectorStr: '7:00' })
    expect(r.effSectors).toBe(1)
    expect(r.baseFDP).toBe(14 * 60) // unmodified Table A, band 0800–1259, 1 sector
  })

  it('applies the long-range modifier to a sector over 7:00', () => {
    const r = computeFTL({ ...base, longRange: true, longestSectorStr: '7:01' })
    expect(r.effSectors).toBe(2) // 7–9h band, acclimatised → counts as 2 sectors
  })

  it('flags a missing sector duration instead of silently skipping the modifier', () => {
    const r = computeFTL({ ...base, longRange: true, longestSectorStr: '' })
    expect(r.pendingNotes.some(n => n.includes('enter longest sector duration'))).toBe(true)
    expect(r.effSectors).toBe(1)
  })
})

describe('computeFTL — cabin crew separate report time (Ch. 2.21.2a)', () => {
  it('defaults to the flight crew report time for both band and FDP clock', () => {
    const r = computeFTL({ ...base, isCabinCrew: true, reportTime: '0900' })
    expect(r.bandLabel).toBe('0800–1259')
    expect(r.fdp).toBe(15 * 60)       // 14:00 table + 1:00 cabin allowance
    expect(r.endTime).toBe('00:00')   // 09:00 + 15:00, wraps past midnight
  })

  it('uses flight crew time for the table band but cabin time for the FDP clock when they differ', () => {
    // Flight crew report 0900 (band 0800–1259 → 14:00 base); cabin crew reports later, 0930.
    const r = computeFTL({ ...base, isCabinCrew: true, reportTime: '0900', cabinReportTime: '0930' })
    expect(r.bandLabel).toBe('0800–1259')   // band still from flight crew time
    expect(r.fdp).toBe(15 * 60)
    expect(r.endTime).toBe('00:30')         // clock starts from cabin's own 09:30 report
  })

  it('uses cabin crew own report time for standby duration when they differ', () => {
    // Standby starts 0500 (band 2200–0559). Flight crew reports 0900, cabin crew reports 0930.
    // Standby duration must be measured to the cabin crew's own report time (4.5h, still Case A).
    const r = computeFTL({
      ...base, isCabinCrew: true, reportTime: '0900', cabinReportTime: '0930',
      standby: true, standbyStart: '0500',
    })
    expect(r.notes.some(n => n.includes('Case A'))).toBe(true)
  })
})

describe('computeFTL — delayed reporting (Ch. 2.7.1)', () => {
  it('delay <4h: band stays on the original report time, clock starts at the actual report time', () => {
    // Planned 1000 (band 0800–1259 → 14:00); actual delayed 3h59 to 1359 (band 1300–1759 → 13:00, more limiting).
    // <4h delay must still use the ORIGINAL band, not the more limiting one.
    const r = computeFTL({ ...base, reportTime: '1000', delayedReporting: true, actualReportTimeStr: '1359' })
    expect(r.baseFDP).toBe(14 * 60)
    expect(r.endTime).toBe('03:59') // 13:59 + 14:00, wraps past midnight
  })

  it('delay ≥4h: band is the more limiting of planned/actual, clock starts 4h after the original report time', () => {
    // Planned 0500 (band 2200–0559 → 11:00, more limiting); actual delayed 5h to 1000 (band 0800–1259 → 14:00).
    const r = computeFTL({ ...base, reportTime: '0500', delayedReporting: true, actualReportTimeStr: '1000' })
    expect(r.baseFDP).toBe(11 * 60)        // original band wins (more limiting), despite actual being later
    expect(r.bandLabel).toBe('2200–0559')
    expect(r.endTime).toBe('20:00')        // clock starts 0500+4:00=0900, +11:00 FDP = 2000
  })
})

describe('computeFTL — positioning (Ch. 2.8.1)', () => {
  it('FDP commences at the positioning report time, not the flight report time', () => {
    const r = computeFTL({ ...base, reportTime: '0900', positioning: true, positioningReportTimeStr: '0700' })
    expect(r.bandLabel).toBe('0600–0759')
    expect(r.baseFDP).toBe(13 * 60)
    expect(r.endTime).toBe('20:00') // 07:00 + 13:00
  })

  it('computes the full result with no flight report time at all — positioning is self-sufficient', () => {
    const r = computeFTL({ ...base, reportTime: '', positioning: true, positioningReportTimeStr: '0700' })
    expect(r.ok).toBe(true)
    expect(r.pending).toBeUndefined() // unlike airport standby, this is a complete result, not pending
    expect(r.bandLabel).toBe('0600–0759')
    expect(r.baseFDP).toBe(13 * 60)
    expect(r.endTime).toBe('20:00')
  })

  it('Ch. 2.8.2: counts the positioning leg as a sector when split duty is claimed after it', () => {
    const withoutSplit = computeFTL({ ...base, sectors: 1, positioning: true, positioningReportTimeStr: '0700' })
    const withSplit = computeFTL({
      ...base, sectors: 1, positioning: true, positioningReportTimeStr: '0700',
      splitDuty: true, splitRestStr: '5:00',
    })
    expect(withoutSplit.effSectors).toBe(1)
    expect(withSplit.effSectors).toBe(2) // +1 for the positioning leg
    expect(withSplit.notes.some(n => n.includes('2.8.2'))).toBe(true)
  })
})

describe('computeFTL — standby location (Ch. 2.9.2 airport / 2.9.1 home exception)', () => {
  it('airport standby uses the standby-start band when it is the more limiting one', () => {
    // Standby 0500 (2200–0559 → 11:00), called out for 0900 (0800–1259 → 14:00).
    const r = computeFTL({
      ...base, standby: true, standbyStart: '0500', standbyLocation: 'airport', reportTime: '0900',
    })
    expect(r.baseFDP).toBe(11 * 60)
    expect(r.bandLabel).toBe('2200–0559')
  })

  it('airport standby switches to the actual FDP start band when that is more limiting (Ch. 2.9.1 exception)', () => {
    // Standby 1100 (0800–1259 → 14:00), called out for 1900 (1800–2159 → 12:00), 8h standby → Case B −2:00.
    const r = computeFTL({
      ...base, standby: true, standbyStart: '1100', standbyLocation: 'airport', reportTime: '1900',
    })
    expect(r.baseFDP).toBe(12 * 60)
    expect(r.bandLabel).toBe('1800–2159')
    expect(r.fdp).toBe(10 * 60)
    expect(r.endTime).toBe('05:00')
  })

  it('home standby (general case) compares bands and takes the more limiting, same as before', () => {
    const r = computeFTL({
      ...base, standby: true, standbyStart: '0900', standbyLocation: 'home', homeShortNotice: false, reportTime: '1800',
    })
    expect(r.baseFDP).toBe(12 * 60) // report-time band (1800–2159) is more limiting here
  })

  it('home standby with ≤2h notice skips the standby-start band entirely', () => {
    const r = computeFTL({
      ...base, standby: true, standbyStart: '0500', standbyLocation: 'home', homeShortNotice: true, reportTime: '0900',
    })
    expect(r.baseFDP).toBe(14 * 60) // report-time band used despite standby-start band (11:00) being more limiting
    expect(r.notes.some(n => n.includes('2.9.1 exception'))).toBe(true)
  })

  it('airport standby with no report time yet: MAX FDP computes from standby start, FDP EXPIRES is pending', () => {
    const r = computeFTL({
      ...base, reportTime: '', standby: true, standbyStart: '0500', standbyLocation: 'airport',
    })
    expect(r.ok).toBe(true)
    expect(r.pending).toBe(true)
    expect(r.baseFDP).toBe(11 * 60) // Table A, 2200–0559, 1 sector
    expect(r.fdp).toBe(11 * 60)
    expect(r.endTime).toBeNull()
  })
})

describe('computeFTL — reduced preceding rest (Ch. 2.13.4 / 2.15.3 / 2.15.4)', () => {
  it('blocks split duty entirely — no FDP shown', () => {
    const r = computeFTL({ ...base, sectors: 2, reducedPrecedingRest: true, splitDuty: true, splitRestStr: '5:00' })
    expect(r.ok).toBeUndefined()
    expect(r.error).toMatch(/2\.13\.4/)
  })

  it('requires a CAAM report regardless of extension size', () => {
    const overrides = { reducedPrecedingRest: true }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 30),
    })
    expect(r.caamNotes.some(n => n.includes('2.15.4'))).toBe(true)
  })

  it('restricts discretion to immediately before the last sector', () => {
    const overrides = { sectors: 3, reducedPrecedingRest: true, picBeforeLastSector: false }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 60),
    })
    expect(r.errors.some(e => e.includes('2.15.3'))).toBe(true)
  })
})

describe('computeFTL — PIC discretion employer/CAAM reporting (Ch. 2.15.4)', () => {
  it('any extension must be reported to the employer, even under 2h with no reduced rest', () => {
    const overrides = { sectors: 1 }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 30),
    })
    expect(r.breakdown.picExtension).toBe(30)
    expect(r.picEmployerNote).toMatch(/2\.15\.4/)
    expect(r.caamNotes).toHaveLength(0)
  })

  it('extension over 2h also requires a CAAM report, on top of the employer report', () => {
    const overrides = { sectors: 1 }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 3 * 60),
    })
    expect(r.picEmployerNote).toMatch(/2\.15\.4/)
    expect(r.caamNotes.some(n => n.includes('2.15.4'))).toBe(true)
  })

  it('no extension used means no reporting requirement', () => {
    const overrides = { sectors: 1 }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 0),
    })
    expect(r.breakdown.picExtension).toBe(0)
    expect(r.picEmployerNote).toBe(null)
    expect(r.caamNotes).toHaveLength(0)
  })
})

describe('computeFTL — delayed reporting limits (Ch. 2.7.1 / 2.7.2)', () => {
  it('rejects an actual report earlier than planned — Ch. 2.7 only covers delays', () => {
    const r = computeFTL({ ...base, reportTime: '1000', delayedReporting: true, actualReportTimeStr: '0900' })
    expect(r.ok).toBeUndefined()
    expect(r.error).toMatch(/earlier than planned/)
  })

  it('still accepts a delay of exactly 12h', () => {
    // Planned 0600 (13:00) → actual 1800 (12:00, more limiting); clock starts 1000.
    const r = computeFTL({ ...base, reportTime: '0600', delayedReporting: true, actualReportTimeStr: '1800' })
    expect(r.ok).toBe(true)
    expect(r.endTime).toBe('22:00')
  })

  it('delay ≥10h undisturbed: FDP calculated fresh from the new report time', () => {
    const delayed = { ...base, reportTime: '0600', delayedReporting: true, actualReportTimeStr: '1700' }
    const undisturbed = computeFTL({ ...delayed, delayUndisturbed: true })
    expect(undisturbed.bandLabel).toBe('1300–1759')
    expect(undisturbed.endTime).toBe('06:00') // 17:00 + 13:00
    const disturbed = computeFTL(delayed)
    expect(disturbed.endTime).toBe('23:00')   // 2.7.1: clock starts 10:00
  })
})

describe('computeFTL — PIC discretion finished early (Ch. 2.15.1)', () => {
  it('actual end before the original expiry means no discretion used', () => {
    // Original expiry 23:00; actually finished 22:30.
    const r = computeFTL({ ...base, picDiscretion: true, picActualEndStr: '2230' })
    expect(r.breakdown.picExtension).toBe(0)
    expect(r.fdp).toBe(14 * 60)
    expect(r.errors).toHaveLength(0)
    expect(r.caamNotes).toHaveLength(0)
    expect(r.picEmployerNote).toBe(null)
  })
})

describe('computeFTL — split duty qualifying conditions (Ch. 2.13.1 / 2.8.2)', () => {
  const split = { ...base, sectors: 2, splitDuty: true }

  it('blocks a rest under 3h', () => {
    expect(computeFTL({ ...split, splitRestStr: '2:59' }).error).toMatch(/3–10h/)
  })

  it('blocks a rest over 10h', () => {
    expect(computeFTL({ ...split, splitRestStr: '10:01' }).error).toMatch(/3–10h/)
  })

  it('allows exactly 3h and exactly 10h', () => {
    expect(computeFTL({ ...split, splitRestStr: '3:00' }).breakdown.splitExtension).toBe(90)
    expect(computeFTL({ ...split, splitRestStr: '10:00' }).breakdown.splitExtension).toBe(5 * 60)
  })

  it('blocks a single sector with no positioning', () => {
    const r = computeFTL({ ...split, sectors: 1, splitRestStr: '4:00' })
    expect(r.error).toMatch(/two or more sectors/)
  })

  it('positioning NOT counted as a sector + 1 flight sector → blocked', () => {
    const r = computeFTL({
      ...split, sectors: 1, reportTime: '', positioning: true, positioningReportTimeStr: '0700',
      positioningAsSector: false, splitRestStr: '5:00',
    })
    expect(r.error).toMatch(/two or more sectors/)
  })

  it('positioning NOT counted as a sector + 2 flight sectors → still split duty, positioning not added', () => {
    const r = computeFTL({
      ...split, reportTime: '', positioning: true, positioningReportTimeStr: '0700',
      positioningAsSector: false, splitRestStr: '5:00',
    })
    expect(r.effSectors).toBe(2)
    expect(r.fdp).toBe(12 * 60 + 15 + 150) // 0600–0759 2 sectors 12:15 + 2:30
  })
})

describe('computeFTL — in-flight relief and long range crew rules', () => {
  it('ignores in-flight relief for a single pilot', () => {
    const r = computeFTL({ ...base, crewType: 'single', ifr: true, ifrRestStr: '6:00' })
    expect(r.breakdown.ifrExtension).toBe(0)
    expect(r.fdp).toBe(11 * 60) // Table C 0800–1259, ≤4 sectors
  })

  it('never applies long range to cabin crew (Ch. 2.11.1 / 2.21.2f)', () => {
    const r = computeFTL({ ...base, isCabinCrew: true, longRange: true, longestSectorStr: '10:00' })
    expect(r.effSectors).toBe(1)
    expect(r.fdp).toBe(15 * 60)
  })

  it('skips long range when in-flight relief is carried (Ch. 2.11.2)', () => {
    const r = computeFTL({ ...base, longRange: true, longestSectorStr: '12:00', ifr: true, ifrRestStr: '6:00' })
    expect(r.effSectors).toBe(1)
    expect(r.fdp).toBe(17 * 60) // 14:00 + 3:00 bunk
    expect(r.notes.some(n => n.includes('2.11.2'))).toBe(true)
  })

  it('applies the in-flight relief cap after split duty is added', () => {
    // 2 sectors 13:15 + bunk 12h (+6:00) + split 6h (+3:00) = 22:15 → capped.
    const flight = computeFTL({ ...base, sectors: 2, ifr: true, ifrRestStr: '12:00', splitDuty: true, splitRestStr: '6:00' })
    expect(flight.fdp).toBe(18 * 60)
    const cabin = computeFTL({ ...base, sectors: 2, isCabinCrew: true, ifr: true, ifrRestStr: '12:00', splitDuty: true, splitRestStr: '6:00' })
    expect(cabin.fdp).toBe(19 * 60)
  })
})

describe('computeFTL — Table B at exactly 30h preceding rest', () => {
  it('uses the "between 18 and 30" row', () => {
    const r = computeFTL({ ...base, acclimatised: false, precedingRestStr: '30:00' })
    expect(r.baseFDP).toBe(11 * 60 + 30)
  })
})

describe('computeFTL — airport standby called out to position (Ch. 2.8.1 / 2.9.2)', () => {
  it('a positioning report time counts as call-out — expiry is calculated, not pending', () => {
    const r = computeFTL({
      ...base, reportTime: '', standby: true, standbyStart: '0500', standbyLocation: 'airport',
      positioning: true, positioningReportTimeStr: '0800',
    })
    expect(r.pending).toBeUndefined()
    expect(r.fdp).toBe(11 * 60)     // standby-start band 2200–0559, 3h standby (Case A)
    expect(r.endTime).toBe('19:00') // 08:00 + 11:00
  })
})

describe('computeFTL — PIC discretion sector-position cap (Ch. 2.15.2)', () => {
  it('allows full 3h on a single-sector flight', () => {
    const overrides = { sectors: 1 }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 3 * 60),
    })
    expect(r.breakdown.picExtension).toBe(3 * 60)
    expect(r.errors).toHaveLength(0)
  })

  it('uses the real sector count, not the long-range-inflated effective count', () => {
    // 1 real sector, long range ON with a 10h sector → effSectors becomes 3 for table lookup,
    // but for PIC discretion purposes this is still a single-sector flight → full 3h allowed.
    const overrides = { sectors: 1, longRange: true, longestSectorStr: '10:00' }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 3 * 60),
    })
    expect(r.effSectors).toBe(3)
    expect(r.breakdown.picExtension).toBe(3 * 60)
    expect(r.errors).toHaveLength(0)
  })

  it('allows full 3h before the last sector of a multi-sector flight', () => {
    const overrides = { sectors: 3, picBeforeLastSector: true }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 3 * 60),
    })
    expect(r.breakdown.picExtension).toBe(3 * 60)
    expect(r.errors).toHaveLength(0)
  })

  it('caps at 2h before an earlier sector of a multi-sector flight', () => {
    const overrides = { sectors: 3, picBeforeLastSector: false }
    const r = computeFTL({
      ...base, ...overrides, picDiscretion: true, picActualEndStr: actualEndFor(overrides, 3 * 60),
    })
    expect(r.breakdown.picExtension).toBe(2 * 60)
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
