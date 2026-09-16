import { useState, useEffect, useRef } from 'react'
import { sectorStripeColors, aircraftStripeColors } from '../utils/sectorColors'
import { formatHHMM } from '../utils/formatHHMM'

const mono = 'var(--cb-font-mono)'

const lblStyle = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--cp-dim)', display: 'block', marginBottom: 3,
}
const secLabel = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'var(--cp-muted)', margin: '16px 0 8px',
}

const unitStyle = (position) => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  [position === 'prefix' ? 'left' : 'right']: 7,
  fontFamily: mono, fontSize: 10, color: 'var(--cp-acc)', pointerEvents: 'none',
})

function Field({ label, value, onChange, numeric, time, unit, unitPosition = 'suffix' }) {
  const handleChange = (e) => onChange(time ? formatHHMM(e.target.value) : e.target.value.toUpperCase())
  const inputStyle = { fontSize: 11, padding: '6px 7px' }
  if (unit) {
    const pad = 14 + unit.length * 6
    if (unitPosition === 'prefix') inputStyle.paddingLeft = pad
    else inputStyle.paddingRight = pad
  }
  const input = (
    <input className="cp-input" style={inputStyle}
      inputMode={numeric || time ? 'numeric' : undefined} pattern={numeric || time ? '[0-9]*' : undefined}
      value={time ? formatHHMM(value) : value} onChange={handleChange} />
  )
  return (
    <div>
      {label && <label style={lblStyle}>{label}</label>}
      {unit ? (
        <div style={{ position: 'relative' }}>
          {input}
          <span style={unitStyle(unitPosition)}>{unit}</span>
        </div>
      ) : input}
    </div>
  )
}

