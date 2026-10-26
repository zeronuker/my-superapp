// Pure readers for the Flight Details tab (no React/DOM — vitest runs in node).
// Same two formats as ofpParse.js: the XmlOFP (ARINC 633 XML) and the PFP PDF's
// text lines. Both return the same shape, and every value may be null when
// that format does not print it (MORA and take-off/EDTO status are PDF-only;
// pax and cargo are PDF-only; the commercial flight number is XML-only).
//
// details = { commercialNo, routeNo, costIndex, gcdNm,
//   fuel:    { trip, contingency, alternate: {icao, kg, min}, finalReserve, tankering,
//              extra, takeoff, taxi, block, minDiversion, arrival }   // {kg, min}; arrival is kg
//   weights: { dow, payload, pax, cargo, zfw, tow, ldw }              // zfw/tow/ldw {kg, max}
//   alternates: [{ icao, route, distNm, fl, wc, min, fuel, mora }],
//   takeoffAlt, edto, remarks: { occ, melCdl, notes: [{n, text}], notam } }

const mins = (h, m) => +h * 60 + +m
// A section this OFP does not print (or prints differently) is null/empty, never an error: the
// flight itself must still import.
const safely = (fn, fallback = null) => { try { return fn() ?? fallback } catch (_) { return fallback } }
const onlyIfFound = w => (w && (w.zfw || w.tow || w.ldw) ? w : null)
const hm = s => { const m = /(\d{1,2}):(\d{2})/.exec(s ?? ''); return m ? mins(m[1], m[2]) : null }
const line = (text, re) => re.exec(text)?.[1]?.trim() || null

// ── Fuel pieces both formats share ────────────────────────────────────────────
// Block fuel is take-off fuel plus taxi (the PDFs leave BLOCK FUEL blank). Whatever the named
// lines do not cover (company, EDTO, mandatory tanker fuel…) is shown as "extra" so the parts
// always add up to the take-off fuel. Minimum diversion fuel is the alternate plus final reserve.
function finishFuel(f) {
  const named = [f.trip, f.contingency, f.alternate, f.finalReserve, f.tankering].filter(Boolean)
  const sum = k => named.reduce((t, x) => t + (x[k] ?? 0), 0)
  const extraKg = f.takeoff.kg - sum('kg')
  return {
    ...f,
    extra: extraKg > 0 ? { kg: extraKg, min: Math.max(0, (f.takeoff.min ?? 0) - sum('min')) } : null,
    block: { kg: f.takeoff.kg + f.taxi.kg, min: (f.takeoff.min ?? 0) + (f.taxi.min ?? 0) },
    minDiversion: { kg: f.alternate.kg + f.finalReserve.kg, min: (f.alternate.min ?? 0) + (f.finalReserve.min ?? 0) },
  }
}

// ── XmlOFP ────────────────────────────────────────────────────────────────────
const block = (text, tag) => new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(text)?.[1] ?? null
const kgIn = s => { const m = /<Value unit="kg">([\d.]+)</.exec(s ?? ''); return m ? Math.round(+m[1]) : null }
const minIn = s => { const m = /<Value>PT(\d+)H(\d+)M</.exec(s ?? ''); return m ? mins(m[1], m[2]) : null }
const kgMin = s => (s ? { kg: kgIn(s), min: minIn(s) } : null)

function xmlAlternateFuels(text) {
  return [...text.matchAll(/<AlternateFuel>([\s\S]*?)<\/AlternateFuel>/g)].map(m => ({
    icao: line(m[1], /<AirportICAOCode>(\w{4})</),
    ...kgMin(m[1]),
    finalReserve: kgMin(block(m[1], 'FinalReserve')),
  }))
}

