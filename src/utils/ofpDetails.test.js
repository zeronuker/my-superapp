import { describe, it, expect } from 'vitest'
import { xmlDetails, pdfDetails } from './ofpDetails'

// Made-up OFP fragments shaped like the company's XmlOFP and PFP; the numbers add up the
// way a real plan's do (take-off fuel = trip + contingency + alternate + final reserve + tankering).
const dur = (h, m) => `<Duration><Value>PT${h}H${m}M</Value></Duration>`
const w = kg => `<EstimatedWeight><Value unit="kg">${kg}</Value></EstimatedWeight>`

const XML = `<FlightPlan>
  <Flight><FlightNumber airlineIATACode="OD" number="755"><CommercialFlightNumber>OD755</CommercialFlightNumber></FlightNumber></Flight>
  <FlightPlanHeader>
    <RouteInformation fMSRouteName="WMKLUZTT11" routeName="R11" optimization="LC">
      <CruiseProcedure procedure="CI029"><CostIndex><Value>029</Value></CostIndex></CruiseProcedure>
      <RouteDescription>WMKL RWY-21 MULOT1D MULOT UZTT
WMKL/FL320 LIBDI/FL300 </RouteDescription>
      <GreatCircleDistance><Value unit="NM">2653</Value></GreatCircleDistance>
    </RouteInformation>
  </FlightPlanHeader>
  <FuelHeader>
    <TripFuel>${w(16221)}${dur('6', '30')}</TripFuel>
    <ContingencyFuel>${w(811)}${dur('0', '22')}<ContingencyPolicy policyName="X"></ContingencyPolicy></ContingencyFuel>
    <AlternateFuels>
      <AlternateFuel>${w(1371)}${dur('0', '33')}<Airport><AirportICAOCode>UZFN</AirportICAOCode></Airport>
        <FinalReserve>${w(1052)}${dur('0', '30')}</FinalReserve><Sequence>1</Sequence></AlternateFuel>
      <AlternateFuel>${w(1526)}${dur('0', '38')}<Airport><AirportICAOCode>UZSS</AirportICAOCode></Airport>
        <FinalReserve>${w(1052)}${dur('0', '30')}</FinalReserve><Sequence>2</Sequence></AlternateFuel>
    </AlternateFuels>
    <ExtraFuels>
      <ExtraFuel reason="DispatchDefined">${w(0)}${dur('00', '00')}</ExtraFuel>
      <ExtraFuel reason="EconomicTankering">${w(500)}${dur('00', '14')}</ExtraFuel>
    </ExtraFuels>
    <TakeOffFuel>${w(19955)}${dur('8', '9')}</TakeOffFuel>
    <TaxiFuel>${w(200)}${dur('0', '10')}</TaxiFuel>
    <BlockFuel>${w(20155)}${dur('08', '19')}</BlockFuel>
    <ArrivalFuel>${w(3734)}</ArrivalFuel>
  </FuelHeader>
  <WeightHeader>
    <DryOperatingWeight>${w(45634)}</DryOperatingWeight>
    <Load>${w(15066)}</Load>
    <ZeroFuelWeight>${w(60700)}<OperationalLimit><Value unit="kg">61000</Value></OperationalLimit><StructuralLimit><Value unit="kg">64818</Value></StructuralLimit></ZeroFuelWeight>
    <TakeoffWeight>${w(80655)}<OperationalLimit><Value unit="kg">81119</Value></OperationalLimit></TakeoffWeight>
    <LandingWeight>${w(64434)}<OperationalLimit><Value unit="kg">69308</Value></OperationalLimit></LandingWeight>
  </WeightHeader>
  <Remarks><Remark remarkType="general"><Paragraph><Text>OCC CONTACT     :+60376220187(OCC)/+60196653928(FD)
ENROUTE ALT     :WMKL VYYY
MEL/CDL         :CDL 57-54-10
NOTE 1          :T32/Q1008 -OPT
NOTAM           :FIR OAKX G0222/26 FOR REFERENCE </Text></Paragraph></Remark></Remarks>
  <AlternateRoutes>
    <AlternateRoute><Waypoints><Waypoint waypointName="UZTT"><GroundDistance><Value unit="NM">9.9</Value></GroundDistance></Waypoint></Waypoints>
      <Airport airportFunction="PrimaryArrivalAlternateAirport"><AirportICAOCode>UZFN</AirportICAOCode></Airport>
      <RouteInformation fMSRouteName="UZTTUZFN">
        <AverageWindComponent><Value unit="kt">29</Value></AverageWindComponent>
        <InitialAltitude><Value unit="ft/100">290</Value></InitialAltitude>
        <RouteDescription>UZTT TISIB2A TISIB L163 ATLUD ATLUD5X UZFN</RouteDescription>
        <GroundDistance><Value unit="NM">190</Value></GroundDistance>
      </RouteInformation></AlternateRoute>
    <AlternateRoute><Waypoints></Waypoints>
      <Airport airportFunction="ArrivalAlternateAirport"><AirportICAOCode>UZSS</AirportICAOCode></Airport>
      <RouteInformation fMSRouteName="UZTTUZSS">
        <AverageWindComponent><Value unit="kt">-26</Value></AverageWindComponent>
        <InitialAltitude><Value unit="ft/100">260</Value></InitialAltitude>
        <RouteDescription>UZTT KUFIM2A KUFIM UZSS</RouteDescription>
        <GroundDistance><Value unit="NM">206</Value></GroundDistance>
      </RouteInformation></AlternateRoute>
  </AlternateRoutes>
</FlightPlan>`

