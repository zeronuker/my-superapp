import { describe, it, expect } from 'vitest'
import { pdfSections, defaultSelection, buildPdfModel, notamLocations, activeNotams, pdfFileName, crewList } from './briefingPdf'

const notam = (id, category, status = 'ACTIVE') => ({ id, category, source: 'YMML', validity: { status, startStr: '01 JAN 00:00', endStr: 'PERM' }, raw: `E) ${id}` })

const base = () => ({
  name: 'YMML → WADD · 27 Oct 06:57',
  savedAt: Date.UTC(2026, 9, 27, 7, 0),
  route: { dep: 'YMML', arr: 'WADD', flightDetails: { flight: 'MXD178' } },
  mapSnapshot: 'data:image/jpeg;base64,AAAA',
  data: {
    fetchedAt: Date.UTC(2026, 9, 27, 6, 57),
    airports: [
      { icao: 'YMML', label: 'DEPARTURE', metar: [{ rawOb: 'METAR YMML 270630Z 24007KT 9999 OVC068 14/05 Q1020' }], taf: [{ rawTAF: 'TAF YMML 270517Z 2706/2812 25012KT 9999' }] },
      { icao: 'WADD', label: 'ARRIVAL', metar: [], taf: [] },
      { icao: 'WADL', label: 'DESTINATION ALTERNATE 1', metar: [], taf: [] },
      { icao: 'YPAD', label: 'ENROUTE ALTERNATE 1', metar: [], taf: [] },
    ],
    firsUsed: [{ icao: 'YMMM', name: 'Melbourne FIR' }],
    notamsByIcao: {
      YMML: [notam('H1', 'OTHER'), notam('H2', 'OBSTACLE'), notam('H3', 'AERODROME'), notam('H4', 'AERODROME', 'EXPIRED'), notam('H5', 'NAVAID'), notam('H6', 'AERODROME', 'FUTURE')],
      WADD: [],
      YMMM: [notam('G1', 'OBSTACLE')],
    },
    sigmets: [
      { hazard: 'TS', qualifier: 'FRQ', firName: 'YBBB BRISBANE', validFrom: '2026-10-27T06:00:00Z', validTo: '2026-10-27T07:30:00Z', top: 43000, dir: 'E', spd: 15, raw: 'WSAU21 YBRF 270552' },
      { hazard: 'TURB', firId: 'YMMM', validFrom: '2026-10-27T03:15:00Z', validTo: '2026-10-27T03:45:00Z', base: 0, top: 5000, raw: 'x' },
    ],
  },
  duty: {
    log: {
      date: '2026-08-30', aircraft: [{ id: 'a1', reg: '9M-LRW', type: 'B737-8' }],
      crew: [{ name: 'Aiman', position: 'CAPT' }, { name: '', position: '' }, { name: 'Siti', position: '' }],
    },
    sector: { aircraftId: 'a1', fltNo: 'OD178', from: 'YMML', dest: 'WADD', offBlk: '2108', takeoff: '21:19', ldg: '0305', onBlk: '0314', fuelOff: '17330', fuelOn: '3150', pax: '168', remark: 'ok' },
  },
})

describe('pdfSections', () => {
  it('lists every section in the order the PDF draws them, NOTAMs last with a child per location', () => {
    const s = pdfSections(base())
    expect(s.map(x => x.id)).toEqual(['map', 'flight', 'duty', 'crew', 'weather', 'sigmet', 'notam'])
    expect(s.at(-1).children).toEqual([
      { id: 'YMML', label: 'YMML', count: 4 }, { id: 'WADD', label: 'WADD', count: 0 },
      { id: 'WADL', label: 'WADL', count: 0 }, { id: 'YPAD', label: 'YPAD', count: 0 },
      { id: 'YMMM', label: 'YMMM FIR', count: 1 },
    ])
  })

  it('leaves out what the briefing does not have', () => {
    const b = base()
    b.mapSnapshot = null; b.route.flightDetails = null; b.duty = null; b.data.sigmets = []
    expect(pdfSections(b).map(x => x.id)).toEqual(['weather', 'notam'])
  })

  it('has no Crew row when the linked log lists nobody', () => {
    const b = base(); b.duty.log.crew = [{ name: ' ', position: '' }]
    expect(pdfSections(b).map(x => x.id)).not.toContain('crew')
  })
})

describe('defaultSelection', () => {
  it('ticks everything, every NOTAM location included', () => {
    const sel = defaultSelection(pdfSections(base()))
    expect([...sel.sections]).toEqual(['map', 'flight', 'duty', 'crew', 'weather', 'sigmet', 'notam'])
    expect([...sel.notams]).toEqual(['YMML', 'WADD', 'WADL', 'YPAD', 'YMMM'])
  })
})

