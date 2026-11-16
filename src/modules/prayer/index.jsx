/**
 * Prayer module entry point — drop this into any tab in the parent app.
 * Self-contained: own store, own GPS, own prayer time fetching, own compass.
 * No parent store dependencies.
 */
import { useState, useEffect } from 'react'
import usePrayerStore          from './store/prayerStore'
import { resolveMethodId }     from './services/methods'
import { useGeolocation }      from './hooks/useGeolocation'
import { usePrayerTimes }      from './hooks/usePrayerTimes'
import { useQibla }            from './hooks/useQibla'
import PrayerTimesPage         from './pages/PrayerTimes'
import QiblaPage               from './pages/Qibla'
import FlightPage              from './pages/Flight'
import { T }                   from './components/tokens'
import { TabIcon }             from '../../components/TabIcon'
import { useTransitionAnim }   from '../../useTransitionAnim'
import { SettingsRow, SettingsNote, Seg } from '@brand/SettingsWindow'

// ── Sub-nav ──────────────────────────────────────────────────────────────────
function SubNav({ active, onChange }) {
  const tabs = [
    { id: 'times',  label: 'SOLAT',  icon: '🕐' },
    { id: 'qiblat', label: 'QIBLAT', icon: '🧭' },
    { id: 'flight', label: 'FLIGHT', icon: '✈️' },
  ]
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <div className="cp-card-bg3" style={{
        display: 'inline-flex',
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
              <TabIcon id={t.id} emoji={t.icon} size={13} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Module root ───────────────────────────────────────────────────────────────
export default function PrayerModule({ clockFormat = '24hr', animStyle }) {
  const [tab, setTab] = useState('times')
  const tabAnim = useTransitionAnim(tab, ['times', 'qiblat', 'flight'], animStyle)

  const { settings: prayerSettings, updatePrayerSettings } = usePrayerStore()
  // Clock format comes from the global app setting (passed as a prop), so the
  // module stays self-contained but honours the one global 12/24h preference.
  const settings = { ...prayerSettings, timeFormat: clockFormat }

  // Geolocation
  const { location, status: gpsStatus, error: gpsError, permissionState, locate, setManualLocation } = useGeolocation()

  // Prayer times (source is embedded in times.source from the service)
  const { times, loading, error } = usePrayerTimes(location, settings)

  // Qibla compass
  const { bearing, heading, needleAngle, live, permissionNeeded, requestPermission } = useQibla(location)

  return (
    <div className="prayer-shell">
      <SubNav active={tab} onChange={setTab} />

      <div key={tab} className={tabAnim.className} style={tabAnim.style}>
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
        // A flight crosses regions, so it uses one rule throughout: the one Auto
        // picked for the saved location (or the one chosen in Settings).
        <FlightPage settings={{ ...settings, calculationMethod: resolveMethodId(settings.calculationMethod, times?.methodId) }} />
      )}
      </div>
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
    { value: 'auto',         label: 'Auto (by location)' },
    { value: 'jakim',       label: 'JAKIM (Malaysia)' },
    { value: 'moonsighting', label: 'Moonsighting Committee' },
    { value: 'mwl',          label: 'Muslim World League' },
    { value: 'isna',         label: 'ISNA (North America)' },
    { value: 'egyptian',     label: 'Egyptian General Authority' },
    { value: 'uaq',          label: 'Umm Al-Qura (Makkah)' },
  ]

  return (
    <>
      <SettingsRow label="Method" hint="How prayer times are calculated" wide>
        <select
          className="cbs-select"
          value={settings.calculationMethod}
          onChange={e => updatePrayerSettings({ calculationMethod: e.target.value })}
        >
          {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </SettingsRow>
      <SettingsRow label="Madhab (Asr)">
        <Seg
          label="Madhab"
          options={[{ value: 'shafi', label: "Shafi'i" }, { value: 'hanafi', label: 'Hanafi' }]}
          value={settings.madhab}
          onChange={v => updatePrayerSettings({ madhab: v })}
        />
      </SettingsRow>
      <SettingsNote>
        Clock format is set in Appearance. Online times come from the Aladhan API, offline from adhan.js;
        prayer data is kept for 7 days.
      </SettingsNote>
    </>
  )
}
