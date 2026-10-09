import React, { useState, lazy, Suspense } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCalculatorStore } from './store/calculatorStore'
import { loadLastPosition } from './modules/prayer/services/geolocation'
import ErrorBoundary from './components/ErrorBoundary'
import { TabBar, GroupedNav, LauncherGrid, LauncherBackBar } from './components/Navigation'
import BrandBanner from '@brand/BrandBanner'
import SplashScreen from '@brand/SplashScreen'
import UpdatePrompt from '@brand/UpdatePrompt'
import { useUpdate } from '@brand/useUpdate'
import { METAR_CACHE_KEY } from './utils/moduleCacheKeys'
import TabLoading from './components/TabLoading'
import DashboardHome from './components/DashboardHome'
import SettingsPanel from './components/settings/SettingsPanel'
import { APP_VERSION, resolveAccentId } from './appConstants'

// Each tab is code-split into its own chunk, loaded on demand when first opened.
// vite-plugin-pwa precaches every emitted chunk, so offline still works.
const CombinedCalculator      = lazy(() => import('./components/CombinedCalculator'))
const InterpolationCalculator = lazy(() => import('./components/InterpolationCalculator'))
const B737Performance         = lazy(() => import('./components/B737Performance'))
const CurrencyCalculator      = lazy(() => import('./components/CurrencyCalculator'))
const METARTAFCalculator      = lazy(() => import('./components/METARTAFCalculator'))
const NotamViewer             = lazy(() => import('./components/NotamViewer'))
const SigmetViewer            = lazy(() => import('./components/SigmetViewer'))
const MalaysiaAirports        = lazy(() => import('./components/MalaysiaAirports'))
const FTLCalculator           = lazy(() => import('./components/FTLCalculator'))
const WorldTimeCalculator     = lazy(() => import('./components/WorldTimeCalculator'))
const PrayerModule            = lazy(() => import('./modules/prayer'))
// Not a CALCULATORS tab, but still worth code-splitting — it pulls in the
// airports database, and eagerly importing it here would drag that into
// the main bundle instead of only loading it when Briefing actually opens.
const BriefingView            = lazy(() => import('./components/BriefingView'))
const DutyLogModule           = lazy(() => import('./modules/dutylog'))
const PrayerBackgroundSync = lazy(() => import('./modules/prayer/PrayerBackgroundSync'))

export const CALCULATORS = [
  { id: 'calculator',    icon: '🧮',  name: 'Calculator',     component: CombinedCalculator },
  { id: 'interpolation', icon: '📐',  name: 'Interpolation',  component: InterpolationCalculator },
  { id: 'b737perf',      icon: '✈️', name: 'B737 Performance', component: B737Performance },
  { id: 'currency',      icon: '💱',  name: 'Currency',       component: CurrencyCalculator },
  { id: 'metartaf',      icon: '🌤️', name: 'METAR/TAF',      component: METARTAFCalculator },
  { id: 'notam',         icon: '📋',  name: 'NOTAM',          component: NotamViewer },
  { id: 'sigmet',        icon: '⛈️',  name: 'SIGMET',         component: SigmetViewer },
  { id: 'gatefinder',    icon: '🛬',  name: 'Malaysia Airports', component: MalaysiaAirports },
  { id: 'ftl',           icon: '⏳',  name: 'Flight Time Limitations', component: FTLCalculator },
  { id: 'dutylog',       icon: '🛫',  name: 'Duty Log',       component: DutyLogModule },
  { id: 'worldtime',     icon: '🌐',  name: 'World Time',     component: WorldTimeCalculator },
  { id: 'prayer',        icon: '🕌',  name: 'Qiblat & Solat', component: PrayerModule },
]

// IDs that no longer exist — remap to whichever current tab replaced them
const LEGACY_ID_MAP = {
  normal: 'calculator', scientific: 'calculator', time: 'calculator',
  densityalt: 'calculator', tas: 'calculator', traffic: 'calculator',
  edto: 'b737perf',
}

const FONT_SCALES = { compact: 0.88, normal: 1, large: 1.13, cockpit: 1.26 }

