import { describe, it, expect } from 'vitest'
import { fmtTrack, fmtLocalTime, fmtDelay, statusColorFor, normalizeFlightStatus } from './traffic'

// Shape confirmed against AeroDataBox's /flights/number/{flight}/{date}
// response (RapidAPI console + production, OD122, 11 Jul 2026) — explicit
// status enum and datetimes (utc+local) per leg, used over SkyLink's
// flight_status endpoint, which has no date parameter and was observed
// returning a stale (weeks-old) record for a live flight. NOTE: the real API
// separates date/time with a space ("2026-07-11 06:55Z"), not the "T" the
// OpenAPI docs example shows — this fixture uses the real format so a
// regression here fails the test instead of only showing up in production.
const RAW_STATUS = {
  number: 'OD122', status: 'Delayed', airline: { name: 'Batik Air', iata: 'OD', icao: 'BTK' },
  departure: {
    airport: { iata: 'SYD', icao: 'YSSY', name: 'Sydney' },
    scheduledTime: { utc: '2026-07-05 22:35Z', local: '2026-07-06 08:35+10:00' },
    revisedTime: { utc: '2026-07-06 01:00Z', local: '2026-07-06 11:00+10:00' },
    terminal: '1', gate: '26',
  },
  arrival: {
    airport: { iata: 'KUL', icao: 'WMKK', name: 'Kuala Lumpur' },
    scheduledTime: { utc: '2026-07-06 07:40Z', local: '2026-07-06 15:40+08:00' },
    terminal: '1', gate: 'C22',
  },
}

describe('normalizeFlightStatus', () => {
  it('returns null when there is no matching flight', () => {
    expect(normalizeFlightStatus(null)).toBeNull()
  })
  it('maps status, route, times, and delay from ISO datetimes', () => {
    const s = normalizeFlightStatus(RAW_STATUS)
    expect(s.flight).toBe('OD122')
    expect(s.airline).toBe('Batik Air')
    expect(s.route).toBe('SYD → KUL')
    expect(s.status).toBe('DELAYED')
    expect(s.statusColor).toBe('var(--cp-orange)')
    expect(s.schedDep).toBe('08:35 · 06 Jul')
    expect(s.schedArr).toBe('15:40 · 06 Jul')
    expect(s.estArr).toBeNull() // no arrival.revisedTime in this fixture
    expect(s.delayMinutes).toBe(145) // 22:35Z -> 01:00Z departure, actual UTC diff
    expect(s.depTerminal).toBe('1')
    expect(s.depGate).toBe('26')
    expect(s.arrTerminal).toBe('1')
    expect(s.arrGate).toBe('C22')
  })
  it('also accepts the OpenAPI-documented "T" separator, not just the real space-separated one', () => {
    const s = normalizeFlightStatus({
      number: 'MH3', status: 'Scheduled',
      departure: { scheduledTime: { local: '2026-07-06T08:35:00+10:00' } },
    })
    expect(s.schedDep).toBe('08:35 · 06 Jul')
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

describe('fmtLocalTime', () => {
  it('combines time and date', () => { expect(fmtLocalTime('08:35', '06 Jul')).toBe('08:35 · 06 Jul') })
  it('shows time alone when there is no date', () => { expect(fmtLocalTime('08:35', '')).toBe('08:35') })
  it('treats the "--:--" placeholder as no data', () => { expect(fmtLocalTime('--:--', '')).toBeNull() })
  it('returns null when there is no time', () => { expect(fmtLocalTime(null, '06 Jul')).toBeNull() })
})

describe('fmtDelay', () => {
  it('reports on time', () => { expect(fmtDelay(0)).toBe('On time') })
  it('reports a sub-hour delay in minutes', () => { expect(fmtDelay(27)).toBe('+27 min') })
  it('reports a multi-hour delay as h/m', () => { expect(fmtDelay(145)).toBe('+2h25m') })
  it('reports an early arrival', () => { expect(fmtDelay(-5)).toBe('5 min early') })
  it('returns null when no delay data is available', () => { expect(fmtDelay(null)).toBeNull() })
})
