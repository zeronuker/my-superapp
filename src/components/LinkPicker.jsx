import { useEffect, useState } from 'react'
import ChamferFrame from '@brand/ChamferFrame'
import { usePresence } from '../useTransitionAnim'

const mono = 'var(--cb-font-mono)'

const TAG = {
  best:   { color: 'var(--cp-acc)', background: 'var(--cp-accdim)' },
  ofp:    { color: 'var(--cp-acc)', border: '1px solid var(--cp-border)' },
  manual: { color: 'var(--cp-yellow)', border: '1px solid var(--cp-border)' },
  taken:  { color: 'var(--cp-dim)', border: '1px solid var(--cp-border)' },
}

const linkBtn = { fontFamily: mono, fontSize: 10, letterSpacing: '0.06em', color: 'var(--cp-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }

// The list a sector or a briefing is linked from (Duty Log ↔ Saved Briefings). items: [{ key, title, sub,
// tags: [{ text, kind }], best, near, takenBy, search }] already best-first. Items outside `near` stay
// hidden until SHOW ALL or a search. Picking one that is linked elsewhere asks first (takenBy says to what).
export default function LinkPicker({ open, title, subtitle, searchHint, allLabel, items, onPick, onCancel }) {
  const presence = usePresence(open)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  useEffect(() => { if (!open) { setQuery(''); setShowAll(false); setConfirm(null) } }, [open])

  if (!presence.mounted) return null

  const q = query.trim().toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const hasFar = items.some(i => !i.near)
  const narrowed = !showAll && !q && items.some(i => i.near)
  const shown = items.filter(i => (terms.length ? terms.every(t => i.search.includes(t)) : narrowed ? i.near : true))
  const pick = (item) => (item.takenBy ? setConfirm(item) : onPick(item.key))

  return (
    <div onClick={onCancel} className={`cp-backdrop-in${presence.closing ? ' is-closing' : ''}`} style={{
      position: 'fixed', inset: 0, zIndex: 450, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <ChamferFrame onClick={e => e.stopPropagation()} className={`cp-pop-in${presence.closing ? ' is-closing' : ''}`} pad="14px"
        style={{ width: '100%', maxWidth: 460, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        {confirm ? (
          <>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-txt)', marginBottom: 8 }}>REPLACE LINK?</div>
            <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.6, marginBottom: 16 }}>
              {confirm.title} is already linked to {confirm.takenBy}. Linking it here replaces that link.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirm(null)} className="cp-btn" style={{ fontSize: 11 }}>BACK</button>
              <button onClick={() => onPick(confirm.key)} className="cp-btn"
                style={{ fontSize: 11, color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }}>REPLACE</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>{title}</div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)', margin: '4px 0 10px' }}>{subtitle}</div>
            <input className="cp-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={searchHint}
              style={{ fontSize: 11, padding: '7px 9px', marginBottom: 4 }} />
            <div style={{ overflowY: 'auto', minHeight: 0 }}>
              {shown.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--cp-dim)', padding: '14px 0' }}>Nothing matches.</div>
              )}
              {shown.map(item => (
                <button key={item.key} onClick={() => pick(item)} style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', marginTop: 6,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 6, background: 'var(--cp-bg2)',
                  border: `1px solid ${item.best ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
                }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: mono, fontSize: 12, color: 'var(--cp-txt)' }}>{item.title}</span>
                    <span style={{ display: 'block', fontFamily: mono, fontSize: 10, color: 'var(--cp-dim)', marginTop: 2 }}>{item.sub}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {[...(item.best ? [{ text: 'BEST GUESS', kind: 'best' }] : []), ...item.tags,
                      ...(item.takenBy ? [{ text: `LINKED TO ${item.takenBy}`, kind: 'taken' }] : [])].map(t => (
                      <span key={t.text} style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', ...TAG[t.kind] }}>{t.text}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              {hasFar && !q ? <button onClick={() => setShowAll(v => !v)} style={linkBtn}>{showAll ? 'SHOW NEARBY ONLY' : allLabel}</button> : <span />}
              <button onClick={onCancel} style={linkBtn}>CANCEL</button>
            </div>
          </>
        )}
      </ChamferFrame>
    </div>
  )
}
