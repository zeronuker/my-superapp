import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { renderBriefingPdf } from './briefingPdfRender'
import { buildPdfModel, pdfSections, defaultSelection } from '../utils/briefingPdf'

// Smoke tests: the drawing code runs end to end for every option and yields a real PDF.
const fonts = { mono: fs.readFileSync('public/fonts/pdf/jetbrains-mono.ttf').toString('base64'), sans: fs.readFileSync('public/fonts/pdf/inter.ttf').toString('base64') }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const notam = (id, category, lines = 3) => ({ id, category, source: 'YMML', validity: { status: 'ACTIVE', startStr: '01 JAN 00:00', endStr: 'PERM' }, raw: Array.from({ length: lines }, (_, i) => `E) LINE ${i} OF ${id} → odd glyph`).join('\n') })
const input = () => ({
  name: 'YMML → WADD · 27 Oct 06:57', savedAt: Date.UTC(2026, 9, 27, 7, 0), mapSnapshot: PNG,
  route: {
    dep: 'YMML', arr: 'WADD',
    flightDetails: {
      dep: 'YMML', arr: 'WADD', flight: 'MXD178', commercialNo: 'OD178', routeNo: '11', costIndex: '029', gcdNm: 2366, depTz: 'Australia/Melbourne', arrTz: 'Asia/Makassar',
      info: { tail: '9M-LRW', type: 'B737-MAX-8/LEAP-1B27', ofpNo: '944298', std: '2026-08-30T21:00:00Z', sta: '2026-08-31T03:25:00Z', tripMin: 328, distNm: 2505 },
      route: 'YMML RWY-16 KEPPA H336 NATYA J19 BHI T25 POLEV A576 AS WADD', destAlts: ['WADL'], enrouteAlts: ['YPAD'],
      firs: [{ icao: 'YMMM', min: 0 }, { icao: 'YBBB', min: 159 }],
      fuel: { trip: { kg: 13400, min: 328 }, contingency: { kg: 670, min: 17 }, alternate: { icao: 'WADL', kg: 961, min: 23 }, finalReserve: { kg: 1050, min: 30 }, tankering: null, takeoff: { kg: 17281, min: 429 }, taxi: { kg: 200, min: 10 }, extra: null, block: { kg: 17481, min: 439 }, minDiversion: { kg: 2011, min: 53 }, arrival: 3211 },
      weights: { dow: 45562, payload: 17238, zfw: { kg: 62800, max: 65754 }, tow: { kg: 80081, max: 82190 }, ldw: { kg: 66681, max: 69308 } },
      alternates: [{ icao: 'WADL', route: 'WADD MAGIK2B MAGIK WADL', distNm: 102, fl: 150, wc: -15, min: 23, fuel: 961, mora: null }],
      remarks: { occ: ['+60376220187(OCC)'], melCdl: null, notes: [{ n: 1, text: 'W00/T9/Q1034' }], notam: null },
    },
  },
  data: {
    fetchedAt: Date.UTC(2026, 9, 27, 6, 57),
    airports: [
      { icao: 'YMML', label: 'DEPARTURE', metar: [{ rawOb: 'METAR YMML 270630Z 24007KT 9999 OVC068 14/05 Q1020' }], taf: [{ rawTAF: 'TAF YMML 270517Z 2706/2812 25012KT 9999 -SHRA SCT045 FM270900 24008KT 9999 NSW SCT040' }] },
      { icao: 'WADD', label: 'ARRIVAL', metar: [], taf: [] },
      { icao: 'WADL', label: 'DESTINATION ALTERNATE 1', metar: [{ rawOb: 'METAR WADL 270630Z 16008KT 3500 -TSRA FEW015CB BKN016' }], taf: [] },
      { icao: 'YPAD', label: 'ENROUTE ALTERNATE 1', metar: [{ rawOb: 'METAR YPAD 270630Z AUTO 22010KT 9999 // BKN095 18/07 Q1021' }], taf: [{ rawTAF: 'TAF YPAD 270502Z 2706/2812 21014KT 9999 FEW040' }] },
    ],
    firsUsed: [{ icao: 'YMMM', name: 'Melbourne FIR' }],
    notamsByIcao: { YMML: [notam('H1', 'AERODROME'), notam('H2', 'OBSTACLE', 130), notam('H3', 'NAVAID')], WADD: [], YMMM: [notam('G1', 'OBSTACLE')] },
    sigmets: [{ hazard: 'TS', qualifier: 'FRQ', firName: 'YBBB BRISBANE', validFrom: '2026-10-27T06:00:00Z', validTo: '2026-10-27T07:30:00Z', top: 43000, dir: 'E', spd: 15, raw: 'WSAU21 YBRF 270552\nYBBB SIGMET P02 VALID 270600/270730' }],
  },
  duty: {
    how: 'auto',
    log: { date: '2026-08-30', aircraft: [{ id: 'a1', reg: '9M-LRW', type: 'B737-8' }], crew: [{ name: 'Aiman Hafiz', position: 'CAPT' }, { name: 'Siti', position: 'FO' }] },
    sector: { aircraftId: 'a1', fltNo: 'OD178', from: 'YMML', dest: 'WADD', offBlk: '2108', takeoff: '2119', ldg: '0305', onBlk: '0314', fuelOff: '17330', fuelOn: '3150', pax: '168', remark: 'Delayed push 8 min.' },
  },
})
const pageCount = buf => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
const model = (mut) => { const i = input(); mut?.(i); return buildPdfModel(i, defaultSelection(pdfSections(i))) }

describe('renderBriefingPdf', () => {
  for (const orientation of ['portrait', 'landscape']) for (const theme of ['dark', 'light']) {
    it(`makes a PDF: ${orientation}, ${theme}`, async () => {
      const buf = await renderBriefingPdf(model(), { orientation, theme }, fonts)
      expect(Buffer.from(buf).subarray(0, 5).toString()).toBe('%PDF-')
      expect(pageCount(buf)).toBeGreaterThan(2)
    })
  }

  it('runs on a manual briefing: no map, no OFP details, no duty log', async () => {
    const buf = await renderBriefingPdf(model(i => { i.mapSnapshot = null; i.route.flightDetails = null; i.duty = null }), {}, fonts)
    expect(pageCount(buf)).toBeGreaterThanOrEqual(1)
  })

  it('splits one very long NOTAM over pages instead of failing', async () => {
    const short = await renderBriefingPdf(model(i => { i.data.notamsByIcao.YMML = [notam('H1', 'AERODROME')] }), {}, fonts)
    const long = await renderBriefingPdf(model(), {}, fonts)
    expect(pageCount(long)).toBeGreaterThan(pageCount(short))
  })

  it('draws nothing for sections that are unticked', async () => {
    const i = input(), sel = defaultSelection(pdfSections(i)); sel.sections.delete('notam')
    const without = await renderBriefingPdf(buildPdfModel(i, sel), {}, fonts)
    const withAll = await renderBriefingPdf(model(), {}, fonts)
    expect(pageCount(without)).toBeLessThan(pageCount(withAll))
  })
})
