import React, { useState, lazy, Suspense } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCalculatorStore } from './store/calculatorStore'
import UpdatePrompt from './components/UpdatePrompt'
import ErrorBoundary from './components/ErrorBoundary'

// Each tab is code-split into its own chunk, loaded on demand when first opened.
// vite-plugin-pwa precaches every emitted chunk, so offline still works.
const CombinedCalculator      = lazy(() => import('./components/CombinedCalculator'))
const InterpolationCalculator = lazy(() => import('./components/InterpolationCalculator'))
const EDTOCalculator          = lazy(() => import('./components/EDTOCalculator'))
const DensityAltitudeCalculator = lazy(() => import('./components/DensityAltitudeCalculator'))
const TASCalculator           = lazy(() => import('./components/TASCalculator'))
const CurrencyCalculator      = lazy(() => import('./components/CurrencyCalculator'))
const METARTAFCalculator      = lazy(() => import('./components/METARTAFCalculator'))
const FTLCalculator           = lazy(() => import('./components/FTLCalculator'))
const PrayerModule            = lazy(() => import('./modules/prayer'))
// Named export → adapt to the default shape React.lazy expects (same chunk as PrayerModule)
const PrayerSettings = lazy(() =>
  import('./modules/prayer').then(m => ({ default: m.PrayerSettings })))

export const CALCULATORS = [
  { id: 'calculator',    icon: '🧮',  name: 'Calculator',     component: CombinedCalculator },
  { id: 'interpolation', icon: '📐',  name: 'Interpolation',  component: InterpolationCalculator },
  { id: 'edto',          icon: '✈️', name: 'EDTO',           component: EDTOCalculator },
  { id: 'densityalt',    icon: '🌡️', name: 'Density Alt',     component: DensityAltitudeCalculator },
  { id: 'tas',           icon: '💨',  name: 'TAS',            component: TASCalculator },
  { id: 'currency',      icon: '💱',  name: 'Currency',       component: CurrencyCalculator },
  { id: 'metartaf',      icon: '🌤️', name: 'METAR/TAF',      component: METARTAFCalculator },
  { id: 'ftl',           icon: '⏳',  name: 'FTL',            component: FTLCalculator },
  { id: 'prayer',        icon: '🕌',  name: 'Qiblat & Solat', component: PrayerModule },
]

// IDs that no longer exist — remap to 'calculator'
const LEGACY_IDS = new Set(['normal', 'scientific', 'time'])

const FONT_SCALES = { compact: 0.88, normal: 1, large: 1.13 }

// Fallback shown while a lazily-loaded tab chunk is fetched.
function TabLoading({ compact }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: compact ? '16px 0' : '48px 0',
      fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.18em',
      color: 'var(--cp-dim)',
    }}>
      <span className="cp-spinner" style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '2px solid var(--cp-border)', borderTopColor: 'var(--cp-acc)',
        display: 'inline-block', animation: 'cp-spin 0.7s linear infinite',
      }} />
      LOADING…
    </div>
  )
}

