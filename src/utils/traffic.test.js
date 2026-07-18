import { describe, it, expect } from 'vitest'
import { fmtTrack, fmtDelay, statusColorFor, normalizeFlightStatus, normalizeSkylinkPosition, rankFlightCandidates } from './traffic'

// Shape confirmed against AeroDataBox's /flights/number/{flight}/{date}
// response (RapidAPI console + production, OD122, 11 Jul 2026) — explicit
// status enum and datetimes (utc+local) per leg, used over SkyLink's
// flight_status endpoint, which has no date parameter and was observed
// returning a stale (weeks-old) record for a live flight. NOTE: the real API
// separates date/time with a space ("2026-07-11 06:55Z"), not the "T" the
// OpenAPI docs example shows — this fixture uses the real format so a
// regression here fails the test instead of only showing up in production.
const RAW_STATUS = {
  number: 'OD122', callSign: 'BTK122', status: 'Delayed',
  airline: { name: 'Batik Air', iata: 'OD', icao: 'BTK' },
  aircraft: { model: 'B738', reg: '9M-LNA', modeS: '750A12' },
  codeshareStatus: 'IsOperator', isCargo: false,
  greatCircleDistance: { nm: 3306.4, km: 6123.1 },
  location: { lat: -12.4, lon: 118.7, altitude: 37000, speed: 480, heading: 315.2 },
  departure: {
    airport: { iata: 'SYD', icao: 'YSSY', name: 'Sydney' },
    scheduledTime: { utc: '2026-07-05 22:35Z', local: '2026-07-06 08:35+10:00' },
    revisedTime: { utc: '2026-07-06 01:00Z', local: '2026-07-06 11:00+10:00' },
    terminal: '1', gate: '26', checkInDesk: 'A1-12',
    runwayTime: { local: '2026-07-06 08:47+10:00' },
    quality: ['Basic', 'Live'],
  },
  arrival: {
    airport: { iata: 'KUL', icao: 'WMKK', name: 'Kuala Lumpur' },
    scheduledTime: { utc: '2026-07-06 07:40Z', local: '2026-07-06 15:40+08:00' },
    terminal: '1', gate: 'C22', baggageBelt: '4',
    predictedTime: { local: '2026-07-06 15:52+08:00' },
  },
}