function xmlFuel(text) {
  const [alt1] = xmlAlternateFuels(text)
  const tank = /<ExtraFuel reason="EconomicTankering">([\s\S]*?)<\/ExtraFuel>/.exec(text)?.[1]
  const contingency = kgMin(block(text, 'ContingencyFuel'))
  const arrivalKg = kgIn(block(text, 'ArrivalFuel'))
  const fuel = finishFuel({
    trip: kgMin(block(text, 'TripFuel')),
    contingency,
    alternate: { icao: alt1.icao, kg: alt1.kg, min: alt1.min },
    finalReserve: alt1.finalReserve,
    tankering: tank ? kgMin(tank) : null,
    takeoff: kgMin(block(text, 'TakeOffFuel')),
    taxi: kgMin(block(text, 'TaxiFuel')),
  })
  // ArrivalFuel counts the contingency as unburned; the PDF's LDW FUEL does not. Show the PDF's.
  return { ...fuel, arrival: arrivalKg != null ? arrivalKg - contingency.kg : null }
}

function xmlWeights(text) {
  const w = tag => {
    const b = block(text, tag)
    return b ? { kg: kgIn(block(b, 'EstimatedWeight')), max: kgIn(block(b, 'OperationalLimit')) } : null
  }
  return {
    dow: kgIn(block(text, 'DryOperatingWeight')),
    payload: kgIn(block(text, 'Load')),
    pax: null, cargo: null,
    zfw: w('ZeroFuelWeight'), tow: w('TakeoffWeight'), ldw: w('LandingWeight'),
  }
}

function xmlAlternates(text) {
  const fuels = new Map(xmlAlternateFuels(text).map(a => [a.icao, a]))
  return [...(text.split('<AlternateRoutes>')[1] ?? '').matchAll(/<AlternateRoute>([\s\S]*?)<\/AlternateRoute>/g)].map(m => {
    const info = block(m[1], 'RouteInformation') ?? ''
    const icao = line(m[1], /<Airport [^>]*>\s*<AirportICAOCode>(\w{4})</)
    const fl = line(info, /<InitialAltitude>\s*<Value[^>]*>(\d+)</)
    const wc = line(info, /<AverageWindComponent>\s*<Value[^>]*>(-?\d+)</)
    return {
      icao,
      route: line(info, /<RouteDescription>([^<]*)</),
      distNm: Math.round(+line(info, /<GroundDistance>\s*<Value[^>]*>([\d.]+)</)) || null,
      fl: fl ? +fl : null,
      wc: wc != null ? +wc : null,
      min: fuels.get(icao)?.min ?? null,
      fuel: fuels.get(icao)?.kg ?? null,
      mora: null,
    }
  }).filter(a => a.icao)
}

// ── PFP (PDF text) ────────────────────────────────────────────────────────────
const pair = (text, re) => { const m = re.exec(text); return m ? { kg: +m[1], min: hm(m[2]) } : null }
const num = (text, re) => { const m = re.exec(text); return m ? +m[1] : null }

function pdfFuel(text) {
  const alt = /\bALTN\s+1\s+([A-Z]{4})\s+(\d+)\s+(\d{1,2}:\d{2})/.exec(text)
  const fuel = finishFuel({
    trip: pair(text, /\bTRIP\s+(\d+)\s+(\d{1,2}:\d{2})/),
    contingency: pair(text, /\bCONT\s+FUEL\s+(\d+)\s+(\d{1,2}:\d{2})/),
    alternate: { icao: alt?.[1] ?? null, kg: +alt?.[2], min: hm(alt?.[3]) },
    finalReserve: pair(text, /\bFINAL\s+RES\s+(\d+)\s+(\d{1,2}:\d{2})/),
    tankering: pair(text, /\bECO\s+TANKERING\s+(\d+)\s+(\d{1,2}:\d{2})/),
    takeoff: pair(text, /\bEST\s+T\/OFF\s+FUEL\s+(\d+)\s+(\d{1,2}:\d{2})/),
    taxi: pair(text, /\bTAXI\s+(\d+)\s+(\d{1,2}:\d{2})/),
  })
  return { ...fuel, arrival: num(text, /\bLDW\s+FUEL\s+(\d+)/) }
}

