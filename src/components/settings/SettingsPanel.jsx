import React, { lazy, Suspense } from 'react'
import { TabIcon, ICON_SETS } from '../TabIcon'
import TabLoading from '../TabLoading'
import { CHANGELOG } from '../../changelog'
import Changelog from '@brand/Changelog'
import { APP_VERSION, ACCENT_SWATCHES, resolveAccentId } from '../../appConstants'
import { ANIM_SPEED_MS } from '../../useTransitionAnim'
import SettingsWindow, { SettingsSection, SettingsRow, Seg, Switch, Reveal } from '@brand/SettingsWindow'

// Named export → adapt to the default shape React.lazy expects (same chunk as PrayerModule)
const PrayerSettings = lazy(() =>
  import('../../modules/prayer').then(m => ({ default: m.PrayerSettings })))
const DutyLogBackupSync = lazy(() =>
  import('../../modules/dutylog').then(m => ({ default: m.DutyLogBackupSync })))

// ── Settings tabs ───────────────────────────────────────────────────────────
// The standard ClaudeBorne Settings window (brand-kit SettingsWindow): tabs on the left, the chosen tab
// on the right; full screen with a slim icon column on a phone. Prayer lives in TOOLS as its own group.
const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance', hint: 'theme · text · motion',             icon: 'palette' },
  { id: 'navigation', label: 'Navigation', hint: 'layout · widgets · order',          icon: 'nav' },
  { id: 'tools',      label: 'Tools',      hint: 'weather · NOTAM · currency · prayer', icon: 'tools' },
  { id: 'about',      label: 'About',      hint: 'update · sync · changelog',         icon: 'about' },
]

