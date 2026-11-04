import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../../useScrollLock'
import { aircraftStripeColors, aircraftChip, sectorRowColors } from '../utils/sectorColors'
import { pickSelected, neighbour, rowText, aircraftText } from '../utils/sectorNav'
import { formatHHMM } from '../utils/formatHHMM'
import { usePresence, animDurationMs } from '../../../useTransitionAnim'
import Collapse from '../../../components/Collapse'
import ChamferFrame from '@brand/ChamferFrame'
import useDutyLogStore from '../store/dutylogStore'
import { useCalculatorStore } from '../../../store/calculatorStore'
import { resolveLinks, rankBriefings } from '../../../utils/briefingLink'
import { editedParts, linksToAsk } from '../../../utils/logEdits'
import { setLeaveGuard } from '../../../utils/leaveGuard'
import { writeLink, clearLink, takeSnapshot, restoreSnapshot } from '../../../services/linkSave'
import LinkPicker from '../../../components/LinkPicker'
import LinkKeepPrompt from '../../../components/LinkKeepPrompt'
import { LinkChip, LinkLine } from '../../../components/LinkChips'
import { briefingItem, briefingName, linkedSectorName } from '../../../components/linkItems'

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

// Same test as the wide-screen rules in index.css: iPad, desktop and phone in landscape are "wide".
const WIDE_QUERY = '(orientation: landscape), (min-width: 640px)'
function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(WIDE_QUERY)
    const on = () => setWide(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

// ── Folded rows: one line per aircraft / sector, tap to open ──
const badgeStyle = { fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)', background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px', flexShrink: 0 }
const rowStyle = (color, selected) => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
  ...frame(color, selected ? color : 'var(--cp-border2)', 4), borderRadius: 6,
  padding: '9px 10px', background: selected ? `color-mix(in srgb, ${color} 12%, var(--cp-bg2))` : 'var(--cp-bg2)',
  fontFamily: mono, fontSize: 10, color: 'var(--cp-txt)',
})
// Border as separate width / style / colour props. A `border` shorthand next to a `borderLeft` longhand makes React drop the
// coloured left edge the next time the shorthand changes (it did, when a row was tapped open or folded).
const frame = (edge, rest, leftWidth) => ({ borderStyle: 'solid', borderWidth: `1px 1px 1px ${leftWidth}px`, borderColor: `${rest} ${rest} ${rest} ${edge}` })
const rowMain = { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const addBtnStyle = (atMax) => ({
  padding: '4px 8px',
  color: atMax ? 'var(--cp-dim)' : 'var(--cp-acc)',
  borderColor: atMax ? 'var(--cp-border)' : 'var(--cp-acc)',
  background: atMax ? 'transparent' : 'var(--cp-accdim)',
  cursor: atMax ? 'not-allowed' : 'pointer',
  opacity: atMax ? 0.55 : 1,
})

// The aircraft ▾ / ▴: a large button so a thumb can hit it, kept well away from the REMOVE button at the card's foot.
const bigArrow = { width: 34, height: 30, display: 'grid', placeItems: 'center', flexShrink: 0, border: '1px solid var(--cp-border)', borderRadius: 5, color: 'var(--cp-txt)', fontSize: 17, lineHeight: 1, background: 'transparent' }
const removeBtn = { fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', whiteSpace: 'nowrap', cursor: 'pointer', padding: '7px 9px', borderRadius: 5, color: 'var(--cp-red)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--cp-red) 55%, transparent)' }

// "Remove sector #3? … CANCEL  REMOVE" — nothing is deleted until REMOVE is tapped.
function ConfirmRemove({ text, onCancel, onConfirm }) {
  return (
    <div role="alertdialog" style={{ marginTop: 8, border: '1px solid var(--cp-red)', borderRadius: 6, padding: '8px 10px',
      background: 'color-mix(in srgb, var(--cp-red) 8%, var(--cp-bg2))', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 140, fontFamily: mono, fontSize: 10, color: 'var(--cp-txt)', lineHeight: 1.5 }}>{text}</span>
      <button onClick={onCancel} className="cp-btn" style={{ padding: '5px 9px', fontSize: 10 }}>CANCEL</button>
      <button onClick={onConfirm} style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, border: '1px solid var(--cp-red)', background: '#b91c1c', color: '#fff' }}>REMOVE</button>
    </div>
  )
}

