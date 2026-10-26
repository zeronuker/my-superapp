import { lookupAirport } from '../data/airports'
import { blockMinutes, fmtHm } from '../utils/ofpTimes'
import { pctOfLimit, weightLevel, fuelParts, fmtWc } from '../utils/flightDetailsCalc'
import { Field, TimeCol, Chip } from './OfpBits'

// The Briefing's first tab, shown only for a flight that came from an imported OFP: the same
// boarding-pass summary as the import card, then fuel, weights, route and FIRs, alternates and
// the dispatch remarks. `d` is route.flightDetails (BriefingModule builds it from ofpDetails.js).
// Any section the OFP did not print is left out.

const panel = { border: '1px solid var(--cp-border)', borderRadius: 10, background: 'var(--cp-bg2)', padding: 14, marginBottom: 12 }
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(290px, 100%), 1fr))', gap: 12 }
const mono = { fontFamily: 'var(--cb-font-mono)' }
const dim = { color: 'var(--cp-dim)' }
const kg = n => (n == null ? '—' : n.toLocaleString('en-US'))

// Fuel types are told apart by hue, not by importance, so they are fixed colours rather than theme ones.
const FUEL_COLORS = {
  trip: '#2dd4bf', contingency: '#3b82f6', alternate: '#facc15', finalReserve: '#ec4899',
  tankering: '#fb923c', extra: '#a78bfa', taxi: '#cbd5e1',
}
const LEVEL_COLORS = { green: 'var(--cp-green)', amber: 'var(--cp-yellow)', red: 'var(--cp-red)' }