function pdfWeights(text) {
  const w = label => {
    const m = new RegExp(`\\b${label}\\s+(\\d+)\\s+(\\d+)`).exec(text)
    return m ? { kg: +m[1], max: +m[2] } : null
  }
  return {
    dow: num(text, /\bDOW\s+(\d+)/), payload: num(text, /\bPAYLOAD\s+(\d+)/),
    pax: num(text, /\bPAX\s+(\d+)/), cargo: num(text, /\bCARGO\s+(\d+)/),
    zfw: w('ZFW'), tow: w('TOW'), ldw: w('LDW'),
  }
}

// ALTN1: UZFN / RTE: UZTT TISIB2A … UZFN / ALT DIST: 0190 ALT FL: 290 W/C: P029 FUEL/TIME: 001371/00:33 MORA: 13300
function pdfAlternates(text) {
  const re = /ALTN\s*\d:\s*([A-Z]{4})\s+RTE:\s*([^\n]*)\n\s*ALT\s+DIST:\s*(\d+)\s+ALT\s+FL:\s*(\d+)\s+W\/C:\s*([PM])(\d+)\s+FUEL\/TIME:\s*(\d+)\/(\d{1,2}:\d{2})\s+MORA:\s*(\d+)/g
  return [...text.matchAll(re)].map(m => ({
    icao: m[1], route: m[2].trim(), distNm: +m[3], fl: +m[4],
    wc: (m[5] === 'M' ? -1 : 1) * +m[6], fuel: +m[7], min: hm(m[8]), mora: +m[9],
  }))
}

// ── Shared: remarks and route facts printed the same way in both ──────────────
function remarks(text) {
  const occ = line(text, /OCC\s+CONTACT[ \t]*:[ \t]*([^\n\r<]*)/)
  return {
    occ: occ ? occ.split('/').map(s => s.trim()).filter(Boolean) : [],
    melCdl: line(text, /MEL\/CDL[ \t]*:[ \t]*([^\n\r<]*)/),
    notes: [...text.matchAll(/\bNOTE[ \t]+(\d+)[ \t]*:[ \t]*([^\n\r<]*)/g)].map(m => ({ n: +m[1], text: m[2].trim() })),
    notam: line(text, /\bNOTAM[ \t]*:[ \t]*([^\n\r<]*)/),
  }
}

// The route as the OFP prints it (with runways, SIDs and STARs), minus the level-step list after it.
const tidy = s => s?.replace(/\s+/g, ' ').trim() || null

export function xmlDetails(text) {
  const route = tidy(/<RouteDescription>([^<]*?)(?:\r?\n|<)/.exec(text)?.[1])
  return {
    ...(route && { route }),
    commercialNo: line(text, /<CommercialFlightNumber>([^<]*)</),
    routeNo: line(text, /<RouteInformation[^>]*routeName="R?(\d+)"/),
    costIndex: line(text, /<CostIndex>\s*<Value>(\d+)</),
    gcdNm: Math.round(+line(text, /<GreatCircleDistance>\s*(?:<[^>]*>\s*)*([\d.]+)/)) || null,
    fuel: safely(() => xmlFuel(text)),
    weights: onlyIfFound(safely(() => xmlWeights(text))),
    alternates: safely(() => xmlAlternates(text), []),
    takeoffAlt: null, edto: null,
    remarks: remarks(text),
  }
}

export function pdfDetails(text) {
  const route = tidy(/PLAN VALID UNTIL[^\n]*\n([\s\S]*?)\n[A-Z0-9]{2,5}\/\s?FL\d{3}\[/.exec(text)?.[1])
  return {
    ...(route && { route }),
    commercialNo: null,
    routeNo: line(text, /\bRTE\s?(\d+)\b/),
    costIndex: line(text, /\bCRZ\/CI(\d+)/),
    gcdNm: num(text, /\bGCD\s*:\s*(\d+)/),
    fuel: safely(() => pdfFuel(text)),
    weights: onlyIfFound(safely(() => pdfWeights(text))),
    alternates: safely(() => pdfAlternates(text), []),
    takeoffAlt: line(text, /TAKEOFF\s+ALTN\s*:\s*([^|\n]*)/),
    edto: line(text, /EDTO\/ETP\s+ALTN\s*:\s*([^|\n]*)/),
    remarks: remarks(text),
  }
}