function AircraftRow({ aircraft, index, onOpen }) {
  const color = aircraftStripeColors[index % aircraftStripeColors.length]
  const t = aircraftText(aircraft)
  return (
    <button type="button" onClick={onOpen} aria-label={`open aircraft ${index + 1}`} style={{ ...rowStyle(color, false), padding: '6px 8px 6px 10px' }}>
      <span style={badgeStyle}>#{index + 1}</span>
      <span style={rowMain}><b style={{ fontWeight: 600 }}>{t.main}</b><span style={{ color: 'var(--cp-dim)' }}>{t.rest}</span></span>
      <span style={bigArrow} aria-hidden="true">▾</span>
    </button>
  )
}

// Phone: one aircraft is a one-line row or, once opened, its card. Keeps the card on screen for its fold-away animation.
function PhoneAircraft({ logId, aircraft, index, total, actions, open, onToggle }) {
  const presence = usePresence(open)
  return presence.mounted
    ? <Aircraft logId={logId} aircraft={aircraft} index={index} total={total} actions={actions}
        onClose={onToggle} closing={presence.closing} />
    : <AircraftRow aircraft={aircraft} index={index} onOpen={onToggle} />
}

function Aircraft({ logId, aircraft, index, total, actions, onClose, closing = false }) {
  const [confirming, setConfirming] = useState(false)
  const set = (patch) => actions.updateAircraft(logId, aircraft.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const stripeColor = aircraftStripeColors[index % aircraftStripeColors.length]
  return (
    <div className={`dutylog-open cp-reveal-in${closing ? ' is-closing' : ''}`} style={{ ...frame(stripeColor, stripeColor, 5), borderRadius: 6, padding: 10, background: 'var(--cp-bg2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ ...badgeStyle, color: 'var(--cp-txt)' }}>
          AIRCRAFT #{index + 1}
        </span>
        {onClose && <button onClick={onClose} aria-label={`close aircraft ${index + 1}`} style={{ ...bigArrow, cursor: 'pointer' }}>▴</button>}
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
      {total > 1 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--cp-border2)' }}>
          <button onClick={() => setConfirming(true)} aria-label="remove aircraft" style={removeBtn}>✕ &nbsp;REMOVE AIRCRAFT</button>
          {confirming && (
            <ConfirmRemove text={`Remove aircraft ${aircraft.reg || `#${index + 1}`}? Its sectors will be left without an aircraft.`}
              onCancel={() => setConfirming(false)} onConfirm={() => actions.removeAircraft(logId, aircraft.id)} />
          )}
        </div>
      )}
    </div>
  )
}

function SectorRow({ sector, index, selected, color, chip, chipColor, onSelect }) {
  const t = rowText(sector)
  return (
    <button type="button" className="dutylog-srow" data-sector-id={sector.id} onClick={onSelect}
      aria-label={`open sector ${index + 1}`} aria-current={selected ? 'true' : undefined} style={rowStyle(color, selected)}>
      <span style={selected ? { ...badgeStyle, background: 'var(--cp-bg)' } : badgeStyle}>#{index + 1}</span>
      <span style={rowMain}><b style={{ fontWeight: 600 }}>{t.flight}</b> <span style={{ color: 'var(--cp-dim)' }}>{t.route}</span></span>
      {chip && (
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, flexShrink: 0,
          ...aircraftChip(chipColor) }}>{chip}</span>
      )}
      {selected && <span style={{ color }} aria-hidden="true">●</span>}
    </button>
  )
}