function Card({ title, children, style }) {
  return (
    <div style={{ ...panel, ...style }}>
      <div className="cp-label" style={{ margin: '0 0 8px', color: 'var(--cp-acc)' }}>{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: last ? 'none' : '1px dashed var(--cp-border3)', fontSize: 12 }}>
      <span style={dim}>{label}</span>
      <span style={{ ...mono, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

function BoardingPass({ d }) {
  const { info } = d
  const block = info ? blockMinutes(info.std, info.sta) : null
  const small = { ...mono, fontSize: 10, color: 'var(--cp-dim)', marginBottom: 6 }
  return (
    <div style={panel}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <Field label="FLIGHT" value={d.flight} sub={d.commercialNo} />
        <Field label="TAIL" value={info?.tail} sub={info?.type?.replace('/', '/​')} flex={1.7} />
        <Field label="OFP NO." value={info?.ofpNo} sub={d.routeNo && `RTE ${d.routeNo}`} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', ...mono }}>
        <span style={{ fontSize: 22, letterSpacing: '0.06em' }}>{d.dep}</span>
        <span style={{ flex: 1, borderTop: '1.5px dashed var(--cp-dim)' }} />
        <span style={{ color: 'var(--cp-acc)', fontSize: 16, lineHeight: 1 }} aria-hidden="true">✈</span>
        <span style={{ flex: 1, borderTop: '1.5px dashed var(--cp-dim)' }} />
        <span style={{ fontSize: 22, letterSpacing: '0.06em' }}>{d.arr}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div>
          <div style={small}>{lookupAirport(d.dep)?.name}</div>
          <TimeCol label="STD" iso={info?.std} tz={d.depTz} align="left" />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={small}>{lookupAirport(d.arr)?.name}</div>
          <TimeCol label="STA" iso={info?.sta} tz={d.arrTz} align="right" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, margin: '12px 0 0', padding: '10px 0 0', borderTop: '1px solid var(--cp-border3)' }}>
        <Field label="BLOCK" value={fmtHm(block)} />
        <Field label="TRIP" value={fmtHm(info?.tripMin)} />
        <Field label="COST INDEX" value={d.costIndex} />
        <Field label="DISTANCE" value={info?.distNm != null ? `${info.distNm.toLocaleString('en-US')} NM` : null} sub={d.gcdNm != null && `GCD ${d.gcdNm.toLocaleString('en-US')}`} />
      </div>
    </div>
  )
}

function FuelCard({ fuel }) {
  const parts = fuelParts(fuel)
  const top = [['BLOCK FUEL', fuel.block, 'var(--cp-acc)'], ['EST T/OFF FUEL', fuel.takeoff], ['ARRIVAL FUEL', fuel.arrival != null && { kg: fuel.arrival }]]
  return (
    <Card title="FUEL (KG)">
      <div style={{ display: 'flex', gap: 10 }}>
        {top.map(([label, f, color]) => (
          <div key={label} style={{ flex: 1, minWidth: 0 }}>
            <div className="cp-label" style={{ margin: '0 0 2px', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{label}</div>
            <div style={{ ...mono, fontSize: 20, color }}>{f ? kg(f.kg) : '—'}</div>
            <div style={{ ...mono, fontSize: 11, ...dim }}>{f?.min != null ? fmtHm(f.min) : ' '}</div>
          </div>
        ))}
      </div>
      <div role="img" aria-label="Block fuel split by type" style={{ display: 'flex', gap: 4, height: 14, margin: '10px 0' }}>
        {parts.map(p => <i key={p.key} style={{ display: 'block', height: '100%', flexGrow: p.kg, flexBasis: 0, minWidth: 2, background: FUEL_COLORS[p.key] }} />)}
      </div>
      {parts.map((p, i) => (
        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, borderBottom: i < parts.length - 1 ? '1px dashed var(--cp-border3)' : 'none' }}>
          <b style={{ width: 10, height: 10, borderRadius: 2, flex: 'none', background: FUEL_COLORS[p.key] }} />
          <span style={{ flex: 1, ...dim }}>{p.label}</span>
          <span style={{ ...mono, width: 56, textAlign: 'right' }}>{kg(p.kg)}</span>
          <span style={{ ...mono, width: 40, textAlign: 'right', ...dim }}>{fmtHm(p.min) ?? ''}</span>
        </div>
      ))}
      <div style={{ ...dim, fontSize: 11, marginTop: 6 }}>Min diversion fuel {kg(fuel.minDiversion.kg)} ({fmtHm(fuel.minDiversion.min)})</div>
    </Card>
  )
}

function WeightBar({ label, w }) {
  const pct = pctOfLimit(w.kg, w.max)
  const level = weightLevel(pct)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={dim}>{label}</span>
        <span style={mono}>{kg(w.kg)}{w.max != null && ` / ${kg(w.max)}`}{pct != null && ` · ${pct.toFixed(1)}%`}</span>
      </div>
      {level && (
        <div style={{ height: 6, background: 'var(--cp-bg3)', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
          <i style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: LEVEL_COLORS[level] }} />
        </div>
      )}
    </div>
  )
}

function WeightsCard({ w }) {
  const paxCargo = w.pax != null && w.cargo != null ? ` (pax ${kg(w.pax)} · cargo ${kg(w.cargo)})` : ''
  const legend = [['green', 'up to 70%'], ['amber', '71 to 80%'], ['red', '81%+']]
  return (
    <Card title="WEIGHTS (KG)">
      <KV label="DOW" value={kg(w.dow)} />
      <KV label={`Payload${paxCargo}`} value={kg(w.payload)} last />
      <div style={{ marginTop: 10 }}>
        {[['ZFW', w.zfw], ['TOW', w.tow], ['LDW', w.ldw]].map(([label, x]) => x && <WeightBar key={label} label={label} w={x} />)}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, ...dim }}>
        {legend.map(([k, text]) => (
          <span key={k}><b style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, marginRight: 5, background: LEVEL_COLORS[k] }} />{text}</span>
        ))}
      </div>
    </Card>
  )
}