// ── Settings Panel ──────────────────────────────────────────────────────────
export default function SettingsPanel({ onThemeChange, settings, onUpdate, onClose, closing = false, orderedCalcs, initialTab = 'appearance', update }) {
  const [activeTab, setActiveTab] = React.useState(
    SETTINGS_TABS.some(t => t.id === initialTab) ? initialTab : 'appearance')
  const [orderOpen, setOrderOpen] = React.useState(false)
  const dash = settings.dashboardWidgets || {}
  const setDash = (k, v) => onUpdate({ dashboardWidgets: { ...dash, [k]: v } })
  const animOn = settings.animEnabled !== false
  const anim = { style: settings.animStyle, ms: animOn ? ANIM_SPEED_MS[settings.animSpeed] || ANIM_SPEED_MS.normal : 0 }

  return (
    <SettingsWindow appName="SuperApp" version={APP_VERSION} tabs={SETTINGS_TABS} active={activeTab}
      onTab={setActiveTab} onClose={onClose} closing={closing} anim={anim} zIndex={199}>

      {activeTab === 'appearance' && (
        <>
          <SettingsSection title="Theme">
            <SettingsRow label="Mode" wide>
              <Seg label="Theme"
                options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'auto', label: 'Auto' }]}
                value={settings.themeMode || 'dark'}
                onChange={v => onThemeChange(v)}
              />
            </SettingsRow>
            <SettingsRow label="Accent" wide>
              <AccentSwatches value={resolveAccentId(settings.accentColor)} onChange={v => onUpdate({ accentColor: v })} />
            </SettingsRow>
            <SettingsRow label="Card style" wide>
              <Seg label="Card style"
                options={[{ value: 'flat', label: 'Flat' }, { value: 'elevated', label: 'Raised' }, { value: 'glass', label: 'Glass' }]}
                value={settings.cardStyle || 'elevated'}
                onChange={v => onUpdate({ cardStyle: v })}
              />
            </SettingsRow>
            <SettingsRow label="Icons" wide={ICON_SETS.length > 2}>
              <Seg label="Icons"
                options={ICON_SETS.map(s => ({ value: s.id, label: s.label }))}
                value={settings.iconSet || 'classic'}
                onChange={v => onUpdate({ iconSet: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Readability">
            <SettingsRow label="Font size" wide>
              <Seg label="Font size"
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
            <SettingsRow label="High contrast">
              <Switch label="High contrast" on={settings.highContrast || false} onChange={v => onUpdate({ highContrast: v })} />
            </SettingsRow>
            <SettingsRow label="Clock format">
              <Seg label="Clock format"
                options={[{ value: '24hr', label: '24 hr' }, { value: '12hr', label: '12 hr' }]}
                value={settings.clockFormat || '24hr'}
                onChange={v => onUpdate({ clockFormat: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Animation">
            <SettingsRow label="Animations" hint="Also off when your device has reduced motion turned on">
              <Switch label="Animations" on={animOn} onChange={v => onUpdate({ animEnabled: v })} />
            </SettingsRow>
            <Reveal open={animOn}>
              <SettingsRow label="Style">
                <Seg label="Animation style"
                  options={[{ value: 'slide', label: 'Slide' }, { value: 'rise', label: 'Fade rise' }]}
                  value={settings.animStyle === 'rise' ? 'rise' : 'slide'}
                  onChange={v => onUpdate({ animStyle: v })}
                />
              </SettingsRow>
              <SettingsRow label="Speed" wide>
                <Seg label="Animation speed"
                  options={[{ value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }, { value: 'slower', label: 'Slower' }]}
                  value={settings.animSpeed || 'normal'}
                  onChange={v => onUpdate({ animSpeed: v })}
                />
              </SettingsRow>
            </Reveal>
          </SettingsSection>

          <SettingsSection title="Feedback">
            <SettingsRow label="Haptic" hint="A small buzz when you tap">
              <Switch label="Haptic" on={!!settings.haptic} onChange={v => onUpdate({ haptic: v })} />
            </SettingsRow>
            <Reveal open={!!settings.haptic}>
              <SettingsRow label="Haptic strength" wide>
                <Seg label="Haptic strength"
                  options={[{ value: 'light', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'heavy', label: 'High' }]}
                  value={settings.hapticIntensity || 'medium'}
                  onChange={v => onUpdate({ hapticIntensity: v })}
                />
              </SettingsRow>
            </Reveal>
          </SettingsSection>
        </>
      )}

      {activeTab === 'navigation' && (
        <>
          <SettingsSection title="Layout">
            <SettingsRow label="Style" hint="How you move between tools" wide>
              <select className="cbs-select" value={settings.navStyle} onChange={e => onUpdate({ navStyle: e.target.value })}>
                <option value="launcher">LAUNCHER</option>
                <option value="tabs">TABS</option>
                <option value="grouped">GROUPED</option>
              </select>
            </SettingsRow>
            <Reveal open={settings.navStyle === 'tabs'}>
              <SettingsRow label="Tab position">
                <Seg label="Tab position"
                  options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]}
                  value={settings.tabPosition}
                  onChange={v => onUpdate({ tabPosition: v })}
                />
              </SettingsRow>
            </Reveal>
            <SettingsRow label="Default tab" hint="Opens when the app starts" wide>
              <select className="cbs-select" value={settings.defaultTab} onChange={e => onUpdate({ defaultTab: e.target.value })}>
                {orderedCalcs.map(c => (
                  <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                ))}
              </select>
            </SettingsRow>
            <SettingsRow label="Remember last tab">
              <Switch label="Remember last tab" on={settings.rememberLastTab !== false} onChange={v => onUpdate({ rememberLastTab: v })} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Dashboard widgets">
            <SettingsRow label="UTC clock">
              <Switch label="UTC clock" on={dash.utc !== false} onChange={v => setDash('utc', v)} />
            </SettingsRow>
            <SettingsRow label="Next prayer">
              <Switch label="Next prayer" on={dash.prayer !== false} onChange={v => setDash('prayer', v)} />
            </SettingsRow>
            <SettingsRow label="METAR status">
              <Switch label="METAR status" on={dash.metar !== false} onChange={v => setDash('metar', v)} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Tab order">
            <SettingsRow label="Order" hint="Move a tool up or down">
              <button type="button" className="cbs-btn" aria-expanded={orderOpen} onClick={() => setOrderOpen(o => !o)}>
                {orderOpen ? 'Done ▴' : 'Customise ▾'}
              </button>
            </SettingsRow>
            <Reveal open={orderOpen}>
              <div className="cbs-list">
                {orderedCalcs.map((calc, idx) => {
                  const move = d => {
                    const next = orderedCalcs.map(c => c.id)
                    ;[next[idx], next[idx + d]] = [next[idx + d], next[idx]]
                    onUpdate({ tabOrder: next })
                  }
                  return (
                    <div key={calc.id}>
                      <span>
                        <TabIcon id={calc.id} emoji={calc.icon} size={13} style={{ marginRight: 8, opacity: 0.6 }} />
                        {calc.name.toUpperCase()}
                      </span>
                      <button type="button" disabled={idx === 0} onClick={() => move(-1)} aria-label={`Move ${calc.name} up`}>▲</button>
                      <button type="button" disabled={idx === orderedCalcs.length - 1} onClick={() => move(1)} aria-label={`Move ${calc.name} down`}>▼</button>
                    </div>
                  )
                })}
              </div>
            </Reveal>
          </SettingsSection>
        </>
      )}

      {activeTab === 'tools' && (
        <>
          <SettingsSection title="METAR / TAF">
            <SettingsRow label="Default history" wide>
              <select className="cbs-select" value={settings.defaultHistory}
                onChange={e => onUpdate({ defaultHistory: Number(e.target.value) })}>
                {[1, 2, 3, 6, 12, 24].map(h => (
                  <option key={h} value={h}>{h}H</option>
                ))}
              </select>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="NOTAM">
            <SettingsRow label="Sort within location" wide>
              <Seg label="NOTAM sort"
                options={[{ value: 'relevance', label: 'Relevance' }, { value: 'category', label: 'Category' }]}
                value={settings.notamSort}
                onChange={v => onUpdate({ notamSort: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Currency">
            <SettingsRow label="Number format">
              <Seg label="Number format"
                options={[{ value: 'en', label: '1,000' }, { value: 'eu', label: '1.000' }]}
                value={settings.numberFormat}
                onChange={v => onUpdate({ numberFormat: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Qiblat & solat">
            <Suspense fallback={<TabLoading compact />}>
              <PrayerSettings />
            </Suspense>
          </SettingsSection>
        </>
      )}

      {activeTab === 'about' && (
        <>
          <SettingsSection title="App update">
            <UpdateChecker update={update} />
          </SettingsSection>

          <SettingsSection title="Cloud sync">
            <SettingsRow full>
              <Suspense fallback={<TabLoading compact />}>
                <DutyLogBackupSync />
              </Suspense>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Changelog">
            <SettingsRow full>
              <Changelog changelog={CHANGELOG} />
            </SettingsRow>
          </SettingsSection>
        </>
      )}
    </SettingsWindow>
  )
}

// ── Update checker ──────────────────────────────────────────────────────────
function UpdateChecker({ update }) {
  const { current, needRefresh, updateServiceWorker, checkForUpdate, checkingUpdate, updateChecked, autoUpdateDisabled, setAutoUpdateDisabled } = update

  return (
    <>
      <SettingsRow label="Version"
        hint={needRefresh ? 'A new version is ready' : updateChecked && !checkingUpdate ? "You're on the latest version" : null}>
        <span className={'cbs-value' + (needRefresh ? '' : ' on')}>{APP_VERSION} · build {current.version}</span>
      </SettingsRow>
      <SettingsRow full>
        {needRefresh ? (
          <button type="button" className="cbs-btn primary" onClick={() => updateServiceWorker(true)}>⬆ Update now</button>
        ) : (
          <button type="button" className="cbs-btn" onClick={checkingUpdate ? undefined : checkForUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? '⊙ Checking…' : '⬆ Check for updates'}
          </button>
        )}
      </SettingsRow>
      <SettingsRow label="Disable auto-update">
        <Switch label="Disable auto-update" on={autoUpdateDisabled} onChange={setAutoUpdateDisabled} />
      </SettingsRow>
    </>
  )
}

function AccentSwatches({ value, onChange }) {
  return (
    // Scrolls internally instead of forcing the settings row (and at large
    // font-scale, the whole sheet) wider than the viewport — 10 swatches
    // don't reliably fit one row on a phone, especially at 'cockpit' scale.
    <div className="cp-accent-scroll" style={{ display: 'flex', overflowX: 'auto', minWidth: 0, maxWidth: '100%' }}>
      {ACCENT_SWATCHES.map(s => {
        const active = value === s.value
        return (
          // 44px tappable button (WCAG-comfortable touch target) around a
          // visually unchanged 24px dot, so the hit area is bigger without
          // making the swatch row look different.
          <button key={s.value} type="button" onClick={() => onChange(s.value)}
            aria-label={s.value} aria-pressed={active} title={s.value.toUpperCase()}
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