function useOnlineStatus() {
  const [online, setOnline] = React.useState(() => navigator.onLine)
  React.useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// Sets the PWA home-screen badge when METAR data is stale (>30 min).
// Clears it when fresh. No-ops silently on browsers without the Badge API.
function useMETARBadge() {
  React.useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    const update = () => {
      try {
        const c = JSON.parse(localStorage.getItem(METAR_CACHE_KEY))
        if (!c?.fetchedAt || !c?.results) { navigator.clearAppBadge?.(); return }
        const ageMin = (Date.now() - c.fetchedAt) / 60000
        if (ageMin > 30) navigator.setAppBadge(1)
        else navigator.clearAppBadge?.()
      } catch { navigator.clearAppBadge?.() }
    }
    update()
    const t = setInterval(update, 60_000)
    return () => { clearInterval(t); navigator.clearAppBadge?.() }
  }, [])
}

export default function App() {
  const {
    activeCalculator, setActiveCalculator,
    darkMode, setDarkMode,
    settings, updateSettings,
    briefing, resumeBriefing, openSavedBriefing,
  } = useCalculatorStore(useShallow(s => ({
    activeCalculator: s.activeCalculator, setActiveCalculator: s.setActiveCalculator,
    darkMode: s.darkMode, setDarkMode: s.setDarkMode,
    settings: s.settings, updateSettings: s.updateSettings,
    briefing: s.briefing, resumeBriefing: s.resumeBriefing, openSavedBriefing: s.openSavedBriefing,
  })))

  const isOnline = useOnlineStatus()
  useMETARBadge()
  const update = useUpdate('superapp')

  // Changing defaultTab in Settings also navigates to that tab immediately
  const handleSettingsUpdate = (partial) => {
    updateSettings(partial)
    if ('defaultTab' in partial) setActiveCalculator(partial.defaultTab)
  }

  // Wraps setActiveCalculator to persist the last-used tab
  const handleSelectCalculator = React.useCallback((id) => {
    setActiveCalculator(id)
    if (id && settings.rememberLastTab) { try { localStorage.setItem('cb-lasttab', id) } catch (_) {} }
  }, [setActiveCalculator, settings.rememberLastTab])

  const [showSplash, setShowSplash] = useState(true)
  const onSplashFinish = React.useCallback(() => setShowSplash(false), [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('appearance')
  const openSettingsAbout = React.useCallback(() => {
    setSettingsInitialTab('about')
    setSettingsOpen(true)
  }, [])
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

  const navStyle    = settings.navStyle || 'launcher'
  const tabPosition = settings.tabPosition || 'top'
  const isLauncherHome = navStyle === 'launcher' && !activeCalculator

  // Same bottom offset the Resume Briefing pill uses below — shared so the
  // page can reserve equivalent space at the end of scrollable content,
  // otherwise the pill ends up sitting on top of the last tile or button
  // once you've scrolled all the way down (only matters on narrow viewports
  // where content spans edge-to-edge instead of leaving margin beside it).
  const showResumePill = !briefing.open && (briefing.data || briefing.saves.length > 0)
  const resumePillBottomOffset = navStyle === 'tabs' && tabPosition === 'bottom' ? 74 : 16

  const currentCalc      = activeCalculator ? CALCULATORS.find(c => c.id === activeCalculator) : undefined
  const CurrentComponent = currentCalc?.component
  // The calculator tab fills the exact remaining screen space (see
  // CombinedCalculator.jsx) instead of being sized by its content, so its
  // button grid can flex-fill both width and height with no empty margins
  // and no scroll — every other tab keeps today's normal scrolling page.
  const isCalcFullScreen = activeCalculator === 'calculator'

  // ── Migrate legacy tab IDs + choose the initial view ──────────────────
  React.useEffect(() => {
    if (LEGACY_ID_MAP[activeCalculator]) setActiveCalculator(LEGACY_ID_MAP[activeCalculator])
    if (LEGACY_ID_MAP[settings.defaultTab]) handleSettingsUpdate({ defaultTab: LEGACY_ID_MAP[settings.defaultTab] })
    const remembered = settings.rememberLastTab
      ? (() => { try {
          const last = localStorage.getItem('cb-lasttab')
          return last && CALCULATORS.find(c => c.id === last) ? last : null
        } catch (_) { return null } })()
      : null
    if (settings.navStyle === 'launcher') {
      setActiveCalculator(null)
    } else if (remembered) {
      setActiveCalculator(remembered)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Theme mode → effective darkMode (auto follows system, live) ────────
  React.useEffect(() => {
    const mode = settings.themeMode || 'dark'
    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => setDarkMode(mq.matches)
      apply()
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    setDarkMode(mode === 'dark')
  }, [settings.themeMode, setDarkMode])

  // ── Accent colour ──────────────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute('data-accent', resolveAccentId(settings.accentColor))
  }, [settings.accentColor])

  // ── Card style ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute('data-card', settings.cardStyle || 'elevated')
  }, [settings.cardStyle])

  // ── High contrast ──────────────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute('data-hico', settings.highContrast ? 'true' : 'false')
  }, [settings.highContrast])

  // Tabs / grouped styles must never sit on the empty launcher "home" state
  React.useEffect(() => {
    if (navStyle !== 'launcher' && !activeCalculator) {
      handleSelectCalculator(settings.defaultTab || orderedCalcs[0]?.id || 'calculator')
    }
  }, [navStyle, activeCalculator, settings.defaultTab, orderedCalcs, handleSelectCalculator])

  // Switching TO launcher always returns to the dashboard (ignore last-visited tab)
  React.useEffect(() => {
    if (navStyle === 'launcher') setActiveCalculator(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navStyle])

  // ── Sync darkMode → data-theme + persist ──────────────────────────────
  React.useEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('cb-theme', theme)
  }, [darkMode])

  // Theme change with a brief cross-fade
  const handleThemeChange = (mode) => {
    if (mode === settings.themeMode) return
    setFading(true)
    setTimeout(() => {
      updateSettings({ themeMode: mode })
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
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      {/* Keeps prayer times fresh app-wide so the dashboard widget works without
          opening the Qiblat & Solat tab. Gated on an already-known location so
          users who've never set one don't pay for the adhan.js chunk. */}
      {loadLastPosition() && (
        <Suspense fallback={null}>
          <PrayerBackgroundSync />
        </Suspense>
      )}
      <div style={{
        ...(isCalcFullScreen
          ? { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { minHeight: '100vh' }),
        background: 'var(--cp-bg)',
        fontFamily: 'var(--cb-font-body)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.14s ease',
        ...zoomStyle,
      }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header style={{
          background: 'linear-gradient(135deg, var(--cb-surface-0) 0%, var(--cb-surface-1) 60%, var(--cb-surface-0) 100%)',
          borderBottom: '1px solid var(--cp-border)',
          paddingTop: 'env(safe-area-inset-top)',
        }}>
          <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>

            {/* minWidth:0 lets this shrink instead of pushing the settings
                button off-screen at large font-scale on a narrow phone. */}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <BrandBanner subtitle="PILOT UTILITY SUITE" />
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { setSettingsInitialTab('appearance'); setSettingsOpen(true) }}
                className="cp-btn cp-settings-btn"
                style={{ position: 'relative' }}
                title={update.needRefresh ? 'Settings · update available' : 'Settings'}
                aria-label="Open settings"
              >
                ⚙
                {update.needRefresh && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2,
                    width: 9, height: 9, borderRadius: '50%',
                    background: 'var(--cp-acc)',
                    border: '1px solid var(--cp-bg2)',
                  }} />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* ── Navigation chrome (top) ──────────────────────────────────── */}
        {navStyle === 'tabs' && tabPosition === 'top' && (
          <TabBar calcs={orderedCalcs} activeId={activeCalculator}
            onSelect={handleSelectCalculator} position="top" />
        )}
        {navStyle === 'grouped' && (
          <GroupedNav calcs={orderedCalcs} activeId={activeCalculator}
            onSelect={handleSelectCalculator} />
        )}
        {navStyle === 'launcher' && !isLauncherHome && (
          <LauncherBackBar calc={currentCalc} onHome={() => setActiveCalculator(null)} />
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main
          className={isLauncherHome ? 'cb-grid-bg' : ''}
          style={{
            maxWidth: 960, margin: '0 auto', width: '100%',
            ...(isCalcFullScreen
              ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 12px 12px' }
              : {
                  padding: landscapeCompact ? '12px 24px 24px' : '24px 24px 48px',
                  ...(showResumePill ? {
                    paddingBottom: `max(${landscapeCompact ? 24 : 48}px, calc(${resumePillBottomOffset + 56}px + env(safe-area-inset-bottom)))`,
                  } : {}),
                }),
          }}
        >
          {isLauncherHome ? (
            <>
              <DashboardHome onSelect={handleSelectCalculator} widgets={settings.dashboardWidgets} />
              <LauncherGrid calcs={orderedCalcs} onSelect={handleSelectCalculator} />
            </>
          ) : (
            <div className="cp-card-bg2" style={{
              border: '1px solid var(--cp-border)',
              borderRadius: 4,
              ...(isCalcFullScreen
                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px' }
                : { padding: landscapeCompact ? '16px' : '24px', zoom: landscapeCompact ? 0.82 : undefined }),
            }}>
              <div key={activeCalculator}
                className="cp-calc-fade"
                style={isCalcFullScreen ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
                <ErrorBoundary name={currentCalc?.name} resetKey={activeCalculator}>
                  <Suspense fallback={<TabLoading />}>
                    {CurrentComponent && (
                      <CurrentComponent
                        clockFormat={settings.clockFormat || '24hr'}
                        {...(currentCalc.id === 'dutylog' ? { onOpenSettings: openSettingsAbout } : {})}
                      />
                    )}
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}
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
          <div>CLAUDEBORNE PILOT UTILITY SUITE · {APP_VERSION}</div>
        </footer>

        {/* Reserve scroll space so content clears the fixed bottom tab bar */}
        {navStyle === 'tabs' && tabPosition === 'bottom' && (
          <div aria-hidden="true" style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }} />
        )}
      </div>

      {/* ── Navigation chrome (bottom tabs) ──────────────────────────────── */}
      {navStyle === 'tabs' && tabPosition === 'bottom' && (
        <TabBar calcs={orderedCalcs} activeId={activeCalculator}
          onSelect={handleSelectCalculator} position="bottom" />
      )}

      {/* ── Offline banner ───────────────────────────────────────────── */}
      {!isOnline && (
        <div className="cp-offline-banner">
          ⊘ OFFLINE — SHOWING CACHED DATA
        </div>
      )}

      {/* ── Update prompt ────────────────────────────────────────────── */}
      <UpdatePrompt ready={!showSplash} update={update} />

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
            onThemeChange={handleThemeChange}
            settings={settings}
            onUpdate={handleSettingsUpdate}
            onClose={() => setSettingsOpen(false)}
            orderedCalcs={orderedCalcs}
            initialTab={settingsInitialTab}
            update={update}
          />
        </>
      )}

      {/* ── Briefing overlay — rendered here (not inside a tab) so switching
           tabs to look something up doesn't unmount it. Wrapped in the same
           ErrorBoundary every tab gets — without it, a render error here
           (e.g. an unexpected shape in cached/fetched data) white-screens
           the whole app instead of failing gracefully. `key` on BriefingView
           forces a real remount whenever the session changes — its fetch
           effect only runs once per mount, so without this, two openBriefing
           calls close enough together to land in the same React batch (no
           observable unmount in between) leave it silently showing stale
           loading/error state for the new route instead of refetching. Keyed
           on savedId too (not just route) — two saved entries for the same
           route (e.g. a turnaround) must still force a remount when switching
           between them, or the old one's title/tab state would linger. ── */}
      {briefing.open && (
        <ErrorBoundary name="Briefing" resetKey={`${briefing.route?.dep}-${briefing.route?.arr}-${briefing.savedId || ''}-${briefing.open}`}>
          <Suspense fallback={null}>
            <BriefingView key={`${JSON.stringify(briefing.route)}-${briefing.savedId || 'new'}`} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Resume Briefing pill — shown when the overlay is closed but
           there's something to bring back: a briefing paused mid-fetch (the
           NOTAM "view all" tab-jump) takes priority since it's still live
           in-progress work; otherwise it opens the most recently saved one. ── */}
      {showResumePill && (
        <button
          onClick={() => (briefing.data ? resumeBriefing() : openSavedBriefing(briefing.saves[0].id))}
          style={{
            position: 'fixed', right: 16, zIndex: 95,
            bottom: `calc(${resumePillBottomOffset}px + env(safe-area-inset-bottom))`,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
            background: 'var(--cp-bg2)', border: '1px solid var(--cp-acc)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', color: 'var(--cp-acc)',
          }}
        >
          ✈ RESUME BRIEFING
        </button>
      )}
    </>
  )
}
