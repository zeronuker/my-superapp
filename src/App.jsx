import React, { useState } from 'react'
import { useCalculatorStore } from './store/calculatorStore'
import EDTOCalculator from './components/EDTOCalculator'
import NormalCalculator from './components/NormalCalculator'
import ScientificCalculator from './components/ScientificCalculator'
import TimeCalculator from './components/TimeCalculator'
import CurrencyCalculator from './components/CurrencyCalculator'
import InterpolationCalculator from './components/InterpolationCalculator'
import METARTAFCalculator from './components/METARTAFCalculator'

export const CALCULATORS = [
  { id: 'normal',        icon: '⊕',  name: 'Normal',        component: NormalCalculator },
  { id: 'scientific',    icon: '∑',  name: 'Scientific',    component: ScientificCalculator },
  { id: 'time',          icon: '◷',  name: 'Time',          component: TimeCalculator },
  { id: 'interpolation', icon: '△',  name: 'Interpolation', component: InterpolationCalculator },
  { id: 'edto',          icon: '✈',  name: 'EDTO',          component: EDTOCalculator },
  { id: 'currency',      icon: '⊞',  name: 'Currency',      component: CurrencyCalculator },
  { id: 'metartaf',      icon: '☁',  name: 'METAR/TAF',     component: METARTAFCalculator },
]

const FONT_SCALES = { compact: 0.88, normal: 1, large: 1.13 }

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

  const currentCalc     = CALCULATORS.find(c => c.id === activeCalculator)
  const CurrentComponent = currentCalc?.component

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
              <img src="/brand/logo-mark.svg" alt="ClaudeBorne"
                width={36} height={36} style={{ flexShrink: 0 }} />
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
            {CALCULATORS.map(calc => (
              <button
                key={calc.id}
                onClick={() => setActiveCalculator(calc.id)}
                className={`cp-tab${activeCalculator === calc.id ? ' active' : ''}`}
              >
                <span style={{ marginRight: 6, fontSize: 13 }}>{calc.icon}</span>
                {calc.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 48px' }}>
          <div style={{
            background: 'var(--cp-bg2)',
            border: '1px solid var(--cp-border)',
            borderRadius: 4,
            padding: '24px',
          }}>
            <div key={activeCalculator}
              className={settings.reduceMotion ? '' : 'cp-calc-fade'}>
              {CurrentComponent && <CurrentComponent />}
            </div>
          </div>
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: '1px solid var(--cp-border3)',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--cp-dim)',
          letterSpacing: '0.12em',
        }}>
          CLAUDEBORNE SUPERAPP · EDTO BASED ON BOEING FLIGHT MANUALS · PWA OFFLINE CAPABLE
        </footer>
      </div>

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
          />
        </>
      )}
    </>
  )
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ darkMode, onToggleDark, settings, onUpdate, onClose }) {
  const panelRef = React.useRef(null)

  // Focus trap: on open, move focus into panel and keep Tab cycling within it
  React.useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    // Save the element that was focused before the panel opened
    const prevFocus = document.activeElement

    // Query all interactive elements inside the panel
    const getFocusable = () => Array.from(panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ))

    // Auto-focus the close button (first focusable element)
    const focusable = getFocusable()
    if (focusable.length) focusable[0].focus()

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const els = getFocusable()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    panel.addEventListener('keydown', onKeyDown)
    return () => {
      panel.removeEventListener('keydown', onKeyDown)
      // Restore focus to the element that triggered the panel open
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [])

  const panelStyle = {
    position: 'fixed', top: 0, right: 0,
    width: 300, height: '100vh',
    background: 'var(--cp-bg2)',
    borderLeft: '1px solid var(--cp-border)',
    zIndex: 200, display: 'flex', flexDirection: 'column',
    boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
  }

  return (
    <div ref={panelRef} style={panelStyle} role="dialog" aria-modal="true" aria-label="Settings">

      {/* Panel header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--cp-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
          letterSpacing: '0.22em', color: 'var(--cp-acc)' }}>
          ⚙  SETTINGS
        </span>
        <button className="cp-btn" onClick={onClose}
          style={{ padding: '4px 10px', fontSize: 13 }}>✕</button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* APPEARANCE */}
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

        {/* UX */}
        <SettingsSection title="UX">
          <SettingsRow label="DEFAULT TAB">
            <select
              value={settings.defaultTab}
              onChange={e => onUpdate({ defaultTab: e.target.value })}
              style={selectStyle}
            >
              {CALCULATORS.map(c => (
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
        </SettingsSection>

        {/* CURRENCY */}
        <SettingsSection title="CURRENCY">
          <SettingsRow label="NUMBER FORMAT">
            <SegmentedToggle
              options={[{ value: 'en', label: '1,000' }, { value: 'eu', label: '1.000' }]}
              value={settings.numberFormat}
              onChange={v => onUpdate({ numberFormat: v })}
            />
          </SettingsRow>
        </SettingsSection>

        {/* METAR / TAF */}
        <SettingsSection title="METAR / TAF">
          <SettingsRow label="ALTIMETER">
            <SegmentedToggle
              options={[{ value: 'hPa', label: 'HPA' }, { value: 'inHg', label: 'INHG' }]}
              value={settings.altimeterUnit}
              onChange={v => onUpdate({ altimeterUnit: v })}
            />
          </SettingsRow>
          <SettingsRow label="TEMPERATURE">
            <SegmentedToggle
              options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]}
              value={settings.tempUnit}
              onChange={v => onUpdate({ tempUnit: v })}
            />
          </SettingsRow>
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

      </div>
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
