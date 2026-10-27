// What goes into a saved briefing's PDF — pure (no React, no jsPDF; vitest runs in node).
// `pdfSections` lists what this briefing can export (the picker's rows), `buildPdfModel` turns the
// saved briefing plus the picker's choices into the plain data services/briefingPdfRender.js draws.
//
// input     = { route, data, name, savedAt, mapSnapshot, duty: { log, sector } | null }
// selection = { sections: Set<id>, notams: Set<icao> }   ids: map flight duty crew weather sigmet notam
// The sections are listed in the order the PDF draws them.

import { lookupAirport } from '../data/airports'
import { getMetarFlightCat } from './metarSeverity'
import { reviveSigmets, fmtHazard, fmtSigmetAlt, fmtSigmetTime } from './sigmet'
import { formatHHMM } from '../modules/dutylog/utils/formatHHMM'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = n => String(n).padStart(2, '0')

// Same order BriefingView's NOTAM cards use: what a pilot scans for first.
const NOTAM_PRIORITY = { AERODROME: 0, OBSTACLE: 1, NAVAID: 2 }

export const activeNotams = notams =>
  (notams || []).filter(n => n.validity?.status === 'ACTIVE')
    .sort((a, b) => (NOTAM_PRIORITY[a.category] ?? 99) - (NOTAM_PRIORITY[b.category] ?? 99))

/** Airports first, then route FIRs, each with its active NOTAMs. */
export function notamLocations(data) {
  const by = data?.notamsByIcao || {}
  return [
    ...(data?.airports || []).map(a => ({ icao: a.icao, kind: 'airport', role: a.label, name: lookupAirport(a.icao)?.name ?? '' })),
    ...(data?.firsUsed || []).map(f => ({ icao: f.icao, kind: 'fir', role: null, name: f.name ?? '' })),
  ].map(l => ({ ...l, notams: activeNotams(by[l.icao]) }))
}

export const crewList = log => (log?.crew || []).filter(c => c.name?.trim() || c.position?.trim())

const sectorAircraft = (log, sector) => (log.aircraft || []).find(a => a.id === sector.aircraftId) ?? (log.aircraft || [])[0] ?? {}

// "27 Oct 2026 06:57 UTC"
export function fmtGenerated(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

const fmtLogDate = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '')
  return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : (s || '')
}