// Foot of the open sector: REMOVE SECTOR on the left, ‹ SECTOR 3 of 8 › on the right (each end greyed out).
function SectorFooter({ index, total, onPrev, onNext, onRemove }) {
  const btn = (disabled) => ({
    width: 36, height: 30, padding: 0, fontSize: 16, lineHeight: 1,
    color: disabled ? 'var(--cp-dim)' : 'var(--cp-acc)', borderColor: disabled ? 'var(--cp-border)' : 'var(--cp-acc)',
    background: disabled ? 'transparent' : 'var(--cp-accdim)', opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
  })
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTop: '1px dashed var(--cp-border2)' }}>
      {onRemove ? <button onClick={onRemove} aria-label="remove sector" style={removeBtn}>✕ REMOVE SECTOR</button> : <span />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="cp-btn" aria-label="previous sector" disabled={index === 0} onClick={onPrev} style={btn(index === 0)}>‹</button>
        <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', whiteSpace: 'nowrap', color: 'var(--cp-txt)' }}>
          <span style={{ color: 'var(--cp-dim)' }}>SECTOR</span> {index + 1} <span style={{ color: 'var(--cp-dim)' }}>of</span> {total}
        </span>
        <button className="cp-btn" aria-label="next sector" disabled={index === total - 1} onClick={onNext} style={btn(index === total - 1)}>›</button>
      </div>
    </div>
  )
}