export default function App() {
  const {
    activeCalculator, setActiveCalculator,
    resetAll, darkMode, toggleDarkMode,
    settings, updateSettings,
  } = useCalculatorStore()

  // Changing defaultTab in Settings also navigates to that tab immediately
  const handleSettingsUpdate = (partial) => {
    updateSettings(partial)
    if ('defaultTab' in partial) setActiveCalculator(partial.defaultTab)
  }

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fading, setFading] = React.useState(false)

  // Build ordered tab list — respects user-saved order, appends unknown new tabs at end
  const orderedCalcs = React.useMemo(() => {
    const saved = settings.tabOrder || []
    const known = new Set(saved)
    const extras = CALCULATORS.filter(c => !known.has(c.id))
    return [
      ...saved.map(id => CALCULATORS.find(c => c.id === id)).filter(Boolean),
      ...extras,
    ]
  }, [settings.tabOrder])

  const currentCalc     = CALCULATORS.find(c => c.id === activeCalculator)
  const CurrentComponent = currentCalc?.component

  // ── Migrate legacy tab IDs (normal/scientific → calculator) ───────────
  React.useEffect(() => {
    if (LEGACY_IDS.has(activeCalculator)) setActiveCalculator('calculator')
    if (LEGACY_IDS.has(settings.defaultTab)) handleSettingsUpdate({ defaultTab: 'calculator' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync darkMode → data-theme + persist ──────────────────────────────
  React.useEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('cb-theme', theme)
  }, [darkMode])

  // ── Reduce motion ─────────────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute(
      'data-reduce-motion', settings.reduceMotion ? 'true' : 'false'
    )
  }, [settings.reduceMotion])

  const handleToggleDark = () => {
    setFading(true)
    setTimeout(() => {
      toggleDarkMode()
      setTimeout(() => setFading(false), 80)
    }, 140)
  }

  const zoom = FONT_SCALES[settings.fontScale] || 1

  // ── Escape key closes settings ─────────────────────────────────────────
  React.useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setSettingsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  // ── Zoom: use CSS zoom where supported, transform: scale fallback for old Firefox
  const [zoomSupported] = React.useState(() => {
    try { return window.CSS?.supports?.('zoom', '1.1') ?? true } catch { return true }
  })
  const zoomStyle = zoom === 1 ? {} : zoomSupported
    ? { zoom }
    : { transform: `scale(${zoom})`, transformOrigin: 'top left',
        width: `${(1 / zoom) * 100}vw`, minHeight: `${(1 / zoom) * 100}vh` }

  // ── Auto-compact in landscape on short screens (iPad/phone landscape) ──
  const [landscapeCompact, setLandscapeCompact] = React.useState(false)
  React.useEffect(() => {
    const check = () => {
      setLandscapeCompact(
        window.innerWidth > window.innerHeight && window.innerHeight < 850
      )
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return (
    <>
      <div style={{
        minHeight: '100vh',
        background: 'var(--cp-bg)',
        fontFamily: 'var(--cb-font-body)',
        opacity: fading ? 0 : 1,
        transition: settings.reduceMotion ? 'none' : 'opacity 0.14s ease',
        ...zoomStyle,
      }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header style={{
          background: 'linear-gradient(135deg, var(--cp-bghd) 0%, var(--cp-bgalt) 100%)',
          borderBottom: '1px solid var(--cp-border)',
          padding: '18px 24px 16px',
        }}>
          <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src="/brand/icons/icon-192.png"
                width={48}
                height={48}
                alt="ClaudeBorne"
                style={{ flexShrink: 0, display: 'block', borderRadius: 4 }}
              />
              <span style={{
                fontFamily: 'var(--cb-font-display)', fontWeight: 700,
                fontSize: 13, letterSpacing: '0.22em',
                background: 'var(--cb-grad)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                color: 'transparent',
              }}>
                CLAUDEBORNE SUPERAPP
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSettingsOpen(true)}
                className="cp-btn"
                style={{ fontSize: 15, padding: '6px 12px' }}
                title="Settings"
                aria-label="Open settings"
              >
                ⚙
              </button>
              <button
                onClick={resetAll}
                className="cp-btn cp-btn-danger"
                style={{ fontSize: 11, letterSpacing: '0.15em' }}
              >
                RESET ALL
              </button>
            </div>
          </div>
        </header>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--cp-bg3)',
          borderBottom: '1px solid var(--cp-border)',
          padding: '0 24px',
        }}>
          <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', gap: 4,
            paddingTop: 12, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 1 }}
            className="cp-tab-bar">
            {orderedCalcs.map(calc => (
              <button
                key={calc.id}
                onClick={() => setActiveCalculator(calc.id)}
                className={`cp-tab${activeCalculator === calc.id ? ' active' : ''}`}
              >
                <span style={{ marginRight: 6, fontSize: 18 }}>{calc.icon}</span>
                {calc.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main style={{
          maxWidth: 960, margin: '0 auto',
          padding: landscapeCompact ? '12px 24px 24px' : '24px 24px 48px',
        }}>
          <div style={{
            background: 'var(--cp-bg2)',
            border: '1px solid var(--cp-border)',
            borderRadius: 4,
            padding: landscapeCompact ? '16px' : '24px',
            zoom: landscapeCompact ? 0.82 : undefined,
          }}>
            <div key={activeCalculator}
              className={settings.reduceMotion ? '' : 'cp-calc-fade'}>
              <ErrorBoundary name={currentCalc?.name} resetKey={activeCalculator}>
                <Suspense fallback={<TabLoading />}>
                  {CurrentComponent && <CurrentComponent />}
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: '1px solid var(--cp-border3)',
          padding: '12px 24px',
          textAlign: 'center',
          fontFamily: 'var(--cb-font-mono)',
          fontSize: 11,
          color: 'var(--cp-dim)',
          letterSpacing: '0.12em',
          lineHeight: 1.8,
        }}>
          <div>CLAUDEBORNE SUPERAPP · PWA OFFLINE CAPABLE</div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em' }}>v3.0</div>
        </footer>
      </div>

      {/* ── Update prompt ────────────────────────────────────────────── */}
      <UpdatePrompt />

      {/* ── Settings overlay ─────────────────────────────────────────── */}
      {settingsOpen && (
        <>
          <div
            onClick={() => setSettingsOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 100,
              backdropFilter: 'blur(2px)',
            }}
          />
          <SettingsPanel
            darkMode={darkMode}
            onToggleDark={handleToggleDark}
            settings={settings}
            onUpdate={handleSettingsUpdate}
            onClose={() => setSettingsOpen(false)}
            orderedCalcs={orderedCalcs}
          />
        </>
      )}
    </>
  )
}

