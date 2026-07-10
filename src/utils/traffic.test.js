import { describe, it, expect } from 'vitest'
import {
  fmtAlt, fmtVs, fmtPinged, fmtDistBrg, fmtLocalTime, fmtDelay, fmtWakeCategory, statusColorFor,
  normalizeAircraft, normalizeFlightStatus, normalizeAircraftLookup, normalizeAirline, normalizeAircraftPerformance,
} from './traffic'

// Shape confirmed against a live /adsb/aircraft response (see the comment on
// normalizeAircraft) — flat lat/lon, is_on_ground, no origin/destination.
const RAW_AIRCRAFT = {
  icao24: '750a01', callsign: 'MAS123 ', registration: '9M-MTA', aircraft_type: 'B738',
  latitude: 3.1, longitude: 101.6, altitude: 35000, ground_speed: 450, track: 90,
  vertical_rate: 0, squawk: '2000', is_on_ground: false, airline: 'Malaysia Airlines',
}

// Shape confirmed against a live /flight_status/:flight_number response
// (RapidAPI console, OD122, 10 Jul 2026) — free-text status, single airline
// name, nested departure/arrival legs with split date+time strings.
const RAW_STATUS = {
  flight_number: 'OD122', status: 'Estimated 11:00', airline: 'Batik Air',
  departure: {
    airport: 'SYD • Sydney', scheduled_time: '08:35', scheduled_date: '06 Jul',
    actual_time: '11:00', actual_date: '06 Jul', terminal: '1', gate: '26',
  },
  arrival: {
    airport: 'KUL • Kuala Lumpur', scheduled_time: '15:40', scheduled_date: '06 Jul',
    estimated_time: '--:--', estimated_date: '', terminal: '1', gate: 'C22',
  },
}

describe('normalizeAircraft', () => {
  it('maps the live-API field names', () => {
    expect(normalizeAircraft(RAW_AIRCRAFT)).toEqual({
      icao24: '750a01', callsign: 'MAS123', registration: '9M-MTA', aircraft_type: 'B738',
      lat: 3.1, lon: 101.6, altitude_ft: 35000, ground_speed_kts: 450, track: 90,
      vertical_rate: 0, squawk: '2000', on_ground: false,
      origin: null, destination: null, airline: 'Malaysia Airlines', pingedAt: null,
    })
  })
  it('falls back sanely on missing fields', () => {
    const a = normalizeAircraft({ icao24: 'abc123' })
    expect(a.registration).toBe('—')
    expect(a.squawk).toBe('----')
    expect(a.altitude_ft).toBe(0)
    expect(a.on_ground).toBe(false)
    expect(a.callsign).toBe('abc123')
  })
})

describe('normalizeFlightStatus', () => {
  it('returns null when there is no matching flight', () => {
    expect(normalizeFlightStatus(null)).toBeNull()
  })
  it('maps status, route, times, and a same-day derived delay', () => {
    const s = normalizeFlightStatus(RAW_STATUS)
    expect(s.flight).toBe('OD122')
    expect(s.airline).toBe('Batik Air')
    expect(s.route).toBe('SYD → KUL')
    expect(s.status).toBe('ESTIMATED 11:00')
    expect(s.statusColor).toBe('var(--cp-orange)')
    expect(s.schedDep).toBe('08:35 · 06 Jul')
    expect(s.schedArr).toBe('15:40 · 06 Jul')
    expect(s.estArr).toBeNull() // arrival estimated_time is the "--:--" placeholder
    expect(s.delayMinutes).toBe(145) // 08:35 -> 11:00 actual departure, same date
  })
  it('leaves route/delay unset when the raw fields are missing', () => {
    const s = normalizeFlightStatus({ flight_number: 'MH1', status: 'Scheduled' })
    expect(s.route).toBeNull()
    expect(s.delayMinutes).toBeNull()
    expect(s.statusColor).toBe('var(--cp-acc2)')
  })
  it('does not guess a delay across a date rollover', () => {
    const s = normalizeFlightStatus({
      flight_number: 'MH2', status: 'Departed',
      departure: { scheduled_time: '23:50', scheduled_date: '09 Jul', actual_time: '00:10', actual_date: '10 Jul' },
    })
    expect(s.delayMinutes).toBeNull()
  })
})

// Shape confirmed against a live /aircraft/registration/:reg response and the
// API's own official example schema (RapidAPI console, G-STBC) — wrapped in
// { query, found, aircraft: {...} }, not flat.
const RAW_LOOKUP = {
  query: 'G-STBC', found: true,
  aircraft: {
    registration: 'G-STBC', icao24: '40621d', icao_type: 'B77W',
    type_name: '777-36N', manufacturer: 'Boeing', manufacturer_and_model: 'Boeing 777-36N',
    owner_operator: 'British Airways', airline_code: 'BAW',
    is_private_operator: false, serial_number: '38695', year_built: '2013',
    photos: [{ image: 'https://image.airport-data.com/aircraft/001912010.jpg', link: 'https://airport-data.com/aircraft/photo/001912010.html', photographer: 'Roberto Cassar' }],
  },
}

// Shape confirmed against a live /airlines/search response (icao=BAW).
const RAW_AIRLINE = [{
  id: 1355, name: 'British Airways', iata: 'BA', icao: 'BAW',
  callsign: 'SPEEDBIRD', country: 'United Kingdom', active: 'Y',
  logo: 'https://media.skylinkapi.com/logos/BA.png',
}]

// Shape confirmed against a live /aircraft/performance/:icao_type response.
const RAW_PERFORMANCE = {
  icao_type: 'B77W', name: 'BOEING 777-300ER', engine_type: 'Jet', engine_code: 'L2J',
  wake_category: 'H', cruise_speed_ktas: 490, service_ceiling_ft: 43000,
  max_range_nm: 7370, wing_span_m: 64.8, length_m: 73.9, mtow_t: 351.5, max_passengers: 396,
}