describe('normalizeFlightStatus', () => {
  it('returns null when there is no matching flight', () => {
    expect(normalizeFlightStatus(null)).toBeNull()
  })
  it('maps status, route, times (with UTC offset), and delay', () => {
    const s = normalizeFlightStatus(RAW_STATUS)
    expect(s.flight).toBe('OD122')
    expect(s.airline).toBe('Batik Air')
    expect(s.route).toBe('SYD → KUL')
    expect(s.status).toBe('DELAYED')
    expect(s.statusColor).toBe('var(--cp-orange)')
    expect(s.schedDep).toBe('08:35 +10:00 · 06 Jul')
    expect(s.schedArr).toBe('15:40 +08:00 · 06 Jul')
    expect(s.depActual).toBe('08:47 +10:00 · 06 Jul') // from departure.runwayTime
    expect(s.estArr).toBeNull() // no arrival.revisedTime in this fixture
    // Prefers arrival's own delay; falls back to departure's here because
    // this fixture's arrival has no revisedTime at all.
    expect(s.delayMinutes).toBe(145) // 22:35Z -> 01:00Z departure, actual UTC diff
    expect(s.depTerminal).toBe('1')
    expect(s.depGate).toBe('26')
    expect(s.arrTerminal).toBe('1')
    expect(s.arrGate).toBe('C22')
    expect(s.depCode).toBe('SYD')
    expect(s.arrCode).toBe('KUL')
  })
  it('falls back to departure revisedTime for depActual when there is no runwayTime', () => {
    const s = normalizeFlightStatus({
      number: 'MH9', status: 'Departed',
      departure: { revisedTime: { local: '2026-07-18 09:12+08:00' } },
    })
    expect(s.depActual).toBe('09:12 +08:00 · 18 Jul')
  })
  it('prefers the arrival leg delay over departure when both are available', () => {
    // Regression for a real report: departure ran 17 min late but arrival
    // was revised 25 min early — "Delay" must reflect arrival (this tab is
    // about arrival), not silently fall back to the unrelated departure number.
    const s = normalizeFlightStatus({
      number: 'MH174', status: 'EnRoute',
      departure: { scheduledTime: { utc: '2026-07-18 01:00Z' }, revisedTime: { utc: '2026-07-18 01:17Z' } },
      arrival: { scheduledTime: { utc: '2026-07-18 06:45Z' }, revisedTime: { utc: '2026-07-18 06:20Z' } },
    })
    expect(s.delayMinutes).toBe(-25)
  })
  it('maps the extended fields (callsign, aircraft, checkin/baggage, predicted time, quality, codeshare, distance, position)', () => {
    const s = normalizeFlightStatus(RAW_STATUS)
    expect(s.callSign).toBe('BTK122')
    expect(s.aircraft).toBe('B738 · 9M-LNA · modeS 750A12')
    expect(s.photo).toBeNull() // no aircraft.image in this fixture
    expect(s.depCheckInDesk).toBe('A1-12')
    expect(s.arrBaggageBelt).toBe('4')
    expect(s.arrPredictedTime).toBe('15:52 +08:00 · 06 Jul')
    expect(s.quality).toBe('Basic, Live') // falls back to departure.quality since arrival has none
    expect(s.codeshare).toBe('IsOperator')
    expect(s.distance).toBe('3306 nm') // prefers the nm field over converting km
    expect(s.position).toEqual({ latLon: '-12.4, 118.7', alt: 'FL370', speed: '480kt', heading: '315°' })
  })
  it('formats altitude in feet below FL180 and flight levels at/above it', () => {
    const low = normalizeFlightStatus({ number: 'MH6', status: 'EnRoute', location: { lat: 1, lon: 1, altitude: 4500 } })
    expect(low.position.alt).toBe('4,500 ft')
    const high = normalizeFlightStatus({ number: 'MH7', status: 'EnRoute', location: { lat: 1, lon: 1, altitude: 18000 } })
    expect(high.position.alt).toBe('FL180')
  })
  it('reads the aircraft photo whether it is a bare URL or a {url} object', () => {
    const bare = normalizeFlightStatus({ number: 'MH8', status: 'Scheduled', aircraft: { image: 'https://example.com/a.jpg' } })
    expect(bare.photo).toBe('https://example.com/a.jpg')
    const wrapped = normalizeFlightStatus({ number: 'MH9b', status: 'Scheduled', aircraft: { image: { url: 'https://example.com/b.jpg' } } })
    expect(wrapped.photo).toBe('https://example.com/b.jpg')
  })
  it('falls back to converting km to nm when no nm field is present', () => {
    const s = normalizeFlightStatus({ number: 'MH4', status: 'Scheduled', greatCircleDistance: { km: 100 } })
    expect(s.distance).toBe('54 nm')
  })
  it('leaves the extended fields null when absent', () => {
    const s = normalizeFlightStatus({ number: 'MH1', status: 'Scheduled' })
    expect(s.callSign).toBeNull()
    expect(s.aircraft).toBeNull()
    expect(s.photo).toBeNull()
    expect(s.codeshare).toBeNull()
    expect(s.distance).toBeNull()
    expect(s.position).toBeNull()
    expect(s.quality).toBeNull()
    expect(s.depCode).toBeNull()
    expect(s.arrCode).toBeNull()
  })
  it('marks a cargo codeshare flight in one combined field', () => {
    const s = normalizeFlightStatus({ number: 'MH5', status: 'Scheduled', codeshareStatus: 'IsCodeshare', isCargo: true })
    expect(s.codeshare).toBe('IsCodeshare · Cargo')
  })
  it('also accepts the OpenAPI-documented "T" separator and seconds, not just the real space-separated one', () => {
    const s = normalizeFlightStatus({
      number: 'MH3', status: 'Scheduled',
      departure: { scheduledTime: { local: '2026-07-06T08:35:00+10:00' } },
    })
    expect(s.schedDep).toBe('08:35 +10:00 · 06 Jul')
  })
  it('formats a "Z" (UTC) offset as +00:00', () => {
    const s = normalizeFlightStatus({ number: 'MH10', status: 'Scheduled', departure: { scheduledTime: { local: '2026-07-06T08:35:00Z' } } })
    expect(s.schedDep).toBe('08:35 +00:00 · 06 Jul')
  })
  it('leaves route/delay unset when the raw fields are missing', () => {
    const s = normalizeFlightStatus({ number: 'MH1', status: 'Scheduled' })
    expect(s.route).toBeNull()
    expect(s.delayMinutes).toBeNull()
    expect(s.statusColor).toBe('var(--cp-acc2)')
    expect(s.depTerminal).toBeNull()
    expect(s.depGate).toBeNull()
    expect(s.arrTerminal).toBeNull()
    expect(s.arrGate).toBeNull()
  })
  it('correctly computes delay across a UTC midnight rollover', () => {
    // SkyLink's bare "HH:MM"/"DD Mon" (no year) strings couldn't safely
    // resolve this; AeroDataBox's full ISO datetimes make it a plain diff.
    const s = normalizeFlightStatus({
      number: 'MH2', status: 'Departed',
      departure: {
        scheduledTime: { utc: '2026-07-09 23:50Z' },
        revisedTime: { utc: '2026-07-10 00:10Z' },
      },
    })
    expect(s.delayMinutes).toBe(20)
  })

  describe('derived status (cross-checked against the provider label)', () => {
    it('overrides a stale "Arrived" status when the flight has not reached its estimated arrival time yet (MH174 regression)', () => {
      const s = normalizeFlightStatus({
        number: 'MH174', status: 'Arrived',
        departure: { runwayTime: { utc: '2026-07-18 01:12Z' } },
        arrival: { predictedTime: { utc: '2026-07-18 06:20Z' } },
      }, Date.parse('2026-07-18 02:30Z'))
      expect(s.status).toBe('AIRBORNE')
    })
    it('overrides a stale "Scheduled" status once well past the arrival time', () => {
      const s = normalizeFlightStatus({
        number: 'MH2b', status: 'Scheduled',
        departure: { scheduledTime: { utc: '2026-07-18 01:00Z' } },
        arrival: { scheduledTime: { utc: '2026-07-18 06:00Z' } },
      }, Date.parse('2026-07-18 08:00Z'))
      expect(s.status).toBe('LANDED')
    })
    it('never overrides an explicit cancellation, regardless of timestamps', () => {
      const s = normalizeFlightStatus({
        number: 'MH3b', status: 'Cancelled',
        departure: { scheduledTime: { utc: '2026-07-18 01:00Z' } },
        arrival: { scheduledTime: { utc: '2026-07-18 06:00Z' } },
      }, Date.parse('2026-07-18 08:00Z'))
      expect(s.status).toBe('CANCELLED')
    })
    it('keeps a richer in-progress status (e.g. Boarding) when it does not contradict the derived guess', () => {
      const s = normalizeFlightStatus({
        number: 'MH4b', status: 'Boarding',
        departure: { scheduledTime: { utc: '2026-07-18 01:00Z' } },
        arrival: { scheduledTime: { utc: '2026-07-18 06:00Z' } },
      }, Date.parse('2026-07-18 00:30Z'))
      expect(s.status).toBe('BOARDING')
    })
    it('keeps the raw status when departure time has passed but nothing confirms actual departure (ambiguous)', () => {
      const s = normalizeFlightStatus({
        number: 'MH5b', status: 'Delayed',
        departure: { scheduledTime: { utc: '2026-07-18 01:00Z' } },
      }, Date.parse('2026-07-18 02:00Z'))
      expect(s.status).toBe('DELAYED')
    })
    it('uses the derived status when the provider gives none at all', () => {
      const s = normalizeFlightStatus({
        number: 'MH6b',
        departure: { runwayTime: { utc: '2026-07-18 01:00Z' } },
        arrival: { scheduledTime: { utc: '2026-07-18 06:00Z' } },
      }, Date.parse('2026-07-18 02:00Z'))
      expect(s.status).toBe('AIRBORNE')
    })
  })
})

