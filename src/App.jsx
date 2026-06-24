import React, { useState, lazy, Suspense } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCalculatorStore } from './store/calculatorStore'
import usePrayerStore from './modules/prayer/store/prayerStore'
import UpdatePrompt from './components/UpdatePrompt'
import ErrorBoundary from './components/ErrorBoundary'
import { TabBar, GroupedNav, LauncherGrid, LauncherBackBar } from './components/Navigation'
import BrandBanner from '@brand/BrandBanner'
import { TabIcon, ICON_SETS } from './components/TabIcon'
import { searchZones } from './data/worldTimezones'

// Each tab is code-split into its own chunk, loaded on demand when first opened.
// vite-plugin-pwa precaches every emitted chunk, so offline still works.
const CombinedCalculator      = lazy(() => import('./components/CombinedCalculator'))
const InterpolationCalculator = lazy(() => import('./components/InterpolationCalculator'))
const EDTOCalculator          = lazy(() => import('./components/EDTOCalculator'))
const CurrencyCalculator      = lazy(() => import('./components/CurrencyCalculator'))
const METARTAFCalculator      = lazy(() => import('./components/METARTAFCalculator'))
const NotamViewer             = lazy(() => import('./components/NotamViewer'))
const FTLCalculator           = lazy(() => import('./components/FTLCalculator'))
const WorldTimeCalculator     = lazy(() => import('./components/WorldTimeCalculator'))
const PrayerModule            = lazy(() => import('./modules/prayer'))
const DutyLogModule           = lazy(() => import('./modules/dutylog'))
// Named export → adapt to the default shape React.lazy expects (same chunk as PrayerModule)
const PrayerSettings = lazy(() =>
  import('./modules/prayer').then(m => ({ default: m.PrayerSettings })))
const DutyLogBackupSync = lazy(() =>
  import('./modules/dutylog').then(m => ({ default: m.DutyLogBackupSync })))

export const CALCULATORS = [
  { id: 'calculator',    icon: '🧮',  name: 'Calculator',     component: CombinedCalculator },
  { id: 'interpolation', icon: '📐',  name: 'Interpolation',  component: InterpolationCalculator },
  { id: 'edto',          icon: '✈️', name: 'EDTO',           component: EDTOCalculator },
  { id: 'currency',      icon: '💱',  name: 'Currency',       component: CurrencyCalculator },
  { id: 'metartaf',      icon: '🌤️', name: 'METAR/TAF',      component: METARTAFCalculator },
  { id: 'notam',         icon: '📋',  name: 'NOTAM',          component: NotamViewer },
  { id: 'ftl',           icon: '⏳',  name: 'FTL',            component: FTLCalculator },
  { id: 'dutylog',       icon: '🛫',  name: 'Duty Log',       component: DutyLogModule },
  { id: 'worldtime',     icon: '🌐',  name: 'World Time',     component: WorldTimeCalculator },
  { id: 'prayer',        icon: '🕌',  name: 'Qiblat & Solat', component: PrayerModule },
]

// IDs that no longer exist — remap to 'calculator'
const LEGACY_IDS = new Set(['normal', 'scientific', 'time', 'densityalt', 'tas'])

const FONT_SCALES = { compact: 0.88, normal: 1, large: 1.13, cockpit: 1.26 }

const APP_VERSION = 'v3.12'

// Matches elogbook's ACCENT_PRESETS (src/SettingsModal.jsx) — same ids, same hex values.
const ACCENT_SWATCHES = [
  { value: 'gradient', color: '#3FE0C5', colors: ['#3FE0C5', '#3B8DFF', '#5B6BFF'] },
  { value: 'mint',     color: '#3FE0C5' },
  { value: 'blue',     color: '#3B8DFF' },
  { value: 'violet',   color: '#5B6BFF' },
  { value: 'amber',    color: '#FFB37C' },
  { value: 'emerald',  color: '#10d983' },
  { value: 'rose',     color: '#f43f5e' },
  { value: 'cyan',     color: '#06b6d4' },
  { value: 'gold',     color: '#eab308' },
  { value: 'coral',    color: '#f97316' },
]