// ── Settings tabs ───────────────────────────────────────────────────────────
const SETTINGS_TABS = [
  { id: 'general', label: 'GENERAL', icon: '⚙'  },
  { id: 'weather', label: 'WEATHER', icon: '🌤' },
  { id: 'prayer',  label: 'PRAYER',  icon: '🕌' },
  { id: 'about',   label: 'ABOUT',   icon: 'ⓘ'  },
]

const FOCUSABLE_SEL =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Width-based layout switch. Driven by window width (not device sniffing) so
// iPad Split View / Stage Manager narrow windows correctly get the sheet.
function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  React.useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = e => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ darkMode, onToggleDark, settings, onUpdate, onClose, orderedCalcs }) {
  const panelRef = React.useRef(null)
  const [activeTab, setActiveTab] = React.useState('general')
  const isWide = useMediaQuery('(min-width: 768px)')   // ≥768 → modal+rail, else sheet+strip
  const animate = !settings.reduceMotion

  // Focus trap. The keydown handler is attached to the document and queries the
  // live panelRef, so it survives the layout swap when the window crosses 768px.
  React.useEffect(() => {
    const prevFocus = document.activeElement
    const first = panelRef.current?.querySelector(FOCUSABLE_SEL)
    if (first) first.focus()

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const els = Array.from(panel.querySelectorAll(FOCUSABLE_SEL))
      if (!els.length) return
      const f = els[0], l = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === f) { e.preventDefault(); l.focus() }
      } else {
        if (document.activeElement === l) { e.preventDefault(); f.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [])

  // ── Per-tab content (controls are identical to the old single-scroll panel) ──
  const tabContent = (
    <>
      {activeTab === 'general' && (
        <>
          <SettingsSection title="APPEARANCE">
            <SettingsRow label="THEME">
              <SegmentedToggle
                options={[{ value: 'dark', label: 'DARK' }, { value: 'light', label: 'LIGHT' }]}
                value={darkMode ? 'dark' : 'light'}
                onChange={v => { if ((v === 'light') === darkMode) onToggleDark() }}
              />
            </SettingsRow>
            <SettingsRow label="FONT SIZE">
              <SegmentedToggle
                options={[
                  { value: 'compact', label: 'SM' },
                  { value: 'normal',  label: 'MD' },
                  { value: 'large',   label: 'LG' },
                ]}
                value={settings.fontScale}
                onChange={v => onUpdate({ fontScale: v })}
              />
            </SettingsRow>
            <SettingsRow label="REDUCE MOTION">
              <SegmentedToggle
                options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                value={settings.reduceMotion}
                onChange={v => onUpdate({ reduceMotion: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="INTERFACE">
            <SettingsRow label="DEFAULT TAB">
              <select
                value={settings.defaultTab}
                onChange={e => onUpdate({ defaultTab: e.target.value })}
                style={selectStyle}
              >
                {orderedCalcs.map(c => (
                  <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                ))}
              </select>
            </SettingsRow>
            <SettingsRow label="HAPTIC">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={settings.haptic}
                onChange={v => onUpdate({ haptic: v })}
              />
            </SettingsRow>

            <div style={{ marginTop: 8 }}>
              <span className="cp-label" style={{ display: 'block', marginBottom: 8 }}>TAB ORDER</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {orderedCalcs.map((calc, idx) => (
                  <div key={calc.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)',
                    borderRadius: 4, padding: '5px 8px',
                  }}>
                    <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-muted)', letterSpacing: '0.1em' }}>
                      <span style={{ marginRight: 6, opacity: 0.6 }}>{calc.icon}</span>
                      {calc.name.toUpperCase()}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="cp-btn"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = orderedCalcs.map(c => c.id)
                          ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                          onUpdate({ tabOrder: next })
                        }}
                        style={{ padding: '2px 7px', fontSize: 12, opacity: idx === 0 ? 0.25 : 1 }}
                      >▲</button>
                      <button
                        className="cp-btn"
                        disabled={idx === orderedCalcs.length - 1}
                        onClick={() => {
                          const next = orderedCalcs.map(c => c.id)
                          ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                          onUpdate({ tabOrder: next })
                        }}
                        style={{ padding: '2px 7px', fontSize: 12, opacity: idx === orderedCalcs.length - 1 ? 0.25 : 1 }}
                      >▼</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="CURRENCY">
            <SettingsRow label="NUMBER FORMAT">
              <SegmentedToggle
                options={[{ value: 'en', label: '1,000' }, { value: 'eu', label: '1.000' }]}
                value={settings.numberFormat}
                onChange={v => onUpdate({ numberFormat: v })}
              />
            </SettingsRow>
          </SettingsSection>
        </>
      )}

      {activeTab === 'weather' && (
        <SettingsSection title="METAR / TAF">
          <SettingsRow label="DEFAULT HISTORY">
            <select
              value={settings.defaultHistory}
              onChange={e => onUpdate({ defaultHistory: Number(e.target.value) })}
              style={selectStyle}
            >
              {[1, 2, 3, 6, 12, 24].map(h => (
                <option key={h} value={h}>{h}H</option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow label="AUTO-REFRESH">
            <SegmentedToggle
              options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
              value={settings.autoRefresh}
              onChange={v => onUpdate({ autoRefresh: v })}
            />
          </SettingsRow>
        </SettingsSection>
      )}

      {activeTab === 'prayer' && (
        <SettingsSection title="QIBLAT & SOLAT">
          <Suspense fallback={<TabLoading compact />}>
            <PrayerSettings />
          </Suspense>
        </SettingsSection>
      )}

      {activeTab === 'about' && (
        <>
          <SettingsSection title="APP UPDATE">
            <UpdateChecker />
          </SettingsSection>
          <div style={{
            textAlign: 'center', fontFamily: 'var(--cb-font-mono)',
            fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-dim)', paddingTop: 4,
          }}>
            CLAUDEBORNE SUPERAPP · v3.0
          </div>
        </>
      )}
    </>
  )

  // ── Shared header ──
  const header = (
    <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--cp-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
        letterSpacing: '0.22em', color: 'var(--cp-acc)' }}>
        ⚙  SETTINGS
      </span>
      <button className="cp-btn" onClick={onClose}
        style={{ padding: '4px 10px', fontSize: 13 }} aria-label="Close settings">✕</button>
    </div>
  )

  // ── Tab button (strip = mobile top, rail = desktop left) ──
  const TabButton = ({ tab, variant }) => {
    const active = activeTab === tab.id
    const base = {
      cursor: 'pointer', background: active ? 'var(--cp-accdim)' : 'transparent',
      color: active ? 'var(--cp-acc)' : 'var(--cp-dim)',
      fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.1em', transition: 'all 0.12s',
    }
    if (variant === 'rail') {
      return (
        <button onClick={() => setActiveTab(tab.id)} aria-current={active}
          style={{ ...base, display: 'flex', alignItems: 'center', gap: 9, width: '100%',
            textAlign: 'left', border: 'none', borderRadius: 4, padding: '10px 12px', fontSize: 11 }}>
          <span style={{ fontSize: 14 }}>{tab.icon}</span>{tab.label}
        </button>
      )
    }
    return (
      <button onClick={() => setActiveTab(tab.id)} aria-current={active}
        style={{ ...base, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 4, border: 'none', borderBottom: `2px solid ${active ? 'var(--cp-acc)' : 'transparent'}`,
          padding: '10px 4px', minHeight: 52, fontSize: 9 }}>
        <span style={{ fontSize: 15 }}>{tab.icon}</span>{tab.label}
      </button>
    )
  }

  // ── Desktop / iPad: centred modal with left rail ──
  if (isWide) {
    return (
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings"
        className={animate ? 'cp-modal-anim' : ''}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(560px, 92vw)', height: 'min(620px, 86vh)',
          background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 8,
          zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        }}>
        {header}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 150, flexShrink: 0, borderRight: '1px solid var(--cp-border)',
            padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
            {SETTINGS_TABS.map(t => <TabButton key={t.id} tab={t} variant="rail" />)}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {tabContent}
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile: full-height sheet with top tab strip ──
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings"
      className={animate ? 'cp-sheet-anim' : ''}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--cp-bg2)',
        zIndex: 200, display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
      {header}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cp-border)', flexShrink: 0 }}>
        {SETTINGS_TABS.map(t => <TabButton key={t.id} tab={t} variant="strip" />)}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        {tabContent}
      </div>
    </div>
  )
}

