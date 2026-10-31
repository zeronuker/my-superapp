import { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { ModuleHeader } from './ModuleChrome'
import BriefingTabBar from './BriefingTabBar'
import Seg from './Seg'
import LinkPicker from './LinkPicker'
import { LinkChip, LinkLine } from './LinkChips'
import { briefingItem, briefingName } from './linkItems'
import CloudPane from './CloudPane'
import WindPane from './WindPane'
import StormPane from './StormPane'
import { SAT_REGIONS } from '../utils/satFrames'
import { WIND_LEVELS, DEFAULT_WIND_LEVEL } from '../utils/gfsIndex'
import { stormsInRegion, ALERT_COLOR } from '../utils/cyclones'
import { fetchStormList } from '../services/cycloneData'
import { useOnlineStatus } from '../utils/useOnlineStatus'

const mono = 'var(--cb-font-mono)'
const ALERT_RANK = { Green: 0, Orange: 1, Red: 2 }

// A dot after a region's name when a storm is active there, in the colour of the worst alert, with a count if several.
function StormDot({ storms }) {
  if (!storms.length) return null
  const worst = storms.reduce((a, s) => (ALERT_RANK[s.alert] > ALERT_RANK[a] ? s.alert : a), 'Green')
  const color = ALERT_COLOR[worst] ?? ALERT_COLOR.Green
  const label = `${storms.length} active storm${storms.length > 1 ? 's' : ''}: ${storms.map(s => s.name).join(', ')}`
  return (
    <span title={label} aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, color, fontSize: 11 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      {storms.length > 1 ? storms.length : null}
    </span>
  )
}

const VIEWS = [{ id: 'cloud', label: 'CLOUD' }, { id: 'winds', label: 'WINDS' }, { id: 'storms', label: 'STORMS' }]

// One row of the box of choices: a small label, then the control.
function Row({ label, children, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: last ? 0 : 10 }}>
      <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', color: 'var(--cp-dim)', minWidth: 62 }}>{label}</span>
      {children}
    </div>
  )
}

// Still pictures of the sky for a route or a region: CLOUD (infrared satellite), WINDS (GFS winds aloft by flight
// level) and STORMS (current tropical cyclones). The tabs pick the view; one box holds what to look at: a saved
// briefing (the Duty Log's picker), or a region when none is picked, and the flight level for WINDS.
// CLOUD and WINDS build their picture once per briefing, keep it in the briefing and show it offline; STORMS is
// never kept. With no briefing a region still is shown (not kept). All views share the box.
export default function SatelliteViewer() {
  const saves = useCalculatorStore(s => s.briefing.saves)
  const isOnline = useOnlineStatus()
  const [pickedId, setPickedId] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [regionId, setRegionId] = useState(SAT_REGIONS[0].id)
  const [view, setView] = useState('cloud')
  const [levelPick, setLevelPick] = useState({ key: '', fl: DEFAULT_WIND_LEVEL })
  const [stormList, setStormList] = useState([])           // current storms, for the dots on the region bar (STORMS view only)
  const [seen, setSeen] = useState({})                     // a view other than CLOUD is only started the first time it is asked for

  const entry = saves.find(b => b.id === pickedId) ?? null
  const region = SAT_REGIONS.find(r => r.id === regionId)
  const key = entry?.id ?? region.id
  // a briefing opens at the flight level its winds picture was made for
  const fl = levelPick.key === key ? levelPick.fl : (entry?.windSnapshot?.fl ?? DEFAULT_WIND_LEVEL)

  useEffect(() => {
    if (pickedId && !entry) setPickedId('')                // the picked briefing was deleted
  }, [pickedId, entry])

  useEffect(() => {
    if (view !== 'storms' || !isOnline) return
    const ctl = new AbortController()
    fetchStormList(ctl.signal).then(setStormList, () => {})   // no list, no dots: nothing else depends on it
    return () => ctl.abort()
  }, [view, isOnline])

  const pickItems = saves.map(save => briefingItem({ save, auto: false, near: true }, null))   // newest first, as saved

  return (
    <div>
      <ModuleHeader title="SATELLITE" subtitle="CLOUD · WINDS ALOFT · STORMS" />

      <BriefingTabBar tabs={VIEWS} active={view} onSelect={id => { setView(id); setSeen(s => ({ ...s, [id]: true })) }} />

      <div style={{ border: '1px solid var(--cp-border)', borderRadius: 6, padding: '12px 14px', background: 'var(--cp-bg2)', marginBottom: 14 }}>
        <Row label="BRIEFING" last={!!entry && view !== 'winds'}>
          <LinkChip linked={!!entry} tone="mint" label="BRIEFING" emptyLabel="PICK A BRIEFING" onClick={() => setPickOpen(true)} />
          {entry
            ? <LinkLine text={briefingName(entry)} onChange={() => setPickOpen(true)} onUnlink={() => setPickedId('')} unlinkLabel="CLEAR" />
            : <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)' }}>OR CHOOSE A REGION</span>}
        </Row>

        {!entry && (
          <Row label="REGION" last={view !== 'winds'}>
            <div className="cp-tab-bar" style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <Seg value={regionId} onChange={setRegionId}
                options={SAT_REGIONS.map(r => ({
                  value: r.id,
                  label: <>{r.label}{view === 'storms' && <StormDot storms={stormsInRegion(stormList, r)} />}</>,
                }))} />
            </div>
          </Row>
        )}

        {view === 'winds' && (
          <Row label="LEVEL" last>
            <div className="cp-tab-bar" style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <Seg value={fl} onChange={f => setLevelPick({ key, fl: f })}
                options={WIND_LEVELS.map(l => ({ value: l.fl, label: `FL${l.fl}` }))} />
            </div>
          </Row>
        )}
      </div>

      {/* Every view stays mounted once opened, so switching back and forth keeps what each one shows. */}
      <div style={{ display: view === 'cloud' ? 'block' : 'none' }}>
        <CloudPane entry={entry} region={region} active={view === 'cloud'} />
      </div>
      {seen.winds && (
        <div style={{ display: view === 'winds' ? 'block' : 'none' }}>
          <WindPane entry={entry} region={region} fl={fl} active={view === 'winds'} />
        </div>
      )}
      {seen.storms && (
        <div style={{ display: view === 'storms' ? 'block' : 'none' }}>
          <StormPane entry={entry} region={region} active={view === 'storms'} />
        </div>
      )}

      <LinkPicker open={pickOpen} title="PICK BRIEFING" subtitle="SATELLITE · CLOUD · WINDS · STORMS"
        searchHint="Search flight, route, tail…" allLabel="SHOW ALL BRIEFINGS"
        items={pickItems} onPick={id => { setPickedId(id); setPickOpen(false) }} onCancel={() => setPickOpen(false)} />
    </div>
  )
}
