import { describe, it, expect } from 'vitest'
import { parseOfpXml, parseOfpPdf, ofpRouteText, ofpToFields, parseFplBlock, parseEnrouteAlts, pasteFill } from './ofpParse'
import { parseRoute } from './routeParse'

// Made-up OFP shaped like the company's XmlOFP (ARINC 633): the filed flight
// plan and ENROUTE ALT sit in the remarks, waypoints carry arc-second coordinates.
const wp = (name, lat, lon, fir) => `
        <Waypoint waypointName="${name}"
                  sequenceId="1"
        >
            <Coordinates latitude="${lat}" longitude="${lon}"/>
            <Airway>M774</Airway>${fir ? `
            <Airspace airspaceICAOCode="${fir[0]}">
                <AirspaceName>${fir[1]}</AirspaceName>
            </Airspace>` : ''}
        </Waypoint>`

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<FlightPlan computedTime="2026-10-22T14:45:00Z" flightPlanId="94452">
    <M633SupplementaryHeader>
        <Flight flightOriginDate="2026-10-22" scheduledTimeOfDeparture="2026-10-22T18:15:00Z"></Flight>
        <Aircraft aircraftRegistration="9M-LNQ">
            <AircraftModel airlineSpecificSubType="B737 800WS CFM56-7B24"></AircraftModel>
        </Aircraft>
    </M633SupplementaryHeader>
    <FlightPlanHeader>
        <GroundDistance><Value unit="NM">1678</Value></GroundDistance>
        <GreatCircleDistance><Value unit="NM">1579</Value></GreatCircleDistance>
    </FlightPlanHeader>
    <FlightPlanSummary>
        <ScheduledTimeOfArrival>2026-10-22T22:30:00Z</ScheduledTimeOfArrival>
        <BlockTime><EstimatedTime><Value>PT04H03M</Value></EstimatedTime></BlockTime>
        <FlightTime><EstimatedTime><Value>PT03H53M</Value></EstimatedTime></FlightTime>
    </FlightPlanSummary>
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
    <Route>${wp('WMKK', 9864, 366113, ['WMFC', 'KUALA LUMPUR'])}${wp('KK701', 10044, 366060, ['WMFC', 'KUALA LUMPUR'])}${wp('TOC', 4890, 372060, ['WIIF', 'JAKARTA'])}${wp('KADAR', -408, 387822, ['WAAF', 'UJUNG PANDANG'])}${wp('TOD', -30000, 450000, ['WIIF', 'JAKARTA'])}${wp('WPDL', -30768, 450690, ['WAAF', 'UJUNG PANDANG'])}${wp('08327S125320E', -30762, 450720)}
    </Route>
    <AlternateRoutes>
        <AlternateRoute>${wp('ALTFX', -30000, 451000, ['ZZZZ', 'NOT ON THE MAIN ROUTE'])}</AlternateRoute>
    </AlternateRoutes>