describe('rankFlightCandidates', () => {
  // A registration search can return several sectors flown by one aircraft
  // in a day — this ranks them so the UI can pre-select the most relevant.
  const morningLeg = { number: 'MH1', departure: { runwayTime: { utc: '2026-07-18 01:00Z' } }, arrival: { scheduledTime: { utc: '2026-07-18 03:00Z' } } }
  const middayLeg = { number: 'MH2', departure: { runwayTime: { utc: '2026-07-18 05:00Z' } }, arrival: { scheduledTime: { utc: '2026-07-18 07:00Z' } } }
  const eveningLeg = { number: 'MH3', departure: { scheduledTime: { utc: '2026-07-18 10:00Z' } }, arrival: { scheduledTime: { utc: '2026-07-18 12:00Z' } } }

  it('ranks the leg currently in progress first, even if another leg is numerically closer', () => {
    // now is inside middayLeg's window (05:00-07:00), and only 1hr past
    // morningLeg's arrival — closer in raw distance, but not in progress.
    const ranked = rankFlightCandidates([morningLeg, middayLeg, eveningLeg], Date.parse('2026-07-18 06:00Z'))
    expect(ranked[0].raw.number).toBe('MH2')
    expect(ranked[0]._rank.inProgress).toBe(true)
  })
  it('when nothing is in progress, ranks by smallest distance to now', () => {
    // now is 30 min before eveningLeg departs — closer than midayLeg's
    // completed arrival (3hr away) or morningLeg's (7hr away).
    const ranked = rankFlightCandidates([morningLeg, middayLeg, eveningLeg], Date.parse('2026-07-18 09:30Z'))
    expect(ranked[0].raw.number).toBe('MH3')
    expect(ranked[0]._rank.inProgress).toBe(false)
  })
  it('preserves the raw flight objects unchanged, just reordered', () => {
    const ranked = rankFlightCandidates([eveningLeg, morningLeg], Date.parse('2026-07-18 02:00Z'))
    expect(ranked.map(r => r.raw.number)).toEqual(['MH1', 'MH3'])
  })
  it('handles an empty list', () => {
    expect(rankFlightCandidates([], Date.now())).toEqual([])
  })
  it('does not mark a leg in progress from its scheduled window alone — departure must be confirmed', () => {
    // now falls between this leg's scheduled dep/arr times, but neither
    // runwayTime nor revisedTime confirms it actually left the ground yet
    // (could still be delayed at the gate) — must not claim it's live.
    const scheduledOnly = { number: 'MH9', departure: { scheduledTime: { utc: '2026-07-18 09:00Z' } }, arrival: { scheduledTime: { utc: '2026-07-18 11:00Z' } } }
    const ranked = rankFlightCandidates([scheduledOnly], Date.parse('2026-07-18 10:00Z'))
    expect(ranked[0]._rank.inProgress).toBe(false)
  })
})