// The one open sector: all its fields, framed in its row's colour (thicker on the left).
function SectorEditor({ logId, sector, index, total, color, actions, onRemarks, aircraftList, link, onOpenLink, onPickLink, onUnlink, onPrev, onNext }) {
  const set = (patch) => actions.updateSector(logId, sector.id, patch)
  const f = (key) => (v) => set({ [key]: v })
  const [confirming, setConfirming] = useState(false)
  const hasRemark = (sector.remark || '').trim().length > 0

  const showAcftChip = aircraftList.length > 1
  let selIndex = aircraftList.findIndex(a => a.id === sector.aircraftId)
  if (selIndex === -1) selIndex = 0
  const selAcft = aircraftList[selIndex]
  const otherAcft = aircraftList[selIndex === 0 ? 1 : 0]
  const acftColor = aircraftStripeColors[selIndex % aircraftStripeColors.length]

  return (
    <div className="dutylog-open cp-reveal-in" data-sector-editor style={{ ...frame(color, color, 5), borderRadius: 6, padding: 10, background: 'var(--cp-bg2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...badgeStyle, color }}>
            SECTOR #{index + 1}
          </span>
          {showAcftChip && (
            <button onClick={() => set({ aircraftId: otherAcft.id })} aria-label="swap aircraft for this sector"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', fontWeight: 500,
                padding: '2px 7px', borderRadius: 4, ...aircraftChip(acftColor),
              }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              {(selAcft.reg || `ACFT ${selIndex + 1}`).toUpperCase()}
              <span style={{ opacity: 0.6 }}>⇄</span>
            </button>
          )}
          <LinkChip linked={!!link} tone="amber" label="BRIEFING" emptyLabel="LINK BRIEFING"
            onClick={() => (link ? onOpenLink(link.saveId) : onPickLink(sector.id))} />
        </div>
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

      {link && (
        <LinkLine style={{ marginTop: 8, textAlign: 'center' }}
          text={`Briefing linked by you · ${link.name}`}
          onChange={() => onPickLink(sector.id)} onUnlink={() => onUnlink(sector.id)} />
      )}

      <SectorFooter index={index} total={total} onPrev={onPrev} onNext={onNext} onRemove={total > 1 ? () => setConfirming(true) : null} />
      {confirming && (
        <ConfirmRemove text={`Remove sector #${index + 1}${sector.fltNo ? ` (${sector.fltNo})` : ''}? This cannot be undone.`}
          onCancel={() => setConfirming(false)} onConfirm={() => actions.removeSector(logId, sector.id)} />
      )}
    </div>
  )
}

function RemarksModal({ sector, index, onSave, onCancel, closing }) {
  useScrollLock(true)
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

  // In <body>, not inside the app (its text-size zoom would skew the keyboard-area sizes); it sits
  // in the visible area above the on-screen keyboard (see keyboardArea.js).
  return createPortal(
    <div ref={wrapRef} className={`cp-backdrop-in${closing ? ' is-closing' : ''}`} style={{
      position: 'fixed', top: 'var(--kb-top, 0px)', left: 0, right: 0, height: 'var(--kb-h, 100%)', transition: 'top 0.15s ease, height 0.15s ease', background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 5,
    }}>
      <ChamferFrame className={`cp-pop-in${closing ? ' is-closing' : ''}`} pad="14px"
        style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(var(--kb-h, 100dvh) - 36px)', overflowY: 'auto' }}>
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
      </ChamferFrame>
    </div>,
    document.body
  )
}

// One crew row. A row added after the editor opened grows in; deleting one
// collapses it out first and only then asks the store to drop it.
function CrewRow({ crew, animateIn, onChange, onRemove }) {
  const [shown, setShown] = useState(!animateIn)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef(null)
  useEffect(() => {
    if (animateIn) setShown(true)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const remove = () => {
    if (leaving) return
    const ms = animDurationMs()
    if (!ms) { onRemove(); return }
    setLeaving(true)
    timer.current = setTimeout(onRemove, ms)
  }
  return (
    <Collapse open={shown && !leaving}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 7, marginBottom: 7, alignItems: 'center' }}>
        <Field value={crew.name} onChange={(v) => onChange({ name: v })} />
        <Field value={crew.position} onChange={(v) => onChange({ position: v })} />
        <button onClick={remove} aria-label="remove crew"
          className="cp-btn" style={{ padding: '4px 8px', color: 'var(--cp-red)' }}>✕</button>
      </div>
    </Collapse>
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

  // Briefing links. The picker keeps its sector id after closing so it can finish its exit animation.
  const allLogs = useDutyLogStore(s => s.logs)
  const saves = useCalculatorStore(s => s.briefing.saves)
  const openSavedBriefing = useCalculatorStore(s => s.openSavedBriefing)
  const links = useMemo(() => resolveLinks(allLogs, saves), [allLogs, saves])
  const [pickSid, setPickSid] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const pickSector = log.sectors.find(s => s.id === pickSid)
  const linkOf = (s) => {
    const l = links.bySector.get(s.id)
    const save = l && saves.find(b => b.id === l.saveId)
    return save ? { ...l, name: briefingName(save) } : null
  }
  const startPick = (sid) => { setPickSid(sid); setPickOpen(true) }
  const pickItems = pickSector
    ? rankBriefings(log, pickSector, saves).map(r => {
        const taken = links.bySave.get(r.save.id)
        return briefingItem(r, taken && taken.sectorId !== pickSector.id ? linkedSectorName(allLogs, taken) : null)
      })
    : []
  const pickBriefing = (saveId) => { writeLink(log.id, pickSid, saveId); setPickOpen(false) }
  const unlink = (sid) => clearLink(log.id, sid)

  // Leaving after an edit asks, for each link the log had when opened, whether to keep it. The snapshot is
  // what UNDO CHANGES puts back: the log, and every link field in the app.
  const opened = useRef(null)
  if (!opened.current) opened.current = takeSnapshot(log.id)
  const [ask, setAsk] = useState(null)
  // `proceed` is where the pilot was heading: the list (←), or HOME / another tab (via the leave guard).
  const leave = (proceed = onBack) => {
    const was = opened.current
    const asked = linksToAsk(was.log, log, was.links, links.bySector).filter(l => saves.some(b => b.id === l.saveId))
    if (!asked.length) { proceed(); return }
    const { sectorIds, other } = editedParts(was.log, log)
    const num = (id) => log.sectors.findIndex(s => s.id === id) + 1
    const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
    const nums = asked.map(l => `#${num(l.sectorId)}`)
    setAsk({
      proceed,
      links: asked,
      title: other.length ? 'LOG EDITED' : `SECTOR${nums.length > 1 ? 'S' : ''} ${andList(nums).toUpperCase()} EDITED`,
      subtitle: other.length
        ? `You changed ${andList([...other, ...sectorIds.map(id => `sector #${num(id)}`)])}. This can affect every link in this log. Choose for each one.`
        : nums.length > 1 ? 'These sectors are linked to briefings. Choose for each one.' : 'This sector is linked to a briefing. Keep the link or discard it?',
      rows: asked.map(l => {
        const s = log.sectors.find(x => x.id === l.sectorId)
        return {
          key: l.sectorId,
          title: `SECTOR #${num(l.sectorId)} · ${s.fltNo || '—'} · ${s.from || '—'} → ${s.dest || '—'}`,
          sub: `Briefing ${briefingName(saves.find(b => b.id === l.saveId))}`,
        }
      }),
    })
  }
  const confirmLeave = (choices) => {
    for (const l of ask.links) if (choices[l.sectorId] === 'discard') clearLink(log.id, l.sectorId)
    const { proceed } = ask
    setAsk(null)
    proceed()
  }
  const undoEdits = () => { restoreSnapshot(opened.current); setAsk(null) }
  // The tab bar and HOME ask the same question before they leave this page.
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEffect(() => {
    setLeaveGuard((go) => leaveRef.current(go))
    return () => setLeaveGuard(null)
  }, [])

  // One sector is open at a time, the rest are one-line rows. Aircraft: always open on a wide screen; on a phone they are
  // one-line rows (closed) that open and fold with the big arrow.
  const focusSectorId = useDutyLogStore(s => s.focusSectorId)
  const setFocusSectorId = useDutyLogStore(s => s.setFocusSectorId)
  const wide = useWide()
  const [openAids, setOpenAids] = useState([])   // phone only: aircraft always start folded; wide screens show them all open
  const toggleAircraft = (id) => setOpenAids(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  const [selSid, setSelSid] = useState(() => (log.sectors.some(s => s.id === focusSectorId) ? focusSectorId : log.sectors[0]?.id))
  const lastSelIndex = useRef(0)
  const { index: selIndex, sector: selected } = pickSelected(log.sectors, selSid, lastSelIndex.current)
  lastSelIndex.current = selIndex
  useEffect(() => { if (selected && selected.id !== selSid) setSelSid(selected.id) }, [selected, selSid])

  // A sector or aircraft just added opens by itself.
  const counts = useRef({ sectors: log.sectors.length, aircraft: (log.aircraft || []).length })
  useEffect(() => {
    if (log.sectors.length > counts.current.sectors) setSelSid(log.sectors[log.sectors.length - 1].id)
    counts.current.sectors = log.sectors.length
  }, [log.sectors])
  useEffect(() => {
    const air = log.aircraft || []
    if (air.length > counts.current.aircraft) setOpenAids(ids => [...ids, air[air.length - 1].id])
    counts.current.aircraft = air.length
  }, [log.aircraft])

  // ‹ › : the page follows the sector (on a phone the open one moves down the list).
  const showEditor = () => requestAnimationFrame(() => document.querySelector('[data-sector-editor]')?.scrollIntoView({ block: 'nearest' }))
  const go = (dir) => {
    const to = neighbour(log.sectors, selIndex, dir)
    if (to) { setSelSid(to.id); showEditor() }
  }

  // Arriving from a briefing: open the sector it belongs to and scroll to it, once.
  useEffect(() => {
    if (!focusSectorId) return
    if (log.sectors.some(s => s.id === focusSectorId)) setSelSid(focusSectorId)
    requestAnimationFrame(() => document.querySelector(`[data-sector-id="${focusSectorId}"]`)?.scrollIntoView({ block: 'center' }))
    setFocusSectorId(null)
  }, [focusSectorId, setFocusSectorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const remarkSector = log.sectors.find(s => s.id === remarkSid)
  const remarkIndex = log.sectors.findIndex(s => s.id === remarkSid)
  // Keep the last sector so the modal can finish its exit animation after the
  // selection is cleared.
  const remarkPresence = usePresence(!!remarkSector)
  const lastRemark = useRef(null)
  if (remarkSector) lastRemark.current = { sector: remarkSector, index: remarkIndex }
  const shownRemark = lastRemark.current
  const atMaxAircraft = (log.aircraft || []).length >= 2
  const atMaxSectors = log.sectors.length >= 8
  // Crew present when this log was opened don't animate in; rows added after do.
  const knownCrew = useRef({ logId: null, ids: new Set() })
  if (knownCrew.current.logId !== log.id) knownCrew.current = { logId: log.id, ids: new Set(log.crew.map(c => c.id)) }
  const crewIsNew = (id) => !knownCrew.current.ids.has(id)
  useEffect(() => { log.crew.forEach(c => knownCrew.current.ids.add(c.id)) })

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--cp-border)', paddingBottom: 10, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => leave()} className="cp-btn" aria-label="back" style={{ padding: '4px 9px' }}>←</button>
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
          style={addBtnStyle(atMaxAircraft)}
        >
          {atMaxAircraft ? 'MAX 2 AIRCRAFT PER DUTY' : '+ ADD AIRCRAFT'}
        </button>
      </div>
      <div className="dutylog-aircraft-list" style={{ marginBottom: 9 }}>
        {(log.aircraft || []).map((a, i) => (wide
          ? <Aircraft key={a.id} logId={log.id} aircraft={a} index={i} total={(log.aircraft || []).length} actions={actions} />
          : <PhoneAircraft key={a.id} logId={log.id} aircraft={a} index={i} total={(log.aircraft || []).length}
              actions={actions} open={openAids.includes(a.id)} onToggle={() => toggleAircraft(a.id)} />
        ))}
      </div>

      <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SECTORS</span>
        <button
          onClick={() => !atMaxSectors && actions.addSector(log.id)}
          disabled={atMaxSectors}
          className="cp-btn"
          style={addBtnStyle(atMaxSectors)}
        >
          {atMaxSectors ? 'MAX 8 SECTORS PER DUTY' : '+ ADD SECTOR'}
        </button>
      </div>
      <div className="dutylog-sector-list" style={{ marginBottom: 9, '--n': log.sectors.length }}>
        {log.sectors.map((sec, i) => {
          const air = log.aircraft || []
          const ai = Math.max(0, air.findIndex(a => a.id === sec.aircraftId))
          const color = sectorRowColors[i % sectorRowColors.length]
          const acftColor = aircraftStripeColors[ai % aircraftStripeColors.length]
          return (
            <Fragment key={sec.id}>
              <SectorRow sector={sec} index={i} selected={i === selIndex} color={color}
                chip={air.length > 1 ? (air[ai]?.reg || `ACFT ${ai + 1}`).toUpperCase() : null} chipColor={acftColor}
                onSelect={() => { setSelSid(sec.id); showEditor() }} />
              {i === selIndex && (
                <SectorEditor logId={log.id} sector={sec} index={i} total={log.sectors.length} color={color}
                  actions={actions} onRemarks={setRemarkSid} aircraftList={air}
                  link={linkOf(sec)} onOpenLink={openSavedBriefing} onPickLink={startPick} onUnlink={unlink}
                  onPrev={() => go(-1)} onNext={() => go(1)} />
              )}
            </Fragment>
          )
        })}
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
              <CrewRow key={c.id} crew={c} animateIn={crewIsNew(c.id)}
                onChange={(patch) => actions.updateCrew(log.id, c.id, patch)}
                onRemove={() => actions.removeCrew(log.id, c.id)} />
            ))}
          </div>
        ))}
      </div>

      <LinkPicker open={pickOpen && !!pickSector} title="LINK BRIEFING"
        subtitle={pickSector ? `SECTOR #${log.sectors.indexOf(pickSector) + 1} · ${pickSector.fltNo || '—'} · ${log.date || 'UNDATED'}` : ''}
        searchHint="Search flight, route, tail…" allLabel="SHOW ALL BRIEFINGS"
        items={pickItems} onPick={pickBriefing} onCancel={() => setPickOpen(false)} />

      <LinkKeepPrompt open={!!ask} title={ask?.title} subtitle={ask?.subtitle} rows={ask?.rows ?? []}
        onConfirm={confirmLeave} onUndo={undoEdits} />

      {remarkPresence.mounted && shownRemark && (
        <RemarksModal
          closing={remarkPresence.closing}
          sector={shownRemark.sector}
          index={shownRemark.index}
          onCancel={() => setRemarkSid(null)}
          onSave={(text) => { actions.updateSector(log.id, remarkSid, { remark: text }); setRemarkSid(null) }}
        />
      )}
    </div>
  )
}