// ── Update checker ──────────────────────────────────────────────────────────
function UpdateChecker() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const [status, setStatus] = React.useState('idle') // 'idle' | 'checking' | 'uptodate' | 'available'

  // Sync external needRefresh → local status
  React.useEffect(() => {
    if (needRefresh) setStatus('available')
  }, [needRefresh])

  const check = async () => {
    setStatus('checking')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    } catch { /* ignore — no SW in dev */ }
    // Give the SW a moment to signal if an update was found
    setTimeout(() => {
      setStatus(s => s === 'checking' ? 'uptodate' : s)
    }, 2500)
  }

  const dismiss = () => {
    setNeedRefresh(false)
    setStatus('idle')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Check button */}
      <button
        onClick={status === 'checking' ? undefined : check}
        disabled={status === 'checking'}
        style={{
          width: '100%',
          background: 'transparent',
          border: '1px solid var(--cp-border2)',
          borderRadius: 4, padding: '7px 12px',
          fontFamily: 'var(--cb-font-mono)', fontSize: 10,
          letterSpacing: '0.14em',
          color: status === 'checking' ? 'var(--cp-dim)' : 'var(--cp-acc)',
          cursor: status === 'checking' ? 'default' : 'pointer',
          transition: 'all 0.12s',
        }}
      >
        {status === 'checking' ? '⊙ CHECKING…' : '⬆ CHECK FOR UPDATES'}
      </button>

      {/* Status feedback */}
      {status === 'uptodate' && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
          letterSpacing: '0.12em', color: 'var(--cp-dim)', textAlign: 'center' }}>
          ✓ YOU'RE ON THE LATEST VERSION
        </div>
      )}

      {status === 'available' && (
        <div style={{
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.08)',
          border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
          borderRadius: 4, padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
            letterSpacing: '0.12em', color: 'var(--cp-acc)' }}>
            UPDATE AVAILABLE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={dismiss} style={{
              background: 'transparent', border: '1px solid var(--cp-border2)',
              borderRadius: 3, padding: '4px 8px', cursor: 'pointer',
              fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              letterSpacing: '0.1em', color: 'var(--cp-dim)',
            }}>LATER</button>
            <button onClick={() => updateServiceWorker(true)} style={{
              background: 'rgba(var(--cp-acc-rgb,63,224,197),0.15)',
              border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.4)',
              borderRadius: 3, padding: '4px 8px', cursor: 'pointer',
              fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              letterSpacing: '0.1em', color: 'var(--cp-acc)', fontWeight: 700,
            }}>UPDATE NOW</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Settings helpers ────────────────────────────────────────────────────────
function SettingsSection({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="cp-section-header" style={{ marginBottom: 14 }}>
        <span className="cp-section-title">{title}</span>
        <div className="cp-divider" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12 }}>
      <span className="cp-label" style={{ flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function SegmentedToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--cp-border)',
      borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
      {options.map((opt, i) => {
        const active = value === opt.value
        return (
          <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{
            background:   active ? 'var(--cp-accdim)' : 'transparent',
            border:       'none',
            borderRight:  i < options.length - 1 ? '1px solid var(--cp-border)' : 'none',
            color:        active ? 'var(--cp-acc)' : 'var(--cp-dim)',
            fontFamily:   'var(--cb-font-mono)',
            fontSize:     10,
            letterSpacing:'0.1em',
            padding:      '5px 10px',
            cursor:       'pointer',
            whiteSpace:   'nowrap',
          }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const selectStyle = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
  borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
  fontSize: 11, padding: '5px 8px', outline: 'none', cursor: 'pointer',
}