describe('buildPdfModel', () => {
  const full = () => { const b = base(); return buildPdfModel(b, defaultSelection(pdfSections(b)), Date.UTC(2026, 9, 27, 7, 40)) }

  it('with everything ticked fills every section and takes the long title', () => {
    const m = full()
    expect(m.withLog).toBe(true)
    expect(m.map).toBe('data:image/jpeg;base64,AAAA')
    expect(m.flight.flight).toBe('MXD178')
    expect(m.generated).toBe('27 Oct 2026 06:57 UTC')
    expect(m.weather.depArr.map(a => a.icao)).toEqual(['YMML', 'WADD'])
    expect(m.weather.destAlt.map(a => a.icao)).toEqual(['WADL'])
    expect(m.weather.era.map(a => a.icao)).toEqual(['YPAD'])
    expect(m.weather.depArr[0].metar).toContain('METAR YMML')
    expect(m.weather.depArr[1].metar).toBeNull()
  })

  it('drops a section that is unticked', () => {
    const b = base(), sel = defaultSelection(pdfSections(b))
    sel.sections.delete('weather'); sel.sections.delete('map')
    const m = buildPdfModel(b, sel)
    expect(m.weather).toBeNull(); expect(m.map).toBeNull(); expect(m.flight).not.toBeNull()
  })

  it('is the plain FLIGHT BRIEFING when no duty log or crew is ticked', () => {
    const b = base(), sel = defaultSelection(pdfSections(b))
    sel.sections.delete('duty'); sel.sections.delete('crew')
    const m = buildPdfModel(b, sel)
    expect(m.withLog).toBe(false); expect(m.duty).toBeNull(); expect(m.crew).toBeNull()
  })

  it('drops a NOTAM location that is unticked, and all NOTAMs when none is', () => {
    const b = base(), sel = defaultSelection(pdfSections(b))
    sel.notams.delete('YMML')
    const m = buildPdfModel(b, sel)
    expect(m.notams.airports.map(l => l.icao)).toEqual(['WADD', 'WADL', 'YPAD'])
    expect(m.notams.total).toBe(1)
    sel.notams.clear()
    expect(buildPdfModel(b, sel).notams).toBeNull()
  })

  it('shows only active NOTAMs, aerodrome first, then obstacle, nav aids, the rest', () => {
    const [ymml] = full().notams.airports
    expect(ymml.notams.map(n => n.id)).toEqual(['H3', 'H2', 'H5', 'H1'])
  })

  it('flags an expired SIGMET and words the altitude and movement like the card', () => {
    const [ts, turb] = full().sigmets
    expect(ts).toMatchObject({ title: 'THUNDERSTORM · FRQ', fir: 'YBBB BRISBANE', time: '0600Z – 0730Z', line: 'to FL430 · moving E at 15 kt', expired: true })
    expect(turb).toMatchObject({ title: 'TURBULENCE', fir: 'YMMM', line: '0 ft – 5,000 ft', expired: true })
    const early = buildPdfModel(base(), defaultSelection(pdfSections(base())), Date.UTC(2026, 9, 27, 6, 30))
    expect(early.sigmets[0].expired).toBe(false)
  })

  it('reads the linked sector: date, aircraft, times, block time past midnight, crew without blanks', () => {
    const m = full()
    expect(m.duty).toMatchObject({ fltNo: 'OD178', date: '30 Aug 2026', aircraft: '9M-LRW  B737-8', offBlk: '21:08', ldg: '03:05', block: '06:06' })
    expect(m.crew).toEqual([{ name: 'Aiman', position: 'CAPT' }, { name: 'Siti', position: '' }])
  })

  it('ignores a ticked id the briefing cannot export', () => {
    const b = base(); b.mapSnapshot = null
    const sel = defaultSelection(pdfSections(base()))
    expect(buildPdfModel(b, sel).map).toBeNull()
  })
})

describe('helpers', () => {
  it('notamLocations puts airports before FIRs and keeps only active NOTAMs', () => {
    const l = notamLocations(base().data)
    expect(l.map(x => `${x.kind}:${x.icao}`)).toEqual(['airport:YMML', 'airport:WADD', 'airport:WADL', 'airport:YPAD', 'fir:YMMM'])
    expect(l[0].notams).toHaveLength(4)
  })
  it('activeNotams tolerates nothing', () => { expect(activeNotams(undefined)).toEqual([]) })
  it('crewList drops rows with neither name nor position', () => {
    expect(crewList({ crew: [{ name: 'A', position: '' }, { name: '', position: ' ' }] })).toHaveLength(1)
  })
  it('pdfFileName makes a safe name', () => {
    expect(pdfFileName('YMML → WADD · 27 Oct 06:57')).toBe('YMML - WADD · 27 Oct 06-57.pdf')
    expect(pdfFileName('')).toBe('briefing.pdf')
  })
})