// Minutes between two HH:MM / HHMM times, rolling past midnight. '' when either is missing.
function blockTime(off, on) {
  const t = s => { const d = String(s ?? '').replace(/\D/g, ''); return d.length === 4 ? +d.slice(0, 2) * 60 + +d.slice(2) : null }
  const a = t(off), b = t(on)
  if (a == null || b == null) return ''
  const m = (b - a + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function dutyModel({ log, sector }) {
  const ac = sectorAircraft(log, sector)
  return {
    fltNo: sector.fltNo, date: fmtLogDate(log.date), aircraft: [ac.reg, ac.type].filter(Boolean).join('  '),
    from: sector.from, dest: sector.dest,
    offBlk: formatHHMM(sector.offBlk), takeoff: formatHHMM(sector.takeoff), ldg: formatHHMM(sector.ldg), onBlk: formatHHMM(sector.onBlk),
    fuelOff: sector.fuelOff, fuelOn: sector.fuelOn, pax: sector.pax, block: blockTime(sector.offBlk, sector.onBlk),
    remark: sector.remark,
  }
}

const weatherItem = a => ({
  icao: a.icao, role: a.label, name: lookupAirport(a.icao)?.name ?? '',
  cat: getMetarFlightCat(a.metar?.[0]), metar: a.metar?.[0]?.rawOb ?? null, taf: a.taf?.[0]?.rawTAF ?? null,
})

// Mirrors SigmetCard's own wording.
function sigmetItem(s, now) {
  const alt = [s.base, s.top].filter(v => v != null).map(fmtSigmetAlt)
  const altText = alt.length === 2 ? alt.join(' – ') : alt.length === 1 ? `to ${alt[0]}` : null
  const move = [s.dir && s.spd ? `moving ${s.dir} at ${s.spd} kt` : null, s.chng || null]
  return {
    hazard: s.hazard,
    title: fmtHazard(s.hazard).toUpperCase() + (s.qualifier ? ` · ${s.qualifier}` : ''),
    fir: s.firName || s.firId || '',
    time: s.validFrom || s.validTo ? `${fmtSigmetTime(s.validFrom) ?? ''} – ${fmtSigmetTime(s.validTo) ?? ''}` : '',
    line: [altText, ...move].filter(Boolean).join(' · '),
    raw: s.raw || '',
    expired: !!(s.validTo && s.validTo.getTime() < now),
  }
}

/** The picker's rows: only what this briefing has. `notam` carries one child per location. */
export function pdfSections({ route, data, mapSnapshot, duty }) {
  const out = []
  if (mapSnapshot) out.push({ id: 'map', label: 'Route map' })
  if (route?.flightDetails) out.push({ id: 'flight', label: 'Flight details', hint: 'from OFP' })
  if (duty) {
    out.push({ id: 'duty', label: 'Duty log', hint: `${duty.sector.fltNo || 'sector'} · ${duty.sector.from || '?'} to ${duty.sector.dest || '?'}` })
    const n = crewList(duty.log).length
    if (n) out.push({ id: 'crew', label: 'Crew', hint: `${n} listed` })
  }
  if (data?.airports?.length) out.push({ id: 'weather', label: 'METAR / TAF', hint: `${data.airports.length} airports` })
  const sigmets = data?.sigmets?.length ?? 0
  if (sigmets) out.push({ id: 'sigmet', label: 'SIGMETs', hint: `${sigmets} active` })
  const locs = notamLocations(data)
  if (locs.length) {
    out.push({
      id: 'notam', label: 'NOTAMs', hint: `${locs.reduce((n, l) => n + l.notams.length, 0)} active`,
      children: locs.map(l => ({ id: l.icao, label: l.kind === 'fir' ? `${l.icao} FIR` : l.icao, count: l.notams.length })),
    })
  }
  return out
}

/** Everything ticked. */
export const defaultSelection = sections => ({
  sections: new Set(sections.map(s => s.id)),
  notams: new Set(sections.find(s => s.id === 'notam')?.children.map(c => c.id) ?? []),
})

export function buildPdfModel(input, selection, now = Date.now()) {
  const { route, data, name, savedAt, mapSnapshot, duty } = input
  const has = id => selection.sections.has(id)
  const avail = new Set(pdfSections(input).map(s => s.id))
  const on = id => avail.has(id) && has(id)

  const locs = on('notam') ? notamLocations(data).filter(l => selection.notams.has(l.icao)) : []
  const airports = data?.airports || []
  return {
    withLog: on('duty') || on('crew'),
    name, dep: route?.dep, arr: route?.arr,
    generated: fmtGenerated(data?.fetchedAt || savedAt),
    map: on('map') ? mapSnapshot : null,
    flight: on('flight') ? route.flightDetails : null,
    duty: on('duty') ? dutyModel(duty) : null,
    crew: on('crew') ? crewList(duty.log).map(c => ({ name: c.name?.trim() ?? '', position: c.position?.trim() ?? '' })) : null,
    weather: on('weather') ? {
      depArr: airports.filter(a => a.label === 'DEPARTURE' || a.label === 'ARRIVAL').map(weatherItem),
      destAlt: airports.filter(a => a.label.startsWith('DESTINATION ALTERNATE')).map(weatherItem),
      era: airports.filter(a => a.label.startsWith('ENROUTE ALTERNATE')).map(weatherItem),
    } : null,
    sigmets: on('sigmet') ? reviveSigmets(data.sigmets).map(s => sigmetItem(s, now)) : null,
    notams: locs.length ? {
      total: locs.reduce((n, l) => n + l.notams.length, 0),
      airports: locs.filter(l => l.kind === 'airport'),
      firs: locs.filter(l => l.kind === 'fir'),
    } : null,
  }
}

/** "YMML → WADD · 27 Oct 06:57" -> "YMML - WADD · 27 Oct 06-57.pdf" (no characters a file name can't hold). */
export const pdfFileName = name => `${String(name || 'briefing').replace(/→/g, '-').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim()}.pdf`