function Aircraft({ logId, aircraft, index, total, actions }) {
  const set = (patch) => actions.updateAircraft(logId, aircraft.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const stripeColor = aircraftStripeColors[index % aircraftStripeColors.length]
  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderLeft: `3px solid ${stripeColor}`, borderRadius: 6, padding: 10, background: 'var(--cp-bg2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)',
          background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px' }}>
          AIRCRAFT #{index + 1}
        </span>
        {total > 1 && (
          <button onClick={() => actions.removeAircraft(logId, aircraft.id)} aria-label="remove aircraft"
            className="cp-btn" style={{ padding: '2px 7px', color: 'var(--cp-red)' }}>✕</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7, marginBottom: 7 }}>
        <Field label="Registration" value={aircraft.reg}  onChange={f('reg')} />
        <Field label="Type"         value={aircraft.type} onChange={f('type')} />
        <Field label="MTOW"         value={aircraft.mtow} onChange={f('mtow')} numeric unit="KG" />
        <Field label="MLW"          value={aircraft.mlw}  onChange={f('mlw')} numeric unit="KG" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, alignItems: 'start' }}>
        <div>
          <label style={{ ...lblStyle, color: 'var(--cp-dim)' }}>Configuration</label>
          <input className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
            inputMode="tel"
            value={aircraft.config} onChange={(e) => f('config')(e.target.value.toUpperCase())} />
        </div>
        <div style={{ gridColumn: '2 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9,
          background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6, padding: '9px 10px' }}>
          <div>
            <label style={{ ...lblStyle, color: 'var(--cp-acc)' }}>DOW</label>
            <div style={{ position: 'relative' }}>
              <input className="cp-input" style={{ fontSize: 11, padding: '6px 26px 6px 7px' }}
                inputMode="numeric" pattern="[0-9]*"
                value={aircraft.dow} onChange={(e) => f('dow')(e.target.value.toUpperCase())} />
              <span style={unitStyle('suffix')}>KG</span>
            </div>
          </div>
          <div>
            <label style={{ ...lblStyle, color: 'var(--cp-acc)' }}>DOI</label>
            <div style={{ position: 'relative' }}>
              <input className="cp-input" style={{ fontSize: 11, padding: '6px 38px 6px 7px' }}
                inputMode="numeric" pattern="[0-9]*"
                value={aircraft.doi} onChange={(e) => f('doi')(e.target.value.toUpperCase())} />
              <span style={unitStyle('suffix')}>I.U.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Sector({ logId, sector, index, total, actions, onRemarks, aircraftList }) {
  const set = (patch) => actions.updateSector(logId, sector.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const hasRemark = (sector.remark || '').trim().length > 0
  const stripeColor = sectorStripeColors[index % sectorStripeColors.length]

  const showAcftChip = aircraftList.length > 1
  let selIndex = aircraftList.findIndex(a => a.id === sector.aircraftId)
  if (selIndex === -1) selIndex = 0
  const selAcft = aircraftList[selIndex]
  const otherAcft = aircraftList[selIndex === 0 ? 1 : 0]
  const acftColor = aircraftStripeColors[selIndex % aircraftStripeColors.length]

  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderLeft: `3px solid ${stripeColor}`, borderRadius: 6, padding: 10, background: 'var(--cp-bg2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)',
            background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px' }}>
            SECTOR #{index + 1}
          </span>
          {showAcftChip && (
            <button onClick={() => set({ aircraftId: otherAcft.id })} aria-label="swap aircraft for this sector"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', fontWeight: 500,
                padding: '2px 7px', borderRadius: 4, border: `1px solid ${acftColor}`,
                color: acftColor, background: `${acftColor}22`,
              }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: acftColor }} />
              {(selAcft.reg || `ACFT ${selIndex + 1}`).toUpperCase()}
              <span style={{ opacity: 0.6 }}>⇄</span>
            </button>
          )}
        </div>
        {total > 1 && (
          <button onClick={() => actions.removeSector(logId, sector.id)} aria-label="remove sector"
            className="cp-btn" style={{ padding: '2px 7px', color: 'var(--cp-red)' }}>✕</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7, marginBottom: 7 }}>
        <Field label="FLT No" value={sector.fltNo} onChange={f('fltNo')} />
        <Field label="From"   value={sector.from}  onChange={f('from')} />
        <Field label="To"     value={sector.dest}  onChange={f('dest')} />
        <Field label="PAX"    value={sector.pax}   onChange={f('pax')} numeric />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 7 }}>
        <Field label="Fuel Off Block" value={sector.fuelOff} onChange={f('fuelOff')} numeric unit="KG" />
        <Field label="Fuel On Block"  value={sector.fuelOn}  onChange={f('fuelOn')} numeric unit="KG" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 }}>
        <Field label="Off Block" value={sector.offBlk}  onChange={f('offBlk')} time />
        <Field label="T/O"       value={sector.takeoff} onChange={f('takeoff')} time />
        <Field label="LDG"       value={sector.ldg}     onChange={f('ldg')} time />
        <Field label="On Block"  value={sector.onBlk}   onChange={f('onBlk')} time />
      </div>

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px dashed var(--cp-border2)', paddingTop: 8, marginTop: 9 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--cp-dim)', whiteSpace: 'nowrap' }}>ENG OUT</span>
        <div style={{ flex: 1 }}><Field label="N1"  value={sector.engN1}  onChange={f('engN1')} numeric unit="%" /></div>
        <div style={{ flex: 1 }}><Field label="ALT" value={sector.engAlt} onChange={f('engAlt')} numeric unit="FL" unitPosition="prefix" /></div>
        <div style={{ flex: 1 }}><Field label="IAS" value={sector.engIas} onChange={f('engIas')} numeric unit="KTS" /></div>
      </div>

      <button onClick={() => onRemarks(sector.id)} style={{
        width: '100%', marginTop: 9, fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', cursor: 'pointer',
        borderRadius: 6, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        color: hasRemark ? 'var(--cp-acc)' : 'var(--cp-muted)',
        border: `1px ${hasRemark ? 'solid var(--cp-acc)' : 'dashed var(--cp-border)'}`,
        background: hasRemark ? 'var(--cp-accdim)' : 'transparent',
      }}>
        {hasRemark ? 'REMARKS' : '+ ADD REMARKS'}
      </button>
    </div>
  )
}