describe('normalizeAircraftLookup', () => {
  it('unwraps the aircraft object and maps real field names', () => {
    expect(normalizeAircraftLookup(RAW_LOOKUP)).toEqual({
      registration: 'G-STBC', icao24: '40621d', icao_type: 'B77W', type_name: '777-36N',
      manufacturer: 'Boeing', operator: 'British Airways', operator_icao: 'BAW',
      serial_number: '38695', year_manufactured: '2013',
      photos: RAW_LOOKUP.aircraft.photos,
    })
  })
  it('returns null when the aircraft was not found', () => {
    expect(normalizeAircraftLookup({ query: 'ZZZZZ', found: false })).toBeNull()
  })
  it('returns null for a missing/malformed response', () => {
    expect(normalizeAircraftLookup(null)).toBeNull()
    expect(normalizeAircraftLookup({})).toBeNull()
  })
})

describe('normalizeAirline', () => {
  it('maps the first match', () => {
    expect(normalizeAirline(RAW_AIRLINE)).toEqual({
      name: 'British Airways', iata: 'BA', icao: 'BAW',
      callsign: 'SPEEDBIRD', country: 'United Kingdom', logo: 'https://media.skylinkapi.com/logos/BA.png',
    })
  })
  it('returns null for an empty result set', () => {
    expect(normalizeAirline([])).toBeNull()
    expect(normalizeAirline(null)).toBeNull()
  })
})

describe('normalizeAircraftPerformance', () => {
  it('maps the real field names', () => {
    expect(normalizeAircraftPerformance(RAW_PERFORMANCE)).toEqual({
      engineType: 'Jet', engineCode: 'L2J', wakeCategory: 'H',
      cruiseSpeedKt: 490, serviceCeilingFt: 43000, maxRangeNm: 7370,
      wingSpanM: 64.8, lengthM: 73.9, mtowT: 351.5,
    })
  })
  it('returns null when the type code is unknown', () => {
    expect(normalizeAircraftPerformance(null)).toBeNull()
    expect(normalizeAircraftPerformance({})).toBeNull()
  })
})

describe('statusColorFor', () => {
  it('flags cancelled red', () => { expect(statusColorFor('Cancelled')).toBe('var(--cp-red)') })
  it('flags landed dim', () => { expect(statusColorFor('Landed 14:32')).toBe('var(--cp-dim)') })
  it('flags estimated/delayed orange', () => { expect(statusColorFor('Estimated 11:00')).toBe('var(--cp-orange)') })
  it('flags scheduled with the secondary accent', () => { expect(statusColorFor('Scheduled')).toBe('var(--cp-acc2)') })
  it('falls back to dim for unrecognized text', () => { expect(statusColorFor('')).toBe('var(--cp-dim)') })
})

describe('fmtAlt', () => {
  it('shows flight levels above 18000 ft', () => { expect(fmtAlt(35000)).toBe('FL350') })
  it('shows feet below 18000 ft', () => { expect(fmtAlt(1200)).toBe('1,200 ft') })
})

describe('fmtVs', () => {
  it('flags climbing', () => { expect(fmtVs(800)).toBe('↑ 800 fpm') })
  it('flags descending', () => { expect(fmtVs(-800)).toBe('↓ 800 fpm') })
  it('treats small rates as level', () => { expect(fmtVs(50)).toBe('level') })
})

describe('fmtPinged', () => {
  it('reports never pinged', () => { expect(fmtPinged(null, Date.now())).toBe('Not pinged yet') })
  it('reports elapsed seconds', () => { expect(fmtPinged(1000, 6000)).toBe('Pinged 5s ago') })
})

describe('fmtDistBrg', () => {
  it('handles missing geometry', () => { expect(fmtDistBrg(null, null)).toBe('—') })
  it('formats distance and bearing', () => { expect(fmtDistBrg(42.4, 7)).toBe('42 NM · 007°') })
})

describe('fmtLocalTime', () => {
  it('combines time and date', () => { expect(fmtLocalTime('08:35', '06 Jul')).toBe('08:35 · 06 Jul') })
  it('shows time alone when there is no date', () => { expect(fmtLocalTime('08:35', '')).toBe('08:35') })
  it('treats the "--:--" placeholder as no data', () => { expect(fmtLocalTime('--:--', '')).toBeNull() })
  it('returns null when there is no time', () => { expect(fmtLocalTime(null, '06 Jul')).toBeNull() })
})

describe('fmtWakeCategory', () => {
  it('expands known codes', () => {
    expect(fmtWakeCategory('H')).toBe('Heavy')
    expect(fmtWakeCategory('M')).toBe('Medium')
    expect(fmtWakeCategory('L')).toBe('Light')
    expect(fmtWakeCategory('J')).toBe('Super')
  })
  it('falls back to the raw code for anything unrecognized', () => { expect(fmtWakeCategory('X')).toBe('X') })
  it('returns null for missing input', () => { expect(fmtWakeCategory(null)).toBeNull() })
})

describe('fmtDelay', () => {
  it('reports on time', () => { expect(fmtDelay(0)).toBe('On time') })
  it('reports a sub-hour delay in minutes', () => { expect(fmtDelay(27)).toBe('+27 min') })
  it('reports a multi-hour delay as h/m', () => { expect(fmtDelay(145)).toBe('+2h25m') })
  it('reports an early arrival', () => { expect(fmtDelay(-5)).toBe('5 min early') })
  it('returns null when no delay data is available', () => { expect(fmtDelay(null)).toBeNull() })
})
