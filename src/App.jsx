import React, { useState, lazy, Suspense } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCalculatorStore } from './store/calculatorStore'
import UpdatePrompt from './components/UpdatePrompt'
import ErrorBoundary from './components/ErrorBoundary'
import { TabBar, GroupedNav, LauncherGrid, LauncherBackBar, NAV_GROUPS } from './components/Navigation'
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
// Named export → adapt to the default shape React.lazy expects (same chunk as PrayerModule)
const PrayerSettings = lazy(() =>
  import('./modules/prayer').then(m => ({ default: m.PrayerSettings })))

export const CALCULATORS = [
  { id: 'calculator',    icon: '🧮',  name: 'Calculator',     component: CombinedCalculator },
  { id: 'interpolation', icon: '📐',  name: 'Interpolation',  component: InterpolationCalculator },
  { id: 'edto',          icon: '✈️', name: 'EDTO',           component: EDTOCalculator },
  { id: 'currency',      icon: '💱',  name: 'Currency',       component: CurrencyCalculator },
  { id: 'metartaf',      icon: '🌤️', name: 'METAR/TAF',      component: METARTAFCalculator },
  { id: 'notam',         icon: '📋',  name: 'NOTAM',          component: NotamViewer },
  { id: 'ftl',           icon: '⏳',  name: 'FTL',            component: FTLCalculator },
  { id: 'worldtime',     icon: '🌐',  name: 'World Time',     component: WorldTimeCalculator },
  { id: 'prayer',        icon: '🕌',  name: 'Qiblat & Solat', component: PrayerModule },
]

// IDs that no longer exist — remap to 'calculator'
const LEGACY_IDS = new Set(['normal', 'scientific', 'time', 'densityalt', 'tas'])