// Old swatch ids from before the cross-app palette merge — kept so previously
// saved/exported settings still resolve to a valid accent.
const ACCENT_MIGRATION = { teal: 'gradient', green: 'emerald' }
const resolveAccentId = (id) => ACCENT_MIGRATION[id] || id || 'gradient'

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
        const c = JSON.parse(localStorage.getItem('cb-metar-cache'))
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
  } = useCalculatorStore()

  const isOnline = useOnlineStatus()
  useMETARBadge()

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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('appearance')
  const openSettingsAbout = React.useCallback(() => {
    setSettingsInitialTab('about')
    setSettingsOpen(true)
  }, [])
  const [searchOpen,   setSearchOpen]   = useState(false)
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

  const currentCalc      = activeCalculator ? CALCULATORS.find(c => c.id === activeCalculator) : undefined
  const CurrentComponent = currentCalc?.component

  // ── Migrate legacy tab IDs + choose the initial view ──────────────────
  React.useEffect(() => {
    if (LEGACY_IDS.has(activeCalculator)) setActiveCalculator('calculator')
    if (LEGACY_IDS.has(settings.defaultTab)) handleSettingsUpdate({ defaultTab: 'calculator' })
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
      <div style={{
        minHeight: '100vh',
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

            <BrandBanner subtitle="PILOT UTILITY SUITE" />

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setSearchOpen(true)}
                className="cp-btn"
                style={{ fontSize: 15, padding: '6px 12px' }}
                title="Search tools"
                aria-label="Search tools"
              >
                ⌕
              </button>
              <button
                onClick={() => { setSettingsInitialTab('appearance'); setSettingsOpen(true) }}
                className="cp-btn"
                style={{ fontSize: 15, padding: '6px 12px' }}
                title="Settings"
                aria-label="Open settings"
              >
                ⚙
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
            maxWidth: 960, margin: '0 auto',
            padding: landscapeCompact ? '12px 24px 24px' : '24px 24px 48px',
          }}
        >
          {isLauncherHome ? (
            <>
              <DashboardHome onSelect={handleSelectCalculator} widgets={settings.dashboardWidgets} />
              <LauncherGrid calcs={orderedCalcs} onSelect={handleSelectCalculator} />
            </>
          ) : (
            <div style={{
              background: 'var(--cp-bg2)',
              border: '1px solid var(--cp-border)',
              borderRadius: 4,
              padding: landscapeCompact ? '16px' : '24px',
              zoom: landscapeCompact ? 0.82 : undefined,
            }}>
              <div key={activeCalculator}
                className="cp-calc-fade">
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
          <div>CLAUDEBORNE PILOT UTILITY SUITE · PWA OFFLINE CAPABLE</div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em' }}>{APP_VERSION}</div>
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
      <UpdatePrompt />

      {/* ── Search overlay ───────────────────────────────────────────── */}
      {searchOpen && (
        <SearchOverlay
          calcs={orderedCalcs}
          onSelect={(id) => { handleSelectCalculator(id); setSearchOpen(false) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

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
          />
        </>
      )}
    </>
  )
}

// ── Dashboard Home ──────────────────────────────────────────────────────────
function DashboardHome({ onSelect, widgets = { utc: true, prayer: true, metar: true } }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const prayerTimes = usePrayerStore(s => s.prayerTimes)

  const utcStr  = new Date(now).toISOString().slice(11, 19) + 'Z'
  const utcDate = new Date(now).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })

  // METAR status — read last fetch age from cache
  const metarAge = React.useMemo(() => {
    try {
      const c = JSON.parse(localStorage.getItem('cb-metar-cache'))
      if (!c?.fetchedAt) return null
      const min = Math.floor((now - c.fetchedAt) / 60000)
      if (min < 1)  return 'LIVE'
      if (min < 60) return `${min}M AGO`
      const h = Math.floor(min / 60)
      return `${h}H AGO`
    } catch { return null }
  }, [now])

  const metarRoute = React.useMemo(() => {
    try {
      const c = JSON.parse(localStorage.getItem('cb-metar-cache'))
      const parts = [c?.dep, c?.arr].filter(Boolean)
      return parts.length ? parts.join('→') : null
    } catch { return null }
  }, [now])

  // Prayer — next prayer from live in-memory store (avoids raw localStorage parsing)
  const nextPrayer = React.useMemo(() => {
    try {
      const times = prayerTimes
      if (!times || typeof times !== 'object') return null
      const nowMs = now
      const PRAYERS = [
        { label: 'Fajr',    key: 'fajrDate' },
        { label: 'Dhuhr',   key: 'dhuhrDate' },
        { label: 'Asr',     key: 'asrDate' },
        { label: 'Maghrib', key: 'maghribDate' },
        { label: 'Isha',    key: 'ishaDate' },
      ]
      const upcoming = PRAYERS
        .map(p => ({ label: p.label, t: new Date(times[p.key]).getTime() }))
        .filter(p => !isNaN(p.t) && p.t > nowMs)
      let first
      if (!upcoming.length) {
        // All prayers passed — show next day's Fajr
        const fajrMs = new Date(times.fajrDate).getTime()
        if (isNaN(fajrMs)) return null
        first = { label: 'Fajr', t: fajrMs + 86_400_000 }
      } else {
        first = upcoming[0]
      }
      const diff = first.t - nowMs
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      const countdown = h > 0 ? `${h}H ${m}M ${s}S` : m > 0 ? `${m}M ${s}S` : `${s}S`
      return { label: first.label.toUpperCase(), countdown }
    } catch { return null }
  }, [now, prayerTimes])

  const W = {
    background: 'var(--cp-bg3)',
    border: '1px solid var(--cp-border2)',
    borderTop: '2px solid var(--cp-acc)',
    borderRadius: 6, padding: '14px 16px', flex: 1, minWidth: 0,
    boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
    cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
  }

  const showUtc    = widgets.utc !== false
  const showPrayer = widgets.prayer !== false && nextPrayer
  const showMetar  = widgets.metar !== false && metarAge
  if (!showUtc && !showPrayer && !showMetar) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

        {/* UTC clock */}
        {showUtc && (
        <div className="cp-launch-card" style={W} onClick={() => onSelect('worldtime')}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
            color: 'var(--cp-dim)', marginBottom: 6 }}>UTC / ZULU</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
            color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums' }}>{utcStr}</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
            letterSpacing: '0.06em', marginTop: 5 }}>{utcDate}</div>
        </div>
        )}

        {/* Next prayer */}
        {showPrayer && (
          <div className="cp-launch-card" style={W} onClick={() => onSelect('prayer')}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--cp-dim)', marginBottom: 6 }}>NEXT PRAYER</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 700,
              color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
              fontVariantNumeric: 'tabular-nums' }}>{nextPrayer.countdown}</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
              letterSpacing: '0.1em', marginTop: 5 }}>{nextPrayer.label}</div>
          </div>
        )}

        {/* METAR status */}
        {showMetar && (
          <div className="cp-launch-card" style={W} onClick={() => onSelect('metartaf')}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--cp-dim)', marginBottom: 6 }}>METAR</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
              color: metarAge === 'LIVE' ? 'var(--cp-green)' : 'var(--cp-acc)',
              letterSpacing: '0.04em', lineHeight: 1 }}>{metarAge}</div>
            {metarRoute && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
                letterSpacing: '0.1em', marginTop: 5 }}>{metarRoute}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Search Overlay ──────────────────────────────────────────────────────────
