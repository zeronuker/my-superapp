// Order of the "From CVR" list when it is opened to add an OFP to a saved briefing. Pure — no React, no stores.
// A CVR label reads "OD1703 TWU-BKI 07-Nov-2026 · OFP 3": flight, IATA route, date. The rows most likely to be
// the briefing's flight come first (same dep/arr and same date, then same dep/arr), each group newest flight first.
import IATA from '../data/iata.json'

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }

// The label's airports (as ICAO, null when the IATA code is unknown) and its date as 'YYYY-MM-DD'.
export function parseCvrLabel(label) {
  const r = /\b([A-Z]{3})-([A-Z]{3})\b/.exec(label || '')
  const d = /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/.exec(label || '')
  const mon = d && MONTHS[d[2].toUpperCase()]
  return {
    dep: r ? IATA[r[1]] ?? null : null,
    arr: r ? IATA[r[2]] ?? null : null,
    ymd: mon ? `${d[3]}-${String(mon).padStart(2, '0')}-${d[1]}` : '',
  }
}

const ymdIn = (ms, tz) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms) } catch (_) { return null }
}

// The dates a briefing's flight can carry on the CVR roster: its flight date (the OFP's STD, else the day it was
// saved) as the UTC date and as the departure airport's local date (the roster may use either).
export function briefingDates(save, depTz) {
  const std = Date.parse(save?.route?.flightDetails?.info?.std)
  const ms = Number.isFinite(std) ? std : save?.savedAt
  if (!Number.isFinite(ms)) return []
  return [...new Set([ymdIn(ms, 'UTC'), depTz && ymdIn(ms, depTz)].filter(Boolean))]
}

// `prefer` = { dep, arr, dates: ['YYYY-MM-DD', ...] }. Returns a new array.
export function rankCvr(items, prefer) {
  const tier = (p) => (p.dep === prefer.dep && p.arr === prefer.arr ? (prefer.dates.includes(p.ymd) ? 0 : 1) : 2)
  return items
    .map(item => { const p = parseCvrLabel(item.label); return { item, t: tier(p), ymd: p.ymd } })
    .sort((a, b) => a.t - b.t || (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0) || b.item.sentAt - a.item.sentAt)
    .map(x => x.item)
}
