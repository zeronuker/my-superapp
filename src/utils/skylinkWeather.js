// Adapts SkyLink's raw METAR/TAF responses into the same shape
// aviationweather.gov's API already returns, so decodeMetar/decodeTaf,
// getMetarFlightCat, getWindSev, and the rest of the METAR/TAF tab's
// rendering code work unchanged regardless of which source supplied the
// data — no changes needed anywhere else in the tab.
//
// getMetarFlightCat expects `visib` in STATUTE MILES (it converts to metres
// internally — see the comment on metarSeverity.js) even though SkyLink's
// raw text is already in ICAO metres, so this deliberately converts
// metres → SM here to match that existing contract exactly, rather than
// touching the shared, already-tested flight-category logic.
// Header is always "[METAR|SPECI] [AUTO|COR] ICAO DDHHMMZ ..." — stripped
// positionally rather than by content pattern, since a real weather group
// (e.g. "TSRA") is also 4 letters and must not be mistaken for the ICAO id.
function stripMetarHeader(toks) {
  let i = 0
  while (i < toks.length && /^(METAR|SPECI|AUTO|COR)$/.test(toks[i])) i++
  if (i < toks.length && /^[A-Z]{4}$/.test(toks[i])) i++
  if (i < toks.length && /^\d{6}Z$/.test(toks[i])) i++
  return toks.slice(i)
}

function parseMetarStructured(rawOb) {
  const out = { wxString: '' }
  const wxToks = []
  const clouds = []
  for (const t of stripMetarHeader((rawOb || '').trim().split(/\s+/))) {
    let m
    if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      out.wdir = m[1] === 'VRB' ? 'VRB' : Number(m[1])
      out.wspd = Number(m[2])
      if (m[3]) out.wgst = Number(m[3])
      continue
    }
    if ((m = t.match(/^(M?\d{2})\/(M?\d{2})$/))) {
      out.temp = Number(m[1].replace('M', '-'))
      out.dewp = Number(m[2].replace('M', '-'))
      continue
    }
    if ((m = t.match(/^Q(\d{4})$/))) { out.altim = Number(m[1]); continue }
    if ((m = t.match(/^A(\d{4})$/))) { out.altim = Math.round(Number(m[1]) / 100 * 33.8639 * 10) / 10; continue }
    if (t === '9999') { out.visib = 10000 / 1609.34; continue }
    if (/^\d{4}$/.test(t)) { out.visib = Number(t) / 1609.34; continue }
    if ((m = t.match(/^(P|M)?(\d+)SM$/))) { out.visib = Number(m[2]); continue }
    if ((m = t.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))) { clouds.push({ cover: m[1], base: Number(m[2]) * 100 }); continue }
    if (/^(VV\d{3}|VV\/\/\/|NSC|NCD|SKC|CLR|CAVOK)$/.test(t)) continue
    if (/^\d{6}Z$/.test(t)) continue
    if (/^(METAR|SPECI|AUTO|COR|NOSIG)$/.test(t)) continue
    wxToks.push(t)
  }
  out.clouds = clouds
  out.wxString = wxToks.join(' ')
  return out
}

// SkyLink's `timestamp` is when the API served the report, not the METAR's
// own observation time (which is only encoded as a day-of-month + HHMM
// group with no month/year — too ambiguous to parse reliably, same reasoning
// as the delay/date handling in utils/traffic.js). Using the serve
// timestamp as obsTime is a close approximation for a live feed.
export function skylinkMetarToAWCShape(raw) {
  if (!raw?.raw) return null
  const obsTime = raw.timestamp ? Math.floor(new Date(raw.timestamp).getTime() / 1000) : null
  return {
    rawOb: raw.raw,
    icaoId: raw.icao,
    name: raw.airport_name || '',
    obsTime,
    ...parseMetarStructured(raw.raw),
  }
}

// TAF decoding/coloring in this app works entirely from raw text
// (decodeTaf/parseTafSegments take rawTAF directly), so no structured
// fields are needed here — just the raw text and an age timestamp.
function toDateTimeStr(isoString) {
  const d = new Date(isoString)
  return isNaN(d) ? null : d.toISOString().slice(0, 16).replace('T', ' ')
}
export function skylinkTafToAWCShape(raw) {
  if (!raw?.raw) return null
  const issueTime = toDateTimeStr(raw.timestamp)
  return { rawTAF: raw.raw, icaoId: raw.icao, issueTime, bulletinTime: issueTime }
}
