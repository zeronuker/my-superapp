import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shown as a fixed bottom bar when a new service worker is waiting.
 * User must tap UPDATE to apply — no silent auto-reload.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9999,
      background: 'var(--cp-bg2)',
      borderTop: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.4)',
      padding: '12px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>⬆</span>
        <div>
          <div style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 9,
            letterSpacing: '0.16em', color: 'var(--cp-acc)', marginBottom: 2,
          }}>
            UPDATE AVAILABLE
          </div>
          <div style={{
            fontFamily: 'var(--cb-font-body)', fontSize: 12,
            color: 'var(--cp-muted)',
          }}>
            A new version of the app is ready.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => setNeedRefresh(false)}
          style={{
            background: 'transparent',
            border: '1px solid var(--cp-border2)',
            borderRadius: 4, color: 'var(--cp-dim)',
            fontFamily: 'var(--cb-font-mono)', fontSize: 9,
            letterSpacing: '0.12em', padding: '6px 12px', cursor: 'pointer',
          }}
        >
          LATER
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.15)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.5)',
            borderRadius: 4, color: 'var(--cp-acc)',
            fontFamily: 'var(--cb-font-mono)', fontSize: 9,
            letterSpacing: '0.12em', padding: '6px 14px', cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          UPDATE NOW
        </button>
      </div>
    </div>
  )
}