function RouteCard({ d }) {
  return (
    <Card title="ROUTE AND FIRs">
      <div><Chip code={d.dep} role="DEPARTURE" /><Chip code={d.arr} role="ARRIVAL" /></div>
      <div style={{ ...mono, fontSize: 12, lineHeight: 1.7, marginTop: 6, overflowWrap: 'anywhere' }}>{d.route}</div>
      {d.firs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cp-border3)', paddingTop: 10, marginTop: 12 }}>
          <div className="cp-label" style={{ margin: '0 0 6px' }}>FIRs IN ORDER · TIME INTO FLIGHT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '8px 4px' }}>
            {d.firs.map((f, i) => (
              <div key={f.icao} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ textAlign: 'center' }}>
                  <Chip code={f.icao} />
                  <div style={{ ...mono, fontSize: 11, ...dim }}>{fmtHm(f.min) ?? ' '}</div>
                </div>
                {i < d.firs.length - 1 && <span style={{ ...dim, paddingTop: 4, fontSize: 11 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function AlternatesCard({ d }) {
  const stats = a => [
    ['DIST', a.distNm != null && `${a.distNm} NM`], ['LEVEL', a.fl != null && `FL${a.fl}`], ['W/C', a.wc != null && `${fmtWc(a.wc)} kt`],
    ['TIME', fmtHm(a.min)], ['FUEL', a.fuel != null && kg(a.fuel)], ['MORA', a.mora != null && `${kg(a.mora)} ft`],
  ].filter(([, v]) => v)
  const notes = [d.takeoffAlt && `Take-off alternate: ${d.takeoffAlt}.`, d.edto && `EDTO/ETP: ${d.edto}.`].filter(Boolean)
  return (
    <Card title="ALTERNATES">
      {d.alternates.map((a, i) => (
        <div key={a.icao} style={{ borderTop: i ? '1px solid var(--cp-border3)' : 'none', paddingTop: i ? 12 : 0, marginBottom: 12 }}>
          <div><Chip code={a.icao} role={`DESTINATION ALTERNATE ${i + 1}`} /><span style={{ fontSize: 11, ...dim }}>ALT {i + 1}{lookupAirport(a.icao)?.name && ` · ${lookupAirport(a.icao).name}`}</span></div>
          <div style={{ ...mono, fontSize: 12, lineHeight: 1.7, marginTop: 6, overflowWrap: 'anywhere' }}>{a.route}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: 8, marginTop: 8 }}>
            {stats(a).map(([label, value]) => <Field key={label} label={label} value={value} />)}
          </div>
        </div>
      ))}
      {d.enrouteAlts.length > 0 && (
        <div style={{ borderTop: d.alternates.length ? '1px solid var(--cp-border3)' : 'none', paddingTop: d.alternates.length ? 10 : 0 }}>
          <div className="cp-label" style={{ margin: '0 0 6px' }}>ENROUTE</div>
          {d.enrouteAlts.map((c, i) => <Chip key={c} code={c} role={`ENROUTE ALTERNATE ${i + 1}`} />)}
        </div>
      )}
      {notes.length > 0 && <div style={{ fontSize: 11, marginTop: 8, ...dim }}>{notes.join(' ')}</div>}
    </Card>
  )
}

function RemarksCard({ r }) {
  const rows = [
    r.occ.length > 0 && ['OCC contact', r.occ.join(' · ')],
    r.melCdl && ['MEL/CDL', r.melCdl],
    ...r.notes.map(n => [`Note ${n.n}`, n.text]),
    r.notam && ['NOTAM', r.notam],
  ].filter(Boolean)
  if (!rows.length) return null
  return (
    <Card title="DISPATCH REMARKS" style={{ marginBottom: 0 }}>
      {rows.map(([label, value], i) => <KV key={label} label={label} value={value} last={i === rows.length - 1} />)}
    </Card>
  )
}

export default function FlightDetailsTab({ d }) {
  const hasAlternates = d.alternates.length > 0 || d.enrouteAlts.length > 0 || d.takeoffAlt || d.edto
  return (
    <>
      <BoardingPass d={d} />
      {(d.fuel || d.weights) && (
        <div style={grid2}>
          {d.fuel && <FuelCard fuel={d.fuel} />}
          {d.weights && <WeightsCard w={d.weights} />}
        </div>
      )}
      <RouteCard d={d} />
      {hasAlternates && <AlternatesCard d={d} />}
      <RemarksCard r={d.remarks} />
    </>
  )
}
