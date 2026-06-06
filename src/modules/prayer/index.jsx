/**
 * Prayer module entry point — drop this into any tab in the parent app.
 * Self-contained: own store, own GPS, own prayer time fetching, own compass.
 * No parent store dependencies.
 */
import { useState, useEffect } from 'react'
import usePrayerStore          from './store/prayerStore'
import { useGeolocation }      from './hooks/useGeolocation'
import { usePrayerTimes }      from './hooks/usePrayerTimes'
import { useQibla }            from './hooks/useQibla'
import PrayerTimesPage         from './pages/PrayerTimes'
import QiblaPage               from './pages/Qibla'
import FlightPage              from './pages/Flight'
import { T }                   from './components/tokens'

// ── Sub-nav ──────────────────────────────────────────────────────────────────
function SubNav({ active, onChange }) {
  const tabs = [
    { id: 'times',  label: 'SOLAT',  icon: '◷'  },
    { id: 'qiblat', label: 'QIBLAT', icon: '🧭' },
    { id: 'flight', label: 'FLIGHT', icon: '✈️' },
  ]
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <div style={{
        display: 'inline-flex',
        background: 'var(--cp-bg3)',
        border: '1px solid var(--cp-border)',
        borderRadius: 6,
        padding: 3,
        gap: 3,
      }}>
        {tabs.map(t => {
          const on = active === t.id
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              padding: '7px 16px', borderRadius: 4,
              border: `1px solid ${on ? 'var(--cp-acc)' : 'transparent'}`,
              cursor: 'pointer',
              background: on ? 'var(--cp-accdim)' : 'transparent',
              color: on ? 'var(--cp-acc)' : T.dim,
              transition: 'all 0.12s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Module root ───────────────────────────────────────────────────────────────
export default function PrayerModule() {
  const [tab, setTab] = useState('times')

  // Auto-switch to FLIGHT tab when offline (on mount or when connection drops)
  useEffect(() => {
    const switchToFlight = () => setTab(t => t !== 'flight' ? 'flight' : t)
    if (!navigator.onLine) switchToFlight()
    window.addEventListener('offline', switchToFlight)
    return () => window.removeEventListener('offline', switchToFlight)
  }, [])

  const { settings, updatePrayerSettings } = usePrayerStore()

  // Geolocation
  const { location, status: gpsStatus, error: gpsError, permissionState, locate, setManualLocation } = useGeolocation()

  // Prayer times (source is embedded in times.source from the service)
  const { times, loading, error } = usePrayerTimes(location, settings)

  // Qibla compass
  const { bearing, heading, needleAngle, live, permissionNeeded, requestPermission } = useQibla(location)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <SubNav active={tab} onChange={setTab} />

      {tab === 'times' && (
        <PrayerTimesPage
          location={location}
          gpsStatus={gpsStatus}
          gpsError={gpsError}
          permissionState={permissionState}
          onGpsLocate={locate}
          onManualSelect={setManualLocation}
          times={times}
          loading={loading}
          source={times?.source}
          settings={settings}
        />
      )}

      {tab === 'qiblat' && (
        <QiblaPage
          bearing={bearing}
          needleAngle={needleAngle}
          heading={heading}
          live={live}
          permissionNeeded={permissionNeeded}
          onRequestPermission={requestPermission}
          location={location}
        />
      )}

      {tab === 'flight' && (
        <FlightPage settings={settings} />
      )}
    </div>
  )
}

/**
 * Settings section — imported by App.jsx's SettingsPanel.
 * Renders the QIBLAT & SOLAT settings block only (no wrapper).
 */
export function PrayerSettings() {
  const { settings, updatePrayerSettings } = usePrayerStore()

  const METHODS = [
    { value: 'jakim',        label: 'JAKIM (Malaysia)' },
    { value: 'moonsighting', label: 'Moonsighting Committee' },
    { value: 'mwl',          label: 'Muslim World League' },
    { value: 'isna',         label: 'ISNA (North America)' },
    { value: 'egyptian',     label: 'Egyptian General Authority' },
    { value: 'uaq',          label: 'Umm Al-Qura (Makkah)' },
  ]

  const seg = (options, value, key) => (
    <div style={{ display: 'flex', border: '1px solid var(--cp-border)',
      borderRadius: 4, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const active = value === o.value
        return (
          <button key={o.value} onClick={() => updatePrayerSettings({ [key]: o.value })} style={{
            flex: 1, background: active ? 'var(--cp-accdim)' : 'transparent',
            border: 'none', borderRight: i < options.length - 1 ? '1px solid var(--cp-border)' : 'none',
            color: active ? 'var(--cp-acc)' : 'var(--cp-dim)',
            fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.1em',
            padding: '5px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Calculation method */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="cp-label" style={{ flexShrink: 0 }}>METHOD</span>
        <select
          value={settings.calculationMethod}
          onChange={e => updatePrayerSettings({ calculationMethod: e.target.value })}
          style={{
            background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
            borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
            fontSize: 10, padding: '5px 8px', outline: 'none', cursor: 'pointer',
          }}
        >
          {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Madhab */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="cp-label" style={{ flexShrink: 0 }}>MADHAB (ASR)</span>
        {seg([{ value: 'shafi', label: "SHAFI'I" }, { value: 'hanafi', label: 'HANAFI' }],
          settings.madhab, 'madhab')}
      </div>

      {/* Time format */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="cp-label" style={{ flexShrink: 0 }}>TIME FORMAT</span>
        {seg([{ value: '24hr', label: '24 HR' }, { value: '12hr', label: '12 HR' }],
          settings.timeFormat, 'timeFormat')}
      </div>

      <div style={{ paddingTop: 4, borderTop: '1px solid var(--cp-border3)' }}>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
          color: 'var(--cp-dim)', letterSpacing: '0.08em', lineHeight: 2 }}>
          ONLINE: ALADHAN API · OFFLINE: ADHAN.JS<br />
          PRAYER DATA CACHED FOR 7 DAYS
        </div>
      </div>
    </div>
  )
}