</FlightPlan>`

// The PFP's text as pdfText.js hands it over: one string per line.
const PDF = [
  'Log Nr.: 94452',
  '| MXD372 | KUL/WMKK - DIL/WPDL | DEST ALTN:UPG/WAAA| DOF: 22OCT26 |',
  '| WMKK/KUL | STD 18:15 +0800 | B737/9M-LNQ -PF/2.5 -IF/ 0.0 | RTE12 |',
  '| WPDL/DIL | STA 22:30 +0900 | BLOCK TIME: 04:15 | TRIP TIME: 03:53 |',
  'REF 94452 - COMPUTED AT 14.45Z FOR ETD 18.15Z 22/10/26',
  'GCD : 1579 W/C : M005 TTL DIST : 1678 EET : 03:53',
  '|AIRCRAFT : 9M-LNQ - B737-800WS/CFM56-7B24 |',
  '(FPL-MXD372-IS',
  '-B738/M-SDFGHIRWY/LB1',
  '-WMKK1815',
  '-N0461F350 MITOS1D MITOS M630 DIL',
  'DCT',
  '-WPDL0353 WAAA WATT',
  '-PBN/A1B1C1D1O1S2 DOF/261022',
  'EET/WIIF0023 WAAF0134 WIIF0200',
  'WAAF0210',
  'SEL/AQER CODE/750582 RMK/CALLSIGN MALINDO',
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

  it('reads the route as filed, without the speed/level group', () => {
    expect(r.route).toBe('WMKK MITOS1D MITOS M630 JUNHA M774 KEVOK A215 MKS W37 DIL DCT WPDL')
  })

  it('reads what identifies the OFP, with the aircraft type written like the PFP does', () => {
    expect(r.info).toEqual({
      tail: '9M-LNQ', type: 'B737-800WS/CFM56-7B24', ofpNo: '94452',
      std: '2026-10-22T18:15:00Z', sta: '2026-10-22T22:30:00Z', computed: '2026-10-22T14:45:00Z',
      tripMin: 233, distNm: 1678,
    })
  })

  it('lists the FIRs flown through in order, each once, from the main route only', () => {
    expect(r.firs).toEqual([
      { icao: 'WMFC', name: 'Kuala Lumpur FIR' },
      { icao: 'WIIF', name: 'Jakarta FIR' },       // re-entered later: listed once
      { icao: 'WAAF', name: 'Ujung Pandang FIR' }, // the alternate leg's FIR (ZZZZ) is left out
    ])
  })

  it('keeps short words like UPB in capitals in a FIR name', () => {
    const upper = XML.replace('JAKARTA', 'CHENNAI UPB')
    expect(parseOfpXml(upper).firs[1].name).toBe('Chennai UPB FIR')
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
    expect(r.route).toBe('WMKK MITOS1D MITOS M630 DIL DCT WPDL')
  })

  it('lists the FIRs from the filed plan’s EET list (it runs onto a second line): departure FIR from the airport, then each once', () => {
    expect(r.firs.map(f => f.icao)).toEqual(['WMFC', 'WIIF', 'WAAF'])
    expect(r.firs[0].name).toBe('Kuala Lumpur FIR')
  })

  it('uses the code as the name when it does not know the FIR', () => {
    const odd = PDF.map(l => l.replace('EET/WIIF0023', 'EET/VYYF0023'))
    expect(parseOfpPdf(odd).firs[1]).toEqual({ icao: 'VYYF', name: 'VYYF' })
  })

  it('gives just the departure FIR when the plan stays in one FIR (no EET list)', () => {
    const none = PDF.filter(l => !/EET\/|^WAAF0210$/.test(l))
    expect(parseOfpPdf(none).firs.map(f => f.icao)).toEqual(['WMFC'])
  })

  it('reads the same identifying details as the XmlOFP, dating the clock times from the filed plan', () => {
    expect(r.info).toEqual(parseOfpXml(XML).info)
  })

  it('puts STA on the next day when its clock time is earlier than STD', () => {
    const night = PDF.map(l => l.replace('-WMKK1815', '-WMKK2215').replace('STA 22:30', 'STA 02:30'))
    expect(parseOfpPdf(night).info.sta).toBe('2026-10-23T02:30:00Z')
  })

  it('reads positions from the two-line navlog rows and stops at the arrival row', () => {
    expect(r.points).toEqual([
      { name: '03N102', lat: 2.7783, lon: 101.7017 },
      { name: 'KADAR', lat: -0.1133, lon: 107.7283 },
    ])
  })

  it('says so when the PDF has no navlog', () => {
    expect(parseOfpPdf(PDF.slice(0, PDF.findIndex(l => l.startsWith('WPT LAT')))).error).toMatch(/route points/)
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
    expect(f.filedRoute).toBe('WMKK MITOS1D MITOS M630 JUNHA M774 KEVOK A215 MKS W37 DIL DCT WPDL')
    expect(f.firs.map(x => x.icao)).toEqual(['WMFC', 'WIIF', 'WAAF'])
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

describe('details for the Flight Details tab', () => {
  it('rides along with the flight, naming which flight it describes', () => {
    const d = parseOfpPdf(PDF).details
    expect(d).toMatchObject({ dep: 'WMKK', arr: 'WPDL', route: 'WMKK MITOS1D MITOS M630 DIL DCT WPDL' })
    expect(d.enrouteAlts).toEqual(['WIII', 'WADD'])
    expect(d.destAlts).toEqual(['WAAA', 'WATT'])
  })
  it('gives each FIR its first entry time, and 0 for the one the flight starts in', () => {
    const { firs } = parseOfpPdf(PDF).details
    expect(firs.map(f => [f.icao, f.min])).toEqual([['WMFC', 0], ['WIIF', 23], ['WAAF', 94]])
  })
  it('still imports the flight when the plan prints none of the fuel, weights or alternates', () => {
    for (const r of [parseOfpXml(XML), parseOfpPdf(PDF)]) {
      expect(r.ok).toBe(true)
      expect(r.details.fuel).toBeNull()
      expect(r.details.weights).toBeNull()
      expect(r.details.alternates).toEqual([])
    }
  })
  it('is passed on by ofpToFields', () => {
    expect(ofpToFields(parseOfpPdf(PDF)).details.arr).toBe('WPDL')
  })
})


describe('parseFplBlock', () => {
  const FPL = `(FPL-MXD821-IS
-B38M/M-SDFGHIRWY/LB1
-RKSI0040
-N0474F340 BOPTA3H BOPTA Z51 BEDES Y711 KANKA/N0468F360 Y711 MUGUS Y742 SALMI Q11 TACLE Q12 KABAM N892 MABLI L635 DOVOL/N0464F360 Y334 PADLI Y343 SAROX SAROX1G
-WMKK0559 WMKP WMKJ
-PBN/A1B1C1D1O1S2T1 DOF/260526 REG/9MLRK EET/RJJJ0105 RCAA0120 RPHI0223 ZJSA0323 VVHM0330 WSJC0439 WMFC0554 SEL/DKFP CODE/750424 RMK/TCAS II EQUIPPED
-E/0756 P/TBN R/E S/M J/L D/4 184 YELLOW A/WHITE MAROON C/TBN)`

  it('pulls departure, arrival, alternates, route and FIRs from the pasted block', () => {
    const r = parseFplBlock(FPL)
    expect(r.ok).toBe(true)
    expect(r.dep).toBe('RKSI')
    expect(r.arr).toBe('WMKK')
    expect(r.destAlts).toEqual({ alt1: 'WMKP', alt2: 'WMKJ' })
    expect(r.routeText.startsWith('RKSI ')).toBe(true)
    expect(r.routeText.endsWith(' WMKK')).toBe(true)
    expect(r.routeText).toContain('SAROX1G')
    const firIcaos = r.firs.map(f => f.icao)
    for (const fir of ['RJJJ', 'RCAA', 'RPHI', 'ZJSA', 'VVHM', 'WSJC', 'WMFC']) expect(firIcaos).toContain(fir)
  })

  it('still parses when the closing ) was not copied', () => {
    const r = parseFplBlock(FPL.slice(0, -1))
    expect(r.ok).toBe(true)
    expect(r.dep).toBe('RKSI')
    expect(r.arr).toBe('WMKK')
  })

  it('returns ok:false for text that is not a flight plan', () => {
    expect(parseFplBlock('just some notes').ok).toBe(false)
    expect(parseFplBlock('').ok).toBe(false)
  })
})

describe('parseFplBlock with the Flight Remarks', () => {
  const FPL = `(FPL-MXD821-IS
-B38M/M-SDFGHIRWY/LB1
-RKSI0040
-N0474F340 BOPTA3H BOPTA Z51 BEDES Y711 SAROX SAROX1G
-WMKK0559 WMKP WMKJ
-PBN/A1B1C1D1O1S2T1 DOF/260526 REG/9MLRK EET/RJJJ0105 RCAA0120 WMFC0554
-E/0756 P/TBN R/E S/M J/L D/4 184 YELLOW A/WHITE MAROON C/TBN)`
  const REMARKS = `
 FLIGHT REMARKS:
