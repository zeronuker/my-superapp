import { useState, useEffect, useRef } from 'react'

const mono = 'var(--cb-font-mono)'

const lblStyle = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--cp-dim)', display: 'block', marginBottom: 3,
}
const secLabel = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'var(--cp-muted)', margin: '16px 0 8px',
}

function Field({ label, value, onChange }) {
  return (
    <div>
      {label && <label style={lblStyle}>{label}</label>}
      <input className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
        value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
    </div>
  )
}

function Aircraft({ logId, aircraft, index, total, actions }) {
  const set = (patch) => actions.updateAircraft(logId, aircraft.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderRadius: 6, padding: 10, marginBottom: 9, background: 'var(--cp-bg2)' }}>
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
        <Field label="MTOW"         value={aircraft.mtow} onChange={f('mtow')} />
        <Field label="MLW"          value={aircraft.mlw}  onChange={f('mlw')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, alignItems: 'start' }}>
        <div>
          <label style={{ ...lblStyle, color: 'var(--cp-dim)' }}>Configuration</label>
          <input className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
            value={aircraft.config} onChange={(e) => f('config')(e.target.value.toUpperCase())} />
        </div>
        <div style={{ gridColumn: '2 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9,
          background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6, padding: '9px 10px' }}>
          <div>
            <label style={{ ...lblStyle, color: 'var(--cp-acc)' }}>DOW</label>
            <input className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
              value={aircraft.dow} onChange={(e) => f('dow')(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label style={{ ...lblStyle, color: 'var(--cp-acc)' }}>DOI</label>
            <input className="cp-input" style={{ fontSize: 11, padding: '6px 7px' }}
              value={aircraft.doi} onChange={(e) => f('doi')(e.target.value.toUpperCase())} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Sector({ logId, sector, index, total, actions, onRemarks }) {
  const set = (patch) => actions.updateSector(logId, sector.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const hasRemark = (sector.remark || '').trim().length > 0
  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderRadius: 6, padding: 10, marginBottom: 9, background: 'var(--cp-bg2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)',
          background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px' }}>
          SECTOR #{index + 1}
        </span>
        {total > 1 && (
          <button onClick={() => actions.removeSector(logId, sector.id)} aria-label="remove sector"
            className="cp-btn" style={{ padding: '2px 7px', color: 'var(--cp-red)' }}>✕</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7, marginBottom: 7 }}>
        <Field label="FLT No" value={sector.fltNo} onChange={f('fltNo')} />
        <Field label="From"   value={sector.from}  onChange={f('from')} />
        <Field label="To"     value={sector.dest}  onChange={f('dest')} />
        <Field label="PAX"    value={sector.pax}   onChange={f('pax')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 7 }}>
        <Field label="Fuel Off Block" value={sector.fuelOff} onChange={f('fuelOff')} />
        <Field label="Fuel On Block"  value={sector.fuelOn}  onChange={f('fuelOn')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 }}>
        <Field label="Off Block" value={sector.offBlk}  onChange={f('offBlk')} />
        <Field label="T/O"       value={sector.takeoff} onChange={f('takeoff')} />
        <Field label="LDG"       value={sector.ldg}     onChange={f('ldg')} />
        <Field label="On Block"  value={sector.onBlk}   onChange={f('onBlk')} />
      </div>

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px dashed var(--cp-border2)', paddingTop: 8, marginTop: 9 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--cp-dim)', whiteSpace: 'nowrap' }}>ENG OUT</span>
        <div style={{ flex: 1 }}><Field label="N1"  value={sector.engN1}  onChange={f('engN1')} /></div>
        <div style={{ flex: 1 }}><Field label="ALT" value={sector.engAlt} onChange={f('engAlt')} /></div>
        <div style={{ flex: 1 }}><Field label="IAS" value={sector.engIas} onChange={f('engIas')} /></div>
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
      {(log.aircraft || []).map((a, i) => (
        <Aircraft key={a.id} logId={log.id} aircraft={a} index={i}
          total={(log.aircraft || []).length} actions={actions} />
      ))}

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SECTORS</span>
        <button onClick={() => actions.addSector(log.id)} className="cp-btn"
          style={{ padding: '4px 8px', color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }}>+ ADD SECTOR</button>
      </div>
      {log.sectors.map((s, i) => (
        <Sector key={s.id} logId={log.id} sector={s} index={i} total={log.sectors.length}
          actions={actions} onRemarks={setRemarkSid} />
      ))}

      <div style={secLabel}>NOTES</div>
      <textarea className="cp-input" rows={3} style={{ resize: 'vertical' }}
        value={log.notes} onChange={(e) => f('notes')(e.target.value)} />

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>CREW</span>
        <button onClick={() => actions.addCrew(log.id)} className="cp-btn" style={{ padding: '4px 8px' }}>+ ADD</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 4 }}>
        <label style={lblStyle}>Name</label>
        <label style={lblStyle}>Position</label>
        <span />
      </div>
      {log.crew.map((c) => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 7, alignItems: 'center' }}>
          <Field value={c.name} onChange={(v) => actions.updateCrew(log.id, c.id, { name: v })} />
          <Field value={c.position} onChange={(v) => actions.updateCrew(log.id, c.id, { position: v })} />
          <button onClick={() => actions.removeCrew(log.id, c.id)} aria-label="remove crew"
            className="cp-btn" style={{ padding: '4px 8px', color: 'var(--cp-red)' }}>✕</button>
        </div>
      ))}

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