const PDF = `Log Nr.: 888189
| MXD755 | LGK/WMKL - TAS/UZTT | DEST ALTN:NMA/UZFN | DOF: 09AUG26 |
| WMKL/LGK | STD 09:05 +0800 | B737/9M-LRJ -PF/5.3 -IF/ 0.0 | RTE11 |
| CLB 250/268/M79 CRZ/CI029 DES M77/279/250 |
REF 888189 - COMPUTED AT 06.00Z FOR ETD 09.05Z 09/08/26
- PLAN VALID UNTIL 09/08/26 15.05Z
WMKL RWY-21 MULOT1D MULOT DCT VAS R325 PUT L759 KKJ L760 DPN A589
ASARI L509 TAPIS M875 KUFIM KUFIM2W RWY-08L UZTT
WMKL/FL320[OPT] LIBDI/FL300[OPT] MABUR/FL340[OPT] BBS/
FL320[OPT] KKJ/FL340[OPT]
GCD : 2653 W/C : P012 TTL DIST : 3045 EET : 06:30
| FUEL TIME CORRECTION|WEIGHTS PLAN MAX (KG) |
|TRIP 16221 06:30 _________|DOW 45634 |
|CONT FUEL 811 00:22 _________|PAX 0 |
|ALTN 1 UZFN 1371 00:33 _________|CARGO 0 |
|FINAL RES 1052 00:30 _________|PAYLOAD 15066 |
|EDTO/ADDNL 0 00:00 _________|ZFW 60700 61000 |
|COMPANY FUEL 0 00:00 _________|FUEL 19955 20300 |
|MAND TANKER 0 00:00 _________|TOW 80655 81119 |
|ECO TANKERING 500 00:14 _________|RAMP 80855 82417 |
| EST T/OFF FUEL 19955 08:09 _________|TRIP 16221 |
|TAXI 200 00:10 _________|LDW 64434 69308 |
|EXTRA 0 00:00 _________|LDW FUEL 2923 |
| BLOCK FUEL ______ _____ _________|FUEL PRICE RATIO: 1.10 |
|ZFW CHG M1000 KGS BURN LESS 191 KGS |
|AIRCRAFT : 9M-LRJ - B737-MAX-8/LEAP-1B25 |
|TAKEOFF ALTN : NOT REQD |
|EDTO/ETP ALTN : NON EDTO/ETP |
OCC CONTACT :+60376220187(OCC)/+60196653928(FD)
MEL/CDL :CDL 57-54-10
NOTE 1 :T32/Q1008 -OPT
NOTAM :FIR OAKX G0222/26 FOR REFERENCE
ALTN1: UZFN
RTE: UZTT TISIB2A TISIB L163 ATLUD ATLUD5X UZFN
ALT DIST: 0190 ALT FL: 290 W/C: P029 FUEL/TIME: 001371/00:33 MORA: 13300
ALTN2: UZSS
RTE: UZTT KUFIM2A KUFIM UZSS
ALT DIST: 0206 ALT FL: 260 W/C: M026 FUEL/TIME: 001526/00:38 MORA: 7300`

