import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shown as a centred modal dialog when a new service worker is waiting.
 * User must choose UPDATE NOW or LATER — no silent auto-reload.
 *
 * Polls for updates every 60 s via registration.update() so the prompt
 * appears automatically without needing a page reload.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r) return
      setInterval(async () => {
        if (r.installing) return
        if ('connection' in navigator && !navigator.onLine) return
        await r.update()
      }, 60_000)
    },
  })

  if (!needRefresh) return null

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 9998,
      }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        width: 'min(320px, calc(100vw - 48px))',
        background: 'var(--cp-bg2)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
        borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        padding: '24px 22px 20px',
      }}>

        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>⬆</span>
          <div>
            <div style={{
              fontFamily: 'var(--cb-font-mono)', fontSize: 10,
              letterSpacing: '0.18em', color: 'var(--cp-acc)', marginBottom: 2,
            }}>
              UPDATE AVAILABLE
            </div>
            <div style={{
              fontFamily: 'var(--cb-font-mono)', fontSize: 8,
              letterSpacing: '0.12em', color: 'var(--cp-dim)',
            }}>
              CLAUDEBORNE SUPERAPP
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{
          fontFamily: 'var(--cb-font-body)', fontSize: 13,
          color: 'var(--cp-muted)', lineHeight: 1.6,
          marginBottom: 20,
        }}>
          A new version is ready to install. Update now for the latest features and fixes, or continue and update later.
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setNeedRefresh(false)}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--cp-border2)',
              borderRadius: 6, color: 'var(--cp-dim)',
              fontFamily: 'var(--cb-font-mono)', fontSize: 10,
              letterSpacing: '0.14em', padding: '10px 0', cursor: 'pointer',
            }}
          >
            LATER
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            style={{
              flex: 2,
              background: 'rgba(var(--cp-acc-rgb,63,224,197),0.15)',
              border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.5)',
              borderRadius: 6, color: 'var(--cp-acc)',
              fontFamily: 'var(--cb-font-mono)', fontSize: 10,
              letterSpacing: '0.14em', padding: '10px 0', cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            UPDATE NOW
          </button>
        </div>
      </div>
    </>
  )
}
