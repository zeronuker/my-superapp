import { useEffect, useState } from 'react'
import ChamferFrame from '@brand/ChamferFrame'
import { usePresence } from '../useTransitionAnim'
import Seg from './Seg'
import { defaultSelection } from '../utils/briefingPdf'

const mono = 'var(--cb-font-mono)'
const linkBtn = { fontFamily: mono, fontSize: 10, letterSpacing: '0.06em', color: 'var(--cp-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }
const heading = { fontFamily: mono, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--cp-dim)' }

function Row({ checked, indeterminate, onChange, label, hint, child }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: child ? '5px 0 5px 26px' : '8px 0',
      borderBottom: '1px dashed var(--cp-border3)', fontSize: child ? 12 : 13, color: child ? 'var(--cp-muted)' : 'var(--cp-txt)',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: 'var(--cp-acc)', width: 15, height: 15, margin: 0, flexShrink: 0 }}
        ref={el => { if (el) el.indeterminate = !!indeterminate }} />
      <span style={{ fontFamily: child ? mono : undefined }}>{label}</span>
      {hint != null && <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: 'var(--cp-dim)', whiteSpace: 'nowrap' }}>{hint}</span>}
    </label>
  )
}

// Picks what goes into a saved briefing's PDF. `sections` = utils/briefingPdf.js's pdfSections (only what
// this briefing has); `onExport(selection, { orientation, theme })` makes and downloads the file.
export default function ExportBriefingModal({ open, title, sections, onExport, onCancel }) {
  const presence = usePresence(open)
  const [sel, setSel] = useState(() => defaultSelection(sections))
  const [orientation, setOrientation] = useState('portrait')
  const [theme, setTheme] = useState('dark')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setSel(defaultSelection(sections)); setError('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    // Escape closes only this window, not the briefing behind it.
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onCancel() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!presence.mounted) return null

  const toggle = (id) => setSel(s => {
    const next = new Set(s.sections)
    next.has(id) ? next.delete(id) : next.add(id)
    return { ...s, sections: next }
  })
  const notam = sections.find(s => s.id === 'notam')
  const toggleNotam = () => setSel(s => {
    const on = s.notams.size > 0, sec = new Set(s.sections)
    on ? sec.delete('notam') : sec.add('notam')
    return { sections: sec, notams: on ? new Set() : new Set(notam.children.map(c => c.id)) }
  })
  const toggleLocation = (id) => setSel(s => {
    const notams = new Set(s.notams), sec = new Set(s.sections)
    notams.has(id) ? notams.delete(id) : notams.add(id)
    notams.size ? sec.add('notam') : sec.delete('notam')
    return { sections: sec, notams }
  })

  const run = async () => {
    if (busy) return
    if (sel.sections.size === 0) { setError('Tick at least one section.'); return }
    setBusy(true); setError('')
    try { await onExport(sel, { orientation, theme }); onCancel() }
    catch (_) { setError("Couldn't make the PDF. Try again.") }
    setBusy(false)
  }

  return (
    <div onClick={() => !busy && onCancel()} className={`cp-backdrop-in${presence.closing ? ' is-closing' : ''}`} style={{
      position: 'fixed', inset: 0, zIndex: 450, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <ChamferFrame onClick={e => e.stopPropagation()} className={`cp-pop-in${presence.closing ? ' is-closing' : ''}`} pad="14px"
        style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>EXPORT PDF</div>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)', margin: '4px 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>

        <div style={heading}>Include</div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {sections.map(s => s.id === 'notam' ? (
            <div key={s.id}>
              <Row label={s.label} hint={s.hint} checked={sel.notams.size > 0} indeterminate={sel.notams.size > 0 && sel.notams.size < s.children.length} onChange={toggleNotam} />
              {s.children.map(c => <Row key={c.id} child label={c.label} hint={c.count} checked={sel.notams.has(c.id)} onChange={() => toggleLocation(c.id)} />)}
            </div>
          ) : (
            <Row key={s.id} label={s.label} hint={s.hint} checked={sel.sections.has(s.id)} onChange={() => toggle(s.id)} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '14px 0 4px' }}>
          <div><div style={{ ...heading, marginBottom: 5 }}>Page</div>
            <Seg value={orientation} onChange={setOrientation} options={[{ value: 'portrait', label: 'PORTRAIT' }, { value: 'landscape', label: 'LANDSCAPE' }]} /></div>
          <div><div style={{ ...heading, marginBottom: 5 }}>Theme</div>
            <Seg value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'DARK' }, { value: 'light', label: 'LIGHT' }]} /></div>
        </div>

        {error && <div role="alert" style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-red)', marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <button onClick={onCancel} disabled={busy} style={linkBtn}>CANCEL</button>
          <button onClick={run} className="cp-btn"
            style={{ fontSize: 11, color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }}>
            {busy ? 'MAKING PDF…' : 'EXPORT PDF'}
          </button>
        </div>
      </ChamferFrame>
    </div>
  )
}