describe.each([['XmlOFP', xmlDetails(XML)], ['PFP text', pdfDetails(PDF)]])('%s', (_name, d) => {
  it('reads the cost index, route number and great-circle distance', () => {
    expect(d.costIndex).toBe('029')
    expect(d.routeNo).toBe('11')
    expect(d.gcdNm).toBe(2653)
  })
  it('reads the route without the level-step list', () => {
    expect(d.route.startsWith('WMKL RWY-21 MULOT1D MULOT')).toBe(true)
    expect(d.route).not.toMatch(/FL\d{3}/)
  })
  it('reads the fuel lines with their times', () => {
    expect(d.fuel.trip).toEqual({ kg: 16221, min: 390 })
    expect(d.fuel.contingency).toEqual({ kg: 811, min: 22 })
    expect(d.fuel.alternate).toEqual({ icao: 'UZFN', kg: 1371, min: 33 })
    expect(d.fuel.finalReserve).toEqual({ kg: 1052, min: 30 })
    expect(d.fuel.tankering).toEqual({ kg: 500, min: 14 })
    expect(d.fuel.takeoff).toEqual({ kg: 19955, min: 489 })
    expect(d.fuel.taxi).toEqual({ kg: 200, min: 10 })
  })
  it('works block fuel out as take-off plus taxi, and finds no extra fuel', () => {
    expect(d.fuel.block).toEqual({ kg: 20155, min: 499 })
    expect(d.fuel.extra).toBeNull()
  })
  it('works minimum diversion fuel out as alternate plus final reserve', () => {
    expect(d.fuel.minDiversion).toEqual({ kg: 2423, min: 63 })
  })
  it('shows arrival fuel with the contingency already burned', () => {
    expect(d.fuel.arrival).toBe(2923)
  })
  it('reads the weights and their operational limits', () => {
    expect(d.weights.dow).toBe(45634)
    expect(d.weights.payload).toBe(15066)
    expect(d.weights.zfw).toEqual({ kg: 60700, max: 61000 })
    expect(d.weights.tow).toEqual({ kg: 80655, max: 81119 })
    expect(d.weights.ldw).toEqual({ kg: 64434, max: 69308 })
  })
  it('reads each destination alternate with its routing', () => {
    expect(d.alternates).toHaveLength(2)
    const [a1, a2] = d.alternates
    expect(a1).toMatchObject({ icao: 'UZFN', route: 'UZTT TISIB2A TISIB L163 ATLUD ATLUD5X UZFN', distNm: 190, fl: 290, wc: 29, min: 33, fuel: 1371 })
    expect(a2).toMatchObject({ icao: 'UZSS', distNm: 206, fl: 260, wc: -26, min: 38, fuel: 1526 })
  })
  it('reads the dispatch remarks', () => {
    expect(d.remarks.occ).toEqual(['+60376220187(OCC)', '+60196653928(FD)'])
    expect(d.remarks.melCdl).toBe('CDL 57-54-10')
    expect(d.remarks.notes).toEqual([{ n: 1, text: 'T32/Q1008 -OPT' }])
    expect(d.remarks.notam).toBe('FIR OAKX G0222/26 FOR REFERENCE')
  })
})

describe('what only one format prints', () => {
  it('XmlOFP has the commercial flight number but no MORA, pax, cargo or take-off/EDTO status', () => {
    const d = xmlDetails(XML)
    expect(d.commercialNo).toBe('OD755')
    expect(d.alternates.map(a => a.mora)).toEqual([null, null])
    expect(d.weights.pax).toBeNull()
    expect(d.takeoffAlt).toBeNull()
    expect(d.edto).toBeNull()
  })
  it('PFP has MORA, pax, cargo and take-off/EDTO status but no commercial flight number', () => {
    const d = pdfDetails(PDF)
    expect(d.commercialNo).toBeNull()
    expect(d.alternates.map(a => a.mora)).toEqual([13300, 7300])
    expect(d.weights.pax).toBe(0)
    expect(d.weights.cargo).toBe(0)
    expect(d.takeoffAlt).toBe('NOT REQD')
    expect(d.edto).toBe('NON EDTO/ETP')
  })
})

describe('fuel the named lines do not cover', () => {
  it('shows the leftover as extra fuel so the parts still add up to take-off fuel', () => {
    const d = pdfDetails(PDF.replace('EST T/OFF FUEL 19955 08:09', 'EST T/OFF FUEL 20255 08:24'))
    expect(d.fuel.extra).toEqual({ kg: 300, min: 15 })
  })
})