function RemarksModal({ sector, index, onSave, onCancel }) {
  const [text, setText] = useState(sector.remark || '')
  const wrapRef = useRef()
  const taRef = useRef()

  useEffect(() => { taRef.current?.focus() }, [])

  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      const els = wrapRef.current?.querySelectorAll('textarea, button')
      if (!els?.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onCancel])

  return (
    <div ref={wrapRef} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 5,
    }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'var(--cp-bg2)', border: '1px solid var(--cp-acc)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-txt)', marginBottom: 4 }}>
          SECTOR #{index + 1} — REMARKS
        </div>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)', marginBottom: 10 }}>
          FREE TEXT · SAVED WITH THIS SECTOR
        </div>
        <textarea ref={taRef} className="cp-input" value={text} onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 120, resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <button onClick={onCancel} className="cp-btn" style={{ flex: 1 }}>CANCEL</button>
          <button onClick={() => onSave(text)} className="cp-btn"
            style={{ flex: 1, color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }}>
            SAVE REMARKS
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LogEditor({ log, actions, onBack }) {
  const [remarkSid, setRemarkSid] = useState(null)
  const [saveState, setSaveState] = useState('SAVED')
  const firstRun = useRef(true)
  const timer = useRef()

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    setSaveState('SAVING…')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaveState('SAVED'), 600)
    return () => clearTimeout(timer.current)
  }, [log.updatedAt])

  const set = (patch) => actions.updateLog(log.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const remarkSector = log.sectors.find(s => s.id === remarkSid)
  const remarkIndex = log.sectors.findIndex(s => s.id === remarkSid)
  const atMaxAircraft = (log.aircraft || []).length >= 2
  const atMaxSectors = log.sectors.length >= 8

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--cp-border)', paddingBottom: 10, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} className="cp-btn" aria-label="back" style={{ padding: '4px 9px' }}>←</button>
          <div>
            <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>EDIT LOG</div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-acc)' }}>{saveState}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 180 }}>
        <label style={lblStyle}>Date (UTC)</label>
        <input type="date" className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
          value={log.date} onChange={(e) => f('date')(e.target.value)} />
      </div>

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>AIRCRAFT</span>
        <button
          onClick={() => !atMaxAircraft && actions.addAircraft(log.id)}
          disabled={atMaxAircraft}
          className="cp-btn"
          style={{
            padding: '4px 8px',
            color: atMaxAircraft ? 'var(--cp-dim)' : 'var(--cp-acc)',
            borderColor: atMaxAircraft ? 'var(--cp-border)' : 'var(--cp-acc)',
            background: atMaxAircraft ? 'transparent' : 'var(--cp-accdim)',
            cursor: atMaxAircraft ? 'not-allowed' : 'pointer',
            opacity: atMaxAircraft ? 0.55 : 1,
          }}
        >
          {atMaxAircraft ? 'MAX 2 AIRCRAFT PER DUTY' : '+ ADD AIRCRAFT'}
        </button>
      </div>
      <div className="dutylog-aircraft-list" style={{ marginBottom: 9 }}>
        {(log.aircraft || []).map((a, i) => (
          <Aircraft key={a.id} logId={log.id} aircraft={a} index={i}
            total={(log.aircraft || []).length} actions={actions} />
        ))}
      </div>

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SECTORS</span>
        <button
          onClick={() => !atMaxSectors && actions.addSector(log.id)}
          disabled={atMaxSectors}
          className="cp-btn"
          style={{
            padding: '4px 8px',
            color: atMaxSectors ? 'var(--cp-dim)' : 'var(--cp-acc)',
            borderColor: atMaxSectors ? 'var(--cp-border)' : 'var(--cp-acc)',
            background: atMaxSectors ? 'transparent' : 'var(--cp-accdim)',
            cursor: atMaxSectors ? 'not-allowed' : 'pointer',
            opacity: atMaxSectors ? 0.55 : 1,
          }}
        >
          {atMaxSectors ? 'MAX 8 SECTORS PER DUTY' : '+ ADD SECTOR'}
        </button>
      </div>
      <div className="dutylog-sector-list" style={{ marginBottom: 9 }}>
        {log.sectors.map((s, i) => (
          <Sector key={s.id} logId={log.id} sector={s} index={i} total={log.sectors.length}
            actions={actions} onRemarks={setRemarkSid} aircraftList={log.aircraft || []} />
        ))}
      </div>

      <div style={secLabel}>NOTES</div>
      <textarea className="cp-input" rows={3} style={{ resize: 'vertical' }}
        value={log.notes} onChange={(e) => f('notes')(e.target.value)} />

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>CREW</span>
        <button onClick={() => actions.addCrew(log.id)} className="cp-btn" style={{ padding: '4px 8px' }}>+ ADD</button>
      </div>
      <div className="dutylog-crew-header-single" style={{ gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 4 }}>
        <label style={lblStyle}>Name</label>
        <label style={lblStyle}>Position</label>
        <span />
      </div>
      <div className="dutylog-crew-columns">
        {[log.crew.slice(0, Math.ceil(log.crew.length / 2)), log.crew.slice(Math.ceil(log.crew.length / 2))].map((col, ci) => (
          <div key={ci} className="dutylog-crew-col">
            <div className="dutylog-crew-header-col" style={{ gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 4 }}>
              <label style={lblStyle}>Name</label>
              <label style={lblStyle}>Position</label>
              <span />
            </div>
            {col.map((c) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 7, alignItems: 'center' }}>
                <Field value={c.name} onChange={(v) => actions.updateCrew(log.id, c.id, { name: v })} />
                <Field value={c.position} onChange={(v) => actions.updateCrew(log.id, c.id, { position: v })} />
                <button onClick={() => actions.removeCrew(log.id, c.id)} aria-label="remove crew"
                  className="cp-btn" style={{ padding: '4px 8px', color: 'var(--cp-red)' }}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {remarkSector && (
        <RemarksModal
          sector={remarkSector}
          index={remarkIndex}
          onCancel={() => setRemarkSid(null)}
          onSave={(text) => { actions.updateSector(log.id, remarkSid, { remark: text }); setRemarkSid(null) }}
        />
      )}
    </div>
  )
}