const FONT_SCALES = { compact: 0.88, normal: 1, large: 1.13, cockpit: 1.26 }

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
    resetAll, resetCount, darkMode, toggleDarkMode,
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
    if (id) { try { localStorage.setItem('cb-lasttab', id) } catch (_) {} }
  }, [setActiveCalculator])

  const [settingsOpen, setSettingsOpen] = useState(false)
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
    if (settings.navStyle === 'launcher') {
      setActiveCalculator(null)
    } else {
      // Restore last-used tab for tabs/grouped mode instead of always defaulting
      try {
        const last = localStorage.getItem('cb-lasttab')
        if (last && CALCULATORS.find(c => c.id === last)) setActiveCalculator(last)
      } catch (_) {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Accent colour ──────────────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute('data-accent', settings.accentColor || 'teal')
  }, [settings.accentColor])

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

  // ── Swipe gesture (grouped nav — swipe between tools in the active group) ──
  const touchX = React.useRef(null)
  const handleTouchStart = React.useCallback((e) => {
    touchX.current = e.touches[0].clientX
  }, [])
  const handleTouchEnd = React.useCallback((e) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 60) return
    const byId = Object.fromEntries(CALCULATORS.map(c => [c.id, c]))
    const group = NAV_GROUPS.find(g => g.members.includes(activeCalculator))
    if (!group) return
    const members = group.members.filter(id => byId[id])
    const idx = members.indexOf(activeCalculator)
    if (idx < 0) return
    const next = dx < 0 ? members[idx + 1] : members[idx - 1]
    if (next) handleSelectCalculator(next)
  }, [activeCalculator, handleSelectCalculator])

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
                onClick={() => setSearchOpen(true)}
                className="cp-btn"
                style={{ fontSize: 15, padding: '6px 12px' }}
                title="Search tools"
                aria-label="Search tools"
              >
                ⌕
              </button>
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
          style={{
            maxWidth: 960, margin: '0 auto',
            padding: landscapeCompact ? '12px 24px 24px' : '24px 24px 48px',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isLauncherHome ? (
            <>
              <DashboardHome onSelect={handleSelectCalculator} />
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
              <div key={`${activeCalculator}-${resetCount}`}
                className={settings.reduceMotion ? '' : 'cp-calc-fade'}>
                <ErrorBoundary name={currentCalc?.name} resetKey={activeCalculator}>
                  <Suspense fallback={<TabLoading />}>
                    {CurrentComponent && <CurrentComponent />}
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
          <div>CLAUDEBORNE SUPERAPP · PWA OFFLINE CAPABLE</div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em' }}>v3.5</div>
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
          reduceMotion={settings.reduceMotion}
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

// ── Dashboard Home ──────────────────────────────────────────────────────────
function DashboardHome({ onSelect }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

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
  }, [])

  // Prayer — next prayer from persisted store
  const nextPrayer = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('prayer-module-store')
      if (!raw) return null
      const store = JSON.parse(raw)
      const times = store?.state?.prayerTimes
      if (!Array.isArray(times)) return null
      const nowMs = now
      const refs = new Set(['Imsak', 'Sunrise'])
      const upcoming = times
        .filter(p => !refs.has(p.label))
        .map(p => ({ label: p.label, t: new Date(p.time).getTime() }))
        .filter(p => p.t > nowMs)
        .sort((a, b) => a.t - b.t)
      if (!upcoming.length) return null
      const first = upcoming[0]
      const diffMin = Math.floor((first.t - nowMs) / 60000)
      const h = Math.floor(diffMin / 60)
      const m = diffMin % 60
      return { label: first.label.toUpperCase(), countdown: h > 0 ? `${h}H ${m}M` : `${m}M` }
    } catch { return null }
  }, [now])

  const W = {
    background: 'var(--cp-bg3)',
    border: '1px solid var(--cp-border2)',
    borderTop: '2px solid var(--cp-acc)',
    borderRadius: 6, padding: '14px 16px', flex: 1, minWidth: 0,
    boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
    cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

        {/* UTC clock */}
        <div className="cp-launch-card" style={W} onClick={() => onSelect('worldtime')}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
            color: 'var(--cp-dim)', marginBottom: 6 }}>UTC / ZULU</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
            color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums' }}>{utcStr}</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
            letterSpacing: '0.06em', marginTop: 5 }}>{utcDate}</div>
        </div>

        {/* Next prayer */}
        {nextPrayer && (
          <div className="cp-launch-card" style={W} onClick={() => onSelect('prayer')}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--cp-dim)', marginBottom: 6 }}>NEXT PRAYER</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
              color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
              fontVariantNumeric: 'tabular-nums' }}>{nextPrayer.countdown}</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
              letterSpacing: '0.1em', marginTop: 5 }}>{nextPrayer.label}</div>
          </div>
        )}

        {/* METAR status */}
        {metarAge && (
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
function SearchOverlay({ calcs, onSelect, onClose, reduceMotion }) {
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
      <div className={reduceMotion ? '' : 'cp-search-anim'} style={{
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
                <span>{c.icon}</span>{c.name.toUpperCase()}
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
                  { value: 'cockpit', label: 'XL' },
                ]}
                value={settings.fontScale}
                onChange={v => onUpdate({ fontScale: v })}
              />
            </SettingsRow>
            <SettingsRow label="ACCENT">
              <SegmentedToggle
                options={[{ value: 'teal', label: 'TEAL' }, { value: 'amber', label: 'AMBER' }]}
                value={settings.accentColor || 'teal'}
                onChange={v => onUpdate({ accentColor: v })}
              />
            </SettingsRow>
            <SettingsRow label="HIGH CONTRAST">
              <SegmentedToggle
                options={[{ value: false, label: 'OFF' }, { value: true, label: 'ON' }]}
                value={settings.highContrast || false}
                onChange={v => onUpdate({ highContrast: v })}
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

          <SettingsSection title="NAVIGATION">
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
          <SettingsSection title="CHANGELOG">
            <Changelog />
          </SettingsSection>
          <div style={{
            textAlign: 'center', fontFamily: 'var(--cb-font-mono)',
            fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-dim)', paddingTop: 4,
          }}>
            CLAUDEBORNE SUPERAPP · v3.5
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

// ── Changelog ───────────────────────────────────────────────────────────────
const CHANGELOG = [
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
  feat: { color: 'var(--cp-acc)',    label: 'NEW' },
  fix:  { color: 'var(--cp-orange)', label: 'FIX' },
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
                        background: `color-mix(in srgb, ${t.color} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${t.color} 30%, transparent)`,
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

const selectStyle = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
  borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
  fontSize: 11, padding: '5px 8px', outline: 'none', cursor: 'pointer',
}