describe('statusColorFor', () => {
  it('flags cancelled red', () => { expect(statusColorFor('Cancelled')).toBe('var(--cp-red)') })
  it('flags landed dim', () => { expect(statusColorFor('Landed 14:32')).toBe('var(--cp-dim)') })
  it('flags estimated/delayed orange', () => { expect(statusColorFor('Estimated 11:00')).toBe('var(--cp-orange)') })
  it('flags scheduled with the secondary accent', () => { expect(statusColorFor('Scheduled')).toBe('var(--cp-acc2)') })
  it('falls back to dim for unrecognized text', () => { expect(statusColorFor('')).toBe('var(--cp-dim)') })

  // AeroDataBox's status enum (Expected/EnRoute/CheckIn/Boarding/GateClosed/
  // Departed/Delayed/Approaching/Arrived/Canceled/Diverted/CanceledUncertain).
  it('flags AeroDataBox in-progress states with the primary accent', () => {
    expect(statusColorFor('EnRoute')).toBe('var(--cp-acc)')
    expect(statusColorFor('Boarding')).toBe('var(--cp-acc)')
    expect(statusColorFor('GateClosed')).toBe('var(--cp-acc)')
    expect(statusColorFor('Approaching')).toBe('var(--cp-acc)')
  })
  it('flags AeroDataBox upcoming states with the secondary accent', () => {
    expect(statusColorFor('Expected')).toBe('var(--cp-acc2)')
    expect(statusColorFor('CheckIn')).toBe('var(--cp-acc2)')
  })
  it('flags AeroDataBox cancellation states red', () => {
    expect(statusColorFor('Canceled')).toBe('var(--cp-red)')
    expect(statusColorFor('CanceledUncertain')).toBe('var(--cp-red)')
  })
})

describe('fmtTrack', () => {
  it('rounds and pads to 3 digits', () => { expect(fmtTrack(64.653824)).toBe('065°') })
  it('pads single-digit tracks', () => { expect(fmtTrack(7)).toBe('007°') })
})

describe('fmtDelay', () => {
  it('reports on time', () => { expect(fmtDelay(0)).toBe('On time') })
  it('reports a sub-hour delay in minutes', () => { expect(fmtDelay(27)).toBe('+27 min') })
  it('reports a multi-hour delay as h/m', () => { expect(fmtDelay(145)).toBe('+2h25m') })
  it('reports an early arrival', () => { expect(fmtDelay(-5)).toBe('5 min early') })
  it('returns null when no delay data is available', () => { expect(fmtDelay(null)).toBeNull() })
})

describe('normalizeSkylinkPosition', () => {
  // Field names confirmed against a live /adsb/aircraft response (see the
  // git history on this file) — flat lat/lon, ground_speed, track; response
  // wrapped in { aircraft: [...] }.
  it('formats the first matching aircraft the same way as AeroDataBox position', () => {
    const p = normalizeSkylinkPosition({ aircraft: [{ latitude: 3.1, longitude: 101.6, altitude: 35000, ground_speed: 420, track: 45 }] })
    expect(p).toEqual({ latLon: '3.1, 101.6', alt: 'FL350', speed: '420kt', heading: '045°' })
  })
  it('returns null when no aircraft matched', () => {
    expect(normalizeSkylinkPosition({ aircraft: [] })).toBeNull()
    expect(normalizeSkylinkPosition(null)).toBeNull()
    expect(normalizeSkylinkPosition({})).toBeNull()
  })
})
