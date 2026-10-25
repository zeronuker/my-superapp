import { describe, it, expect } from 'vitest'
import { parseOfpXml, parseOfpPdf, ofpRouteText, ofpToFields } from './ofpParse'
import { parseRoute } from './routeParse'

// Made-up OFP shaped like the company's XmlOFP (ARINC 633): the filed flight
// plan and ENROUTE ALT sit in the remarks, waypoints carry arc-second coordinates.
const wp = (name, lat, lon) => `
        <Waypoint waypointName="${name}"
                  sequenceId="1"
        >
            <Coordinates latitude="${lat}" longitude="${lon}"/>
            <Airway>M774</Airway>
        </Waypoint>`

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<FlightPlan flightPlanId="94452">
    <Remarks>
        <Remark remarkType="ATC">
            <Paragraph><Text>(FPL-MXD372-IS
-B738/M-SDFGHIRWY/LB1
-WMKK1815
-N0461F350 MITOS1D MITOS M630 JUNHA M774 KEVOK A215 MKS W37 DIL
 DCT
-WPDL0353 WAAA WATT
-PBN/A1B1C1D1O1S2 DOF/261022 REG/9MLNQ
 C/TBN)</Text></Paragraph>
        </Remark>
        <Remark remarkType="general">
            <Paragraph><Text>OCC CONTACT     :+60376220187(OCC)
ENROUTE ALT     :WMKK WIII WADD WAAA WPDL
MEL/CDL         :CDL 57-54-10 </Text></Paragraph>
        </Remark>
    </Remarks>
    <Route>${wp('WMKK', 9864, 366113)}${wp('KK701', 10044, 366060)}${wp('TOC', 4890, 372060)}${wp('KADAR', -408, 387822)}${wp('TOD', -30000, 450000)}${wp('WPDL', -30768, 450690)}${wp('08327S125320E', -30762, 450720)}
    </Route>
    <AlternateRoutes>
        <AlternateRoute>${wp('ALTFX', -30000, 451000)}</AlternateRoute>
    </AlternateRoutes>
