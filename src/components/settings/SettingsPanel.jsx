import React, { lazy, Suspense } from 'react'
import { TabIcon, ICON_SETS } from '../TabIcon'
import TabLoading from '../TabLoading'
import { CHANGELOG } from '../../changelog'
import Changelog from '@brand/Changelog'
import { APP_VERSION, ACCENT_SWATCHES, resolveAccentId } from '../../appConstants'

// Named export → adapt to the default shape React.lazy expects (same chunk as PrayerModule)
const PrayerSettings = lazy(() =>
  import('../../modules/prayer').then(m => ({ default: m.PrayerSettings })))
const DutyLogBackupSync = lazy(() =>
  import('../../modules/dutylog').then(m => ({ default: m.DutyLogBackupSync })))

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
export default function SettingsPanel({ onThemeChange, settings, onUpdate, onClose, orderedCalcs, initialTab = 'appearance', update }) {
  const panelRef = React.useRef(null)
  const [activeTab, setActiveTab] = React.useState(initialTab)
  const isWide = useMediaQuery('(min-width: 768px)')   // ≥768 → modal+rail, else sheet+strip

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
            <UpdateChecker update={update} />
          </SettingsSection>

          <SettingsSection title="CLOUD SYNC">
            <Suspense fallback={<TabLoading compact />}>
              <DutyLogBackupSync />
            </Suspense>
          </SettingsSection>

          <SettingsSection title="CHANGELOG">
            <Changelog changelog={CHANGELOG} />
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
        className="cp-modal-anim"
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
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px' }}>
            {tabContent}
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile: full-height sheet with top tab strip ──
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings"
      className="cp-sheet-anim"
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
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        {tabContent}
      </div>
    </div>
  )
}

// ── Update checker ──────────────────────────────────────────────────────────
function UpdateChecker({ update }) {
  const { current, needRefresh, updateServiceWorker, checkForUpdate, checkingUpdate, updateChecked } = update

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
        letterSpacing: '0.1em', color: 'var(--cp-dim)' }}>
        CURRENT BUILD: {current.version}
      </div>

      {/* Check button */}
      {needRefresh ? (
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            width: '100%',
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.15)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.4)',
            borderRadius: 4, padding: '7px 12px',
            fontFamily: 'var(--cb-font-mono)', fontSize: 10,
            letterSpacing: '0.14em', color: 'var(--cp-acc)', fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⬆ UPDATE NOW
        </button>
      ) : (
        <button
          onClick={checkingUpdate ? undefined : checkForUpdate}
          disabled={checkingUpdate}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid var(--cp-border2)',
            borderRadius: 4, padding: '7px 12px',
            fontFamily: 'var(--cb-font-mono)', fontSize: 10,
            letterSpacing: '0.14em',
            color: checkingUpdate ? 'var(--cp-dim)' : 'var(--cp-acc)',
            cursor: checkingUpdate ? 'default' : 'pointer',
            transition: 'all 0.12s',
          }}
        >
          {checkingUpdate ? '⊙ CHECKING…' : '⬆ CHECK FOR UPDATES'}
        </button>
      )}

      {/* Status feedback */}
      {updateChecked && !needRefresh && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
          letterSpacing: '0.12em', color: 'var(--cp-dim)', textAlign: 'center' }}>
          ✓ YOU'RE ON THE LATEST VERSION
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
    // Scrolls internally instead of forcing the settings row (and at large
    // font-scale, the whole sheet) wider than the viewport — 10 swatches
    // don't reliably fit one row on a phone, especially at 'cockpit' scale.
    <div className="cp-accent-scroll" style={{ display: 'flex', overflowX: 'auto', minWidth: 0, paddingRight: 12 }}>
      {ACCENT_SWATCHES.map(s => {
        const active = value === s.value
        return (
          // 44px tappable button (WCAG-comfortable touch target) around a
          // visually unchanged 24px dot, so the hit area is bigger without
          // making the swatch row look different.
          <button key={s.value} onClick={() => onChange(s.value)}
            aria-label={s.value} title={s.value.toUpperCase()}
            style={{
              width: 44, height: 44, flexShrink: 0, padding: 0, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', display: 'block',
              background: s.colors ? `linear-gradient(135deg, ${s.colors.join(', ')})` : s.color,
              border: active ? '2px solid var(--cp-txt)' : '2px solid transparent',
              boxShadow: active ? `0 0 0 2px ${s.color}` : 'none',
              transition: 'box-shadow 0.12s',
            }} />
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
