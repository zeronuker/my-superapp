import { createPortal } from 'react-dom'
import { usePresence } from '../useTransitionAnim'
import ChamferFrame from '@brand/ChamferFrame'

const mono = 'var(--cb-font-mono)'

// Styled replacement for window.confirm on delete buttons. Portalled to <body>
// so it centres on the screen, not on a transformed page ancestor.
// `what` is the noun shown in the title ("briefing", "log"); `name` is optional detail.
export default function ConfirmDeleteModal({ open, what, name, onConfirm, onCancel }) {
  const presence = usePresence(open)
  if (!presence.mounted) return null

  return createPortal(
    <div className={`cp-backdrop-in${presence.closing ? ' is-closing' : ''}`} onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <ChamferFrame className={`cp-pop-in${presence.closing ? ' is-closing' : ''}`} onClick={e => e.stopPropagation()}
        pad="18px" style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)', marginBottom: 6 }}>
          DELETE {what.toUpperCase()}?
        </div>
        <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.5, marginBottom: 18 }}>
          {name && <div style={{ fontFamily: mono, color: 'var(--cp-txt)', marginBottom: 4, wordBreak: 'break-word' }}>{name}</div>}
          This cannot be undone.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onConfirm} style={{
            padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
            border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.10)', color: 'var(--cp-red)',
            fontFamily: mono, fontSize: 12, letterSpacing: '0.03em',
          }}>Delete</button>
          <button onClick={onCancel} style={{
            padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'center',
            border: '1px solid transparent', background: 'none', color: 'var(--cp-dim)',
            fontFamily: mono, fontSize: 12, letterSpacing: '0.03em',
          }}>Cancel</button>
        </div>
      </ChamferFrame>
    </div>,
    document.body
  )
}