</FlightPlan>`

// The PFP's text as pdfText.js hands it over: one string per line.
const PDF = [
  'Log Nr.: 94452',
  '| MXD372 | KUL/WMKK - DIL/WPDL | DEST ALTN:UPG/WAAA| DOF: 22OCT26 |',
  '(FPL-MXD372-IS',
  '-B738/M-SDFGHIRWY/LB1',
  '-WMKK1815',
  '-N0461F350 MITOS1D MITOS M630 DIL',
  'DCT',
  '-WPDL0353 WAAA WATT',
  '-PBN/A1B1C1D1O1S2 DOF/261022',
  'C/TBN)',
  'ENROUTE ALT :WMKK WIII WADD WAAA WPDL',
  'WPT LAT FL WIND OAT GS T/T LEGD LEGT FUSED ACTUAL',
  'WMKK N02 44.6 140',
  '00069ft E101 41.9 16599',
  '03N102 N02 46.7 CLB 163/010 CLB 268 5 2 1 269 .....',
  'DCT E101 42.1 MITO1D P010 CLB ... 006 2 00:01 .... ..... .....',
  'KADAR S00 06.8 350 026/006 M43 459 123 58 7 3850 .....',
  'DCT E107 43.7 M774 P001 DSC ... 123 452 01:03 .... ..... .....',
  'TOC S01 21.5 CLB 046/017 M42 467 124 3 0 2135 .....',
  'DCT E103 01.4 M630 M004 CLB ... 124 151 00:23 .... ..... .....',
  'WPDL S08 32.8 DSC 121/011 DSC 252 79 0 0 10338 .....',
  'DCT E125 31.5 APPCH M008 DSC ... 079 1678 03:53 .... ..... .....',
  'ALTFX S08 40.0 CLB 131/010 CLB 254 79 1 0 176 .....',
  'DCT E125 50.0 FILOM2 M006 CLB ... 079 1 00:00 .... ..... .....',
]

describe('parseOfpXml', () => {
  const r = parseOfpXml(XML)

  it('reads the flight, airports and the two filed destination alternates', () => {
    expect(r.ok).toBe(true)
    expect(r.flight).toBe('MXD372')
    expect([r.dep, r.arr]).toEqual(['WMKK', 'WPDL'])
    expect(r.destAlts).toEqual(['WAAA', 'WATT'])
  })

  it('enroute alternates are the ENROUTE ALT remark minus dep, arr and destination alternates', () => {
    expect(r.enrouteAlts).toEqual(['WIII', 'WADD'])
  })

  it('converts arc-seconds to degrees, south and west negative', () => {
    const kadar = r.points.find(p => p.name === 'KADAR')
    expect(kadar).toEqual({ name: 'KADAR', lat: -0.1133, lon: 107.7283 })
  })

  it('keeps the main route only: no airports, no TOC/TOD, no missed approach, no alternate legs', () => {
    expect(r.points.map(p => p.name)).toEqual(['KK701', 'KADAR'])
  })

  it('says so when the file is not an OFP', () => {
    expect(parseOfpXml('<html>nothing</html>')).toEqual({ ok: false, error: "Couldn't find the filed flight plan in this file." })
  })

  it('says so when there are no route points', () => {
    const noRoute = XML.replace(/<Route>[\s\S]*<\/AlternateRoutes>/, '')
    expect(parseOfpXml(noRoute).error).toMatch(/route points/)
  })
})

describe('parseOfpPdf', () => {
  const r = parseOfpPdf(PDF)

  it('reads the same flight details as the XmlOFP', () => {
    expect(r.ok).toBe(true)
    expect([r.flight, r.dep, r.arr]).toEqual(['MXD372', 'WMKK', 'WPDL'])
    expect(r.destAlts).toEqual(['WAAA', 'WATT'])
    expect(r.enrouteAlts).toEqual(['WIII', 'WADD'])
  })

  it('reads positions from the two-line navlog rows and stops at the arrival row', () => {
    expect(r.points).toEqual([
      { name: '03N102', lat: 2.7783, lon: 101.7017 },
      { name: 'KADAR', lat: -0.1133, lon: 107.7283 },
    ])
  })

  it('says so when the PDF has no navlog', () => {
    expect(parseOfpPdf(PDF.slice(0, 11)).error).toMatch(/route points/)
  })
})

describe('route text round trip', () => {
  const r = parseOfpXml(XML)

  it('is read back by parseRoute as positioned points, with the airports as dep/arr', () => {
    const p = parseRoute(ofpRouteText(r))
    expect([p.dep, p.arr, p.ok]).toEqual(['WMKK', 'WPDL', true])
    expect(p.pts).toEqual([{ name: 'KK701', lat: 2.79, lon: 101.6833 }, { name: 'KADAR', lat: -0.1133, lon: 107.7283 }])
  })

  it('has no length limit', () => {
    const many = { ...r, points: Array.from({ length: 150 }, (_, i) => ({ name: `PT${i}`, lat: 1, lon: 100 + i / 100 })) }
    const p = parseRoute(ofpRouteText(many))
    expect([p.ok, p.pts.length]).toEqual([true, 150])
  })

  it('an edit that adds a plain fix drops the imported positions', () => {
    const p = parseRoute(`${ofpRouteText(r).replace(' WPDL', '')} ABCDE WPDL`)
    expect(p.pts).toBeNull()
    expect(p.fixes).toEqual(['ABCDE'])
  })
})

describe('ofpToFields', () => {
  it('fills the tab boxes', () => {
    const f = ofpToFields(parseOfpXml(XML), 5)
    expect(f.destAlts).toEqual({ alt1: 'WAAA', alt2: 'WATT' })
    expect(f.enrouteCount).toBe(2)
    expect(f.enrouteAlts).toEqual(['WIII', 'WADD', '', '', ''])
    expect(f.routeText.startsWith('WMKK KK701:')).toBe(true)
  })

  it('caps the enroute alternates at the tab limit', () => {
    const f = ofpToFields({ ...parseOfpXml(XML), enrouteAlts: ['AAAA', 'BBBB', 'CCCC'] }, 2)
    expect([f.enrouteCount, f.enrouteAlts]).toEqual([2, ['AAAA', 'BBBB']])
  })

  it('leaves the second destination alternate empty when only one is filed', () => {
    const f = ofpToFields({ ...parseOfpXml(XML), destAlts: ['WAAA'] }, 5)
    expect(f.destAlts).toEqual({ alt1: 'WAAA', alt2: '' })
  })
})