OCC CONTACT :+60376220187(OCC) / +60193246147(OCC) / +60196653928(FD)
ENROUTE ALT : RKSI ZSPD RCTP RPLL VVDN VVTS WMKK
NOTES 1     : HW05/T24/Q1012/FLP05/DRY/RWY16L-OPT
NOTES 2     : PADD 50KGS`
  const FIVE = ['ZSPD', 'RCTP', 'RPLL', 'VVDN', 'VVTS']

  it('reads the enroute alternates under the flight plan, leaving out departure, arrival and destination alternates', () => {
    expect(parseFplBlock(FPL + '\n' + REMARKS).enroute).toEqual(FIVE)
  })
  it('does not pick up words from the notes when the line breaks were lost', () => {
    const flatRemarks = REMARKS.trim().replace(/\n/g, ' ')
    expect(flatRemarks).toContain('WMKK NOTES 1')
    expect(parseFplBlock(FPL + '\n' + flatRemarks).enroute).toEqual(FIVE)
  })
  it('accepts the remarks pasted above the flight plan', () => {
    expect(parseFplBlock(REMARKS + '\n' + FPL).enroute).toEqual(FIVE)
  })
  it('has no limit on how many it reads', () => {
    const many = 'ENROUTE ALT : AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH WMKK'
    expect(parseFplBlock(FPL + '\n' + many).enroute).toHaveLength(8)
  })
  it('is null (not an empty list) when no ENROUTE ALT line was pasted, so the form keeps its own', () => {
    expect(parseFplBlock(FPL).enroute).toBeNull()
  })
  it('an ENROUTE ALT line naming nothing new is an empty list', () => {
    expect(parseFplBlock(FPL + '\nENROUTE ALT : RKSI WMKK').enroute).toEqual([])
  })
  it('takes the last flight plan when two were pasted, and never the first one\'s remarks', () => {
    const second = FPL.replace('RKSI0040', 'WSSS0100').replace('-WMKK0559 WMKP WMKJ', '-WMKK0200 WMKP')
    const r = parseFplBlock(FPL + '\n' + REMARKS + '\n' + second)
    expect(r.dep).toBe('WSSS')
    expect(r.destAlts).toEqual({ alt1: 'WMKP', alt2: '' })
    expect(r.enroute).toBeNull()
    expect(parseFplBlock(FPL + '\n' + REMARKS + '\n' + second + '\nENROUTE ALT : WIII WMKK').enroute).toEqual(['WIII'])
  })
})

describe('parseEnrouteAlts (remarks pasted on their own)', () => {
  it('reads the line and leaves out the airports given', () => {
    expect(parseEnrouteAlts('ENROUTE ALT : RKSI ZSPD RCTP WMKK', ['RKSI', 'WMKK'])).toEqual(['ZSPD', 'RCTP'])
  })
  it('is null with no such line', () => {
    expect(parseEnrouteAlts('NOTES 1 : DRY')).toBeNull()
  })
})

describe('ofpToFields enroute alternates', () => {
  it('keeps every enroute alternate when no cap is given', () => {
    const many = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG']
    const f = ofpToFields({ ...parseOfpXml(XML), enrouteAlts: many })
    expect(f.enrouteCount).toBe(7)
    expect(f.enrouteAlts).toEqual(many)
  })
})

describe('pasteFill (what the paste box sets)', () => {
  const FPL = `(FPL-MXD821-IS
-B38M/M-SDFGHIRWY/LB1
-RKSI0040
-N0474F340 BOPTA3H BOPTA Z51 SAROX1G
-WMKK0559 WMKP WMKJ
-PBN/A1B1C1D1O1S2T1 DOF/260526 EET/RJJJ0105 RCAA0120 WMFC0554
-E/0756 P/TBN)`
  const REM = 'ENROUTE ALT : RKSI ZSPD RCTP WMKK'

  it('flight plan with remarks: fills everything including the enroute alternates', () => {
    const p = pasteFill(FPL + '\n' + REM)
    expect([p.dep, p.arr, p.destAlts, p.enroute]).toEqual(['RKSI', 'WMKK', { alt1: 'WMKP', alt2: 'WMKJ' }, ['ZSPD', 'RCTP']])
    expect(p.firs.length).toBeGreaterThan(0)
  })
  it('flight plan WITHOUT remarks clears the enroute alternates, so an earlier flight\'s never stay', () => {
    const p = pasteFill(FPL)
    expect(p.dep).toBe('RKSI')
    expect(p.enroute).toEqual([])
  })
  it('remarks pasted afterwards fill them in again', () => {
    expect(pasteFill(FPL).enroute).toEqual([])
    expect(pasteFill(FPL + '\n' + REM).enroute).toEqual(['ZSPD', 'RCTP'])
  })
  it('remarks on their own set only the enroute alternates, leaving out the known airports', () => {
    expect(pasteFill(REM, ['RKSI', 'WMKK'])).toEqual({ enroute: ['ZSPD', 'RCTP'] })
  })
  it('a plain route sets only departure and arrival, and never touches the enroute alternates', () => {
    expect(pasteFill('WMKK KIMAT1A KIMAT Y344 VPK RCQC')).toEqual({ dep: 'WMKK', arr: 'RCQC' })
  })
  it('a half-typed or unreadable paste sets nothing (nothing is cleared either)', () => {
    expect(pasteFill('(FPL-MXD821-IS')).toEqual({})
    expect(pasteFill('some notes')).toEqual({})
    expect(pasteFill('')).toEqual({})
  })
})