function SearchOverlay({ calcs, onSelect, onClose }) {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = React.useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const out = []
    const qU  = q.toUpperCase()

    // Tool name search
    for (const c of calcs) {
      if (c.name.toUpperCase().includes(qU) || c.id.toUpperCase().includes(qU)) {
        out.push({ key: `tool-${c.id}`, icon: c.icon, label: c.name, sub: 'TOOL', action: () => onSelect(c.id) })
      }
    }

    // Airport/zone search — produces World Time + METAR + NOTAM shortcuts
    const zones = searchZones(q)
    const seenIcao = new Set()
    for (const z of zones) {
      out.push({ key: `wt-${z.label}`, icon: '🌐', label: z.label, sub: `${z.country} · WORLD TIME`, action: () => onSelect('worldtime') })
      if (z.icao && !seenIcao.has(z.icao)) {
        seenIcao.add(z.icao)
        out.push({ key: `mt-${z.icao}`, icon: '🌤️', label: `METAR/TAF · ${z.icao}`, sub: z.label, action: () => onSelect('metartaf') })
        out.push({ key: `nt-${z.icao}`, icon: '📋', label: `NOTAM · ${z.icao}`,     sub: z.label, action: () => onSelect('notam') })
      }
    }

    return out.slice(0, 9)
  }, [query, calcs, onSelect])

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150,
        backdropFilter: 'blur(3px)',
      }} />
      <div className="cp-search-anim" style={{
        position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
        width: 'min(520px, 92vw)', zIndex: 160,
        background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)',
        borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--cp-border)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, color: 'var(--cp-dim)' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tools or airport…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)',
              letterSpacing: '0.04em',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{
              background: 'none', border: 'none', color: 'var(--cp-dim)',
              cursor: 'pointer', fontSize: 14, padding: '2px 4px',
            }}>✕</button>
          )}
        </div>
        {results.length > 0 ? (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {results.map(r => (
              <button key={r.key} onClick={r.action} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', background: 'transparent',
                border: 'none', borderBottom: '1px solid var(--cp-border3)',
                padding: '11px 14px', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--cp-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
                <div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12,
                    color: 'var(--cp-txt)', letterSpacing: '0.06em' }}>{r.label}</div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
                    color: 'var(--cp-dim)', letterSpacing: '0.12em', marginTop: 2 }}>{r.sub}</div>
                </div>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div style={{ padding: '20px 14px', fontFamily: 'var(--cb-font-mono)', fontSize: 10,
            letterSpacing: '0.14em', color: 'var(--cp-dim)', textAlign: 'center' }}>
            NO RESULTS FOR "{query.toUpperCase()}"
          </div>
        ) : (
          <div style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {calcs.slice(0, 6).map(c => (
              <button key={c.id} onClick={() => onSelect(c.id)} style={{
                background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)',
                borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
                fontFamily: 'var(--cb-font-mono)', fontSize: 10,
                letterSpacing: '0.1em', color: 'var(--cp-muted)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <TabIcon id={c.id} emoji={c.icon} size={13} />{c.name.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Settings tabs ───────────────────────────────────────────────────────────
const SETTINGS_TABS = [
  { id: 'appearance', label: 'APPEARANCE', icon: '🎨' },
  { id: 'navigation', label: 'NAVIGATION', icon: '🧭' },
  { id: 'tools',      label: 'TOOLS',      icon: '🛠' },
  { id: 'prayer',     label: 'PRAYER',     icon: '🕌' },
  { id: 'about',      label: 'ABOUT',      icon: 'ⓘ'  },
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
function SettingsPanel({ onThemeChange, settings, onUpdate, onClose, orderedCalcs, initialTab = 'appearance' }) {
  const panelRef = React.useRef(null)
  const [activeTab, setActiveTab] = React.useState(initialTab)
  const isWide = useMediaQuery('(min-width: 768px)')   // ≥768 → modal+rail, else sheet+strip
  const animate = true

  // Restore focus to previous element when panel closes
  React.useEffect(() => {
    const prevFocus = document.activeElement
    const first = panelRef.current?.querySelector(FOCUSABLE_SEL)
    if (first) first.focus()
    return () => {
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [])

  // Focus trap — scoped to the panel element via onKeyDown prop (see panel divs below)
  const handlePanelKeyDown = React.useCallback((e) => {
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
  }, [])

  const [orderOpen, setOrderOpen] = React.useState(false)
  const dash = settings.dashboardWidgets || {}
  const setDash = (k, v) => onUpdate({ dashboardWidgets: { ...dash, [k]: v } })

  // ── Per-tab content ──
  const tabContent = (
    <>
      {activeTab === 'appearance' && (
        <>
          <SettingsSection title="THEME">
            <SettingsRow label="MODE">
              <SegmentedToggle
                options={[{ value: 'dark', label: 'DARK' }, { value: 'light', label: 'LIGHT' }, { value: 'auto', label: 'AUTO' }]}
                value={settings.themeMode || 'dark'}
                onChange={v => onThemeChange(v)}
              />
            </SettingsRow>
            <SettingsRow label="ACCENT">
              <AccentSwatches value={resolveAccentId(settings.accentColor)} onChange={v => onUpdate({ accentColor: v })} />
            </SettingsRow>
            <SettingsRow label="CARD STYLE">
              <SegmentedToggle
                options={[{ value: 'flat', label: 'FLAT' }, { value: 'elevated', label: 'RAISED' }, { value: 'glass', label: 'GLASS' }]}
                value={settings.cardStyle || 'elevated'}
                onChange={v => onUpdate({ cardStyle: v })}
              />
            </SettingsRow>
            <SettingsRow label="ICONS">
              <SegmentedToggle
                options={ICON_SETS.map(s => ({ value: s.id, label: s.label }))}
                value={settings.iconSet || 'classic'}
                onChange={v => onUpdate({ iconSet: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="READABILITY">
            <SettingsRow label="FONT SIZE">
              <SegmentedToggle
                options={[
                  { value: 'compact', label: 'SM' },
                  { value: 'normal',  label: 'MD' },
                  { value: 'large',   label: 'LG' },
                  { value: 'cockpit', label: 'XL' },
                ]}
                value={settings.fontScale}
                onChange={v => onUpdate({ fontScale: v })}
              />
            </SettingsRow>
            <SettingsRow label="HIGH CONTRAST">
              <SegmentedToggle
                options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                value={settings.highContrast || false}
                onChange={v => onUpdate({ highContrast: v })}
              />
            </SettingsRow>
            <SettingsRow label="CLOCK FORMAT">
              <SegmentedToggle
                options={[{ value: '24hr', label: '24 HR' }, { value: '12hr', label: '12 HR' }]}
                value={settings.clockFormat || '24hr'}
                onChange={v => onUpdate({ clockFormat: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="FEEDBACK">
            <SettingsRow label="HAPTIC">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={settings.haptic}
                onChange={v => onUpdate({ haptic: v })}
              />
            </SettingsRow>
            {settings.haptic && (
              <SettingsRow label="HAPTIC STRENGTH">
                <SegmentedToggle
                  options={[{ value: 'light', label: 'LOW' }, { value: 'medium', label: 'MED' }, { value: 'heavy', label: 'HIGH' }]}
                  value={settings.hapticIntensity || 'medium'}
                  onChange={v => onUpdate({ hapticIntensity: v })}
                />
              </SettingsRow>
            )}
          </SettingsSection>
        </>
      )}

      {activeTab === 'navigation' && (
        <>
          <SettingsSection title="LAYOUT">
            <SettingsRow label="STYLE">
              <select
                value={settings.navStyle}
                onChange={e => onUpdate({ navStyle: e.target.value })}
                style={selectStyle}
              >
                <option value="launcher">LAUNCHER</option>
                <option value="tabs">TABS</option>
                <option value="grouped">GROUPED</option>
              </select>
            </SettingsRow>
            {settings.navStyle === 'tabs' && (
              <SettingsRow label="TAB POSITION">
                <SegmentedToggle
                  options={[{ value: 'top', label: 'TOP' }, { value: 'bottom', label: 'BOTTOM' }]}
                  value={settings.tabPosition}
                  onChange={v => onUpdate({ tabPosition: v })}
                />
              </SettingsRow>
            )}
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
            <SettingsRow label="REMEMBER LAST TAB">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={settings.rememberLastTab !== false}
                onChange={v => onUpdate({ rememberLastTab: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="DASHBOARD WIDGETS">
            <SettingsRow label="UTC CLOCK">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={dash.utc !== false}
                onChange={v => setDash('utc', v)}
              />
            </SettingsRow>
            <SettingsRow label="NEXT PRAYER">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={dash.prayer !== false}
                onChange={v => setDash('prayer', v)}
              />
            </SettingsRow>
            <SettingsRow label="METAR STATUS">
              <SegmentedToggle
                options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
                value={dash.metar !== false}
                onChange={v => setDash('metar', v)}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="TAB ORDER">
            <button onClick={() => setOrderOpen(o => !o)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 4,
              padding: '8px 12px', cursor: 'pointer',
              fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--cp-muted)',
            }}>
              CUSTOMISE ORDER
              <span style={{ color: 'var(--cp-dim)' }}>{orderOpen ? '▲' : '▼'}</span>
            </button>
            {orderOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {orderedCalcs.map((calc, idx) => (
                  <div key={calc.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)',
                    borderRadius: 4, padding: '5px 8px',
                  }}>
                    <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-muted)', letterSpacing: '0.1em' }}>
                      <TabIcon id={calc.id} emoji={calc.icon} size={13} style={{ marginRight: 6, opacity: 0.6 }} />
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
            )}
          </SettingsSection>
        </>
      )}

      {activeTab === 'tools' && (
        <>
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

          <SettingsSection title="NOTAM">
            <SettingsRow label="SORT WITHIN LOCATION">
              <SegmentedToggle
                options={[{ value: 'relevance', label: 'RELEVANCE' }, { value: 'category', label: 'CATEGORY' }]}
                value={settings.notamSort}
                onChange={v => onUpdate({ notamSort: v })}
              />
            </SettingsRow>
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

          <SettingsSection title="BACKUP & SYNC">
            <Suspense fallback={<TabLoading compact />}>
              <DutyLogBackupSync />
            </Suspense>
          </SettingsSection>

          <SettingsSection title="CHANGELOG">
            <Changelog />
          </SettingsSection>
          <div style={{
            textAlign: 'center', fontFamily: 'var(--cb-font-mono)',
            fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-dim)', paddingTop: 4,
          }}>
            CLAUDEBORNE PILOT UTILITY SUITE · {APP_VERSION}
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
        onKeyDown={handlePanelKeyDown}
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
      onKeyDown={handlePanelKeyDown}
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

// ── Changelog ───────────────────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: 'v3.12', date: 'Jun 2026',
    entries: [
      { type: 'feat', text: 'Duty Log: Backup & Sync redesign — each device claims ownership of a sync code; only the owner can push, and restoring/importing transfers ownership to the new device' },
      { type: 'feat', text: 'Duty Log: per-entry sync status on each log card (SYNCED dot or a one-tap ○ SYNC), plus a prompt to sync right after creating a new log' },
      { type: 'feat', text: 'Duty Log: new "Have a code? Enter here to view it" panel — view another device\'s backed-up logs read-only, with an optional confirm-gated import that overwrites local logs and transfers ownership' },
      { type: 'feat', text: 'Settings: sync code & QR now always visible once created, instead of hidden behind a tab; restore now requires a two-tap in-place confirmation instead of a browser dialog' },
    ],
  },
  {
    version: 'v3.11', date: 'Jun 2026',
    entries: [
      { type: 'feat', text: 'Duty Log: Backup & Sync — back up your logs to the cloud and restore them on another device using a short anonymous code (no account required)' },
      { type: 'feat', text: 'Duty Log: Backup & Sync moved into Settings, with a status card showing last-synced time and a BACKUP / RESTORE tab switcher' },
      { type: 'feat', text: 'Duty Log: generate a QR code for your backup code, or scan one with the camera to restore — manual code entry still works as a fallback' },
      { type: 'fix',  text: 'Settings: removed the JSON export/import and reset-to-defaults section, superseded by Duty Log Backup & Sync' },
    ],
  },
  {
    version: 'v3.10', date: 'Jun 2026',
    entries: [
      { type: 'fix',  text: 'Header banner color now updates correctly in light mode' },
      { type: 'fix',  text: 'Removed swipe gesture navigation (was triggering unintended tab changes)' },
      { type: 'fix',  text: 'Flight prayer tab coordinates now shown in N/E degree-minute notation' },
      { type: 'feat', text: 'Per-module RESET buttons (Calculator, METAR/TAF, NOTAM, Interpolation, EDTO, Currency, FTL, Flight prayer) replace the old global "Reset All", each confirming before clearing' },
      { type: 'feat', text: 'Duty Log: past entries auto-group into collapsible year › month banners; current month and undated entries stay flat' },
      { type: 'feat', text: 'Duty Log: disclaimer that logs are stored on-device only and are not synced' },
      { type: 'feat', text: 'Calculator: new Volume, Area, Pressure, Time, and Angle conversion categories, plus a Fuel mass/volume converter with a density input' },
      { type: 'feat', text: 'Calculator: unit converter moved out of Scientific mode into its own CONVERT mode' },
      { type: 'feat', text: 'METAR/TAF and NOTAM: swap (⇄) button for departure/arrival fields' },
      { type: 'fix',  text: 'Combined Calculator and FTL: RESET button no longer clips into the row below it' },
    ],
  },
  {
    version: 'v3.9', date: 'Jun 2026',
    entries: [
      { type: 'fix',  text: 'Flight: clock-mode local-time elapsed calc anchored to the wrong calendar date, could show 100% complete shortly after a UTC+8 morning departure' },
      { type: 'feat', text: 'Flight: in-flight prayer timeline — plots every Imsak/Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha along the route (replaces the single position snapshot), including repeats on long-haul flights' },
      { type: 'feat', text: 'Flight: DEP TIME / ARR TIME toggle — read the same in-flight prayer moment on either the departure or arrival watch' },
      { type: 'feat', text: 'Flight: current-position card with manual refresh button; auto-refreshes when returning to the tab or the app is foregrounded' },
      { type: 'fix',  text: 'Flight: timeline rows now spaced proportionally to elapsed time so the progress line lines up exactly with the current-position marker' },
    ],
  },
  {
    version: 'v3.8', date: 'Jun 2026',
    entries: [
      { type: 'feat', text: 'Prayer: 5-day prayer times — day selector strip shows today + 4 days, computed offline instantly' },
      { type: 'fix',  text: 'Prayer: next prayer widget now counts down to next day\'s Fajr after Isha (no more disappearing)' },
      { type: 'fix',  text: 'Prayer: launcher style always opens dashboard home, ignoring remembered last tab' },
      { type: 'feat', text: 'Flight: clock mode local time is timezone-aware — dep/arr interpreted in airport\'s own timezone' },
      { type: 'feat', text: 'Flight: live flight time banner shows total duration + UTC offsets as you type' },
      { type: 'feat', text: 'Flight: swap button (⇄) swaps dep/dest for quick return-leg entry' },
      { type: 'feat', text: 'Flight: cabin direction dial updated to narrow-body airliner silhouette' },
      { type: 'fix',  text: 'Flight: departure label updated to DEP TIME (ETD); disclaimer updated' },
      { type: 'fix',  text: 'Airport database: 4,906 airports; 4,345 now carry IANA timezone data' },
    ],
  },
  {
    version: 'v3.7', date: 'Jun 2026',
    entries: [
      { type: 'feat', text: 'Currency: all pairs available offline — rates cached on first use, auto-refreshed on open' },
      { type: 'fix',  text: 'Currency: offline shows last downloaded rates with age and effective date (3-tier fallback)' },
      { type: 'fix',  text: 'NOTAM: offline viewing after restart now works correctly' },
      { type: 'fix',  text: 'METAR: weather tokens no longer appear garbled in plain-English decode' },
      { type: 'fix',  text: 'METAR: history-window setting change now syncs to the active session immediately' },
      { type: 'fix',  text: 'METAR: auto-refresh only fires when flight routes are entered' },
      { type: 'fix',  text: 'Prayer: city search and GPS geocoding comply with OpenStreetMap ToS' },
      { type: 'fix',  text: 'Prayer: GPS location no longer re-read on every render (faster startup)' },
      { type: 'fix',  text: 'Prayer: offline mode no longer auto-switches to the flight tab' },
      { type: 'fix',  text: 'FTL: time label corrected to "LOCAL TIME AT REPORTING"' },
      { type: 'fix',  text: 'FTL: helicopter option greyed out with tooltip (tables not yet available)' },
      { type: 'fix',  text: 'FTL: DST ambiguity in flight-time UTC conversion corrected (two-pass)' },
      { type: 'fix',  text: 'Scientific calculator: scientific notation (1e-3, 2.5e6) now evaluates correctly' },
      { type: 'fix',  text: 'Settings: import validates structure before applying; malformed files rejected' },
      { type: 'fix',  text: 'Settings: keyboard navigation in settings panel corrected' },
      { type: 'fix',  text: 'Dashboard: next-prayer widget reads live times (no stale display after midnight)' },
      { type: 'fix',  text: 'Update checker: interval and visibility listener cleaned up on unmount' },
      { type: 'fix',  text: 'Error boundary: label updated to "DEBUG INFO — copy when reporting a bug"' },
      { type: 'fix',  text: 'Changelog badges: Android WebView compatibility improved' },
      { type: 'fix',  text: 'Service worker: removed duplicate registration that conflicted with PWA plugin' },
    ],
  },
  {
    version: 'v3.6', date: 'Jun 2026',
    entries: [
      { type: 'feat', text: 'Settings reorganised into Appearance / Navigation / Tools / Prayer / About' },
      { type: 'feat', text: 'Theme AUTO mode — follows system light/dark in real time' },
      { type: 'feat', text: 'Five accent colours: teal, amber, cyan, violet, green' },
      { type: 'feat', text: 'Card style: flat / raised / glass' },
      { type: 'feat', text: 'Global clock format — one 12/24h setting for all clocks' },
      { type: 'feat', text: 'Unit preferences (temp, wind, visibility, altitude, pressure)' },
      { type: 'feat', text: 'Export / import settings as JSON; reset settings to defaults' },
      { type: 'feat', text: 'Haptic strength, dashboard widget toggles, confirm-before-reset' },
      { type: 'fix',  text: 'Auto-detect app updates without manual check' },
      { type: 'feat', text: 'Flight Duty Log — new module for logging sectors, fuel, times, ENG OUT data, crew, and per-sector remarks with offline persistence' },
    ],
  },
  {
    version: 'v3.5', date: 'Jun 2026',
    entries: [
      { type: 'fix', text: 'NOTAM inputs & results persist to localStorage for offline viewing' },
      { type: 'fix', text: 'Show "No NOTAMs available" per location when API returns nothing' },
      { type: 'fix', text: 'Dhuha styled as full prayer row; greys out with ✓ after time passes' },
      { type: 'fix', text: 'UTC/Z toggle relabelled to UTC / ZULU' },
    ],
  },
  {
    version: 'v3.0', date: '2025',
    entries: [
      { type: 'feat', text: 'Scientific calculator — expression engine + unit converter' },
      { type: 'feat', text: 'Flight tab — clock-time mode (dep/arr) with UTC/local toggle' },
      { type: 'feat', text: 'Dhuha prayer time added' },
      { type: 'feat', text: 'NOTAM revamped — grouped by location, role-coloured, filterable' },
      { type: 'feat', text: 'Full OurAirports dataset (worldwide ICAO coverage)' },
      { type: 'fix',  text: 'Day-shifted prayer times from UTC cache key' },
      { type: 'fix',  text: 'Reset All no longer leaves stale fields' },
    ],
  },
  {
    version: 'v2.x', date: '2024–2025',
    entries: [
      { type: 'feat', text: 'METAR/TAF flight category + wind severity colour coding' },
      { type: 'feat', text: 'METAR/TAF plain-English decode toggle' },
      { type: 'feat', text: 'Imsak & Sunrise styled as reference times' },
      { type: 'feat', text: 'Prayer times auto-refresh after midnight' },
      { type: 'feat', text: 'Launcher / tabs / grouped navigation styles' },
      { type: 'feat', text: 'Settings responsive tabbed UI (sheet on mobile, modal on desktop)' },
      { type: 'feat', text: 'Per-tab error boundaries + code-split lazy loading' },
      { type: 'fix',  text: 'Qibla compass — rotate with device, true North tracking' },
      { type: 'feat', text: 'NOTAM module — autorouter.aero OAuth proxy' },
      { type: 'feat', text: 'Vitest unit tests (92 tests)' },
    ],
  },
]

const TYPE_COLOR = {
  feat: { color: 'var(--cp-acc)',    label: 'NEW', bg: 'rgba(63,224,197,0.12)',   borderColor: 'rgba(63,224,197,0.30)'   },
  fix:  { color: 'var(--cp-orange)', label: 'FIX', bg: 'rgba(253,186,116,0.12)',  borderColor: 'rgba(253,186,116,0.30)'  },
}

function Changelog() {
  const [open, setOpen] = React.useState(() => new Set([CHANGELOG[0].version]))
  const toggle = (v) => setOpen(prev => {
    const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CHANGELOG.map(({ version, date, entries }) => {
        const expanded = open.has(version)
        return (
          <div key={version} style={{ border: '1px solid var(--cp-border2)', borderRadius: 4, overflow: 'hidden' }}>
            <button onClick={() => toggle(version)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              background: expanded ? 'var(--cp-accdim)' : 'var(--cp-bg3)',
              border: 'none', padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700,
                color: 'var(--cp-acc)', letterSpacing: '0.1em' }}>{version}</span>
              <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
                color: 'var(--cp-dim)', letterSpacing: '0.1em' }}>{date}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--cb-font-mono)', fontSize: 10,
                color: 'var(--cp-dim)' }}>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.map((e, i) => {
                  const t = TYPE_COLOR[e.type] ?? TYPE_COLOR.feat
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, fontWeight: 700,
                        letterSpacing: '0.1em', color: t.color, flexShrink: 0,
                        background: t.bg,
                        border: `1px solid ${t.borderColor}`,
                        borderRadius: 3, padding: '1px 5px' }}>{t.label}</span>
                      <span style={{ fontFamily: 'var(--cb-font-body)', fontSize: 12,
                        color: 'var(--cp-muted)', lineHeight: 1.5 }}>{e.text}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
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

function AccentSwatches({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {ACCENT_SWATCHES.map(s => {
        const active = value === s.value
        return (
          <button key={s.value} onClick={() => onChange(s.value)}
            aria-label={s.value} title={s.value.toUpperCase()}
            style={{
              width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
              background: s.colors ? `linear-gradient(135deg, ${s.colors.join(', ')})` : s.color, padding: 0,
              border: active ? '2px solid var(--cp-txt)' : '2px solid transparent',
              boxShadow: active ? `0 0 0 2px ${s.color}` : 'none',
              transition: 'box-shadow 0.12s',
            }} />
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
