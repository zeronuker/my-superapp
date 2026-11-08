import { useEffect, useMemo, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { ModuleHeader } from './ModuleChrome'
import BriefingTabBar from './BriefingTabBar'
import Seg from './Seg'
import LinkPicker from './LinkPicker'
import { AddChip, MenuChip } from './LinkChips'
import { briefingItem, briefingName } from './linkItems'
import CloudPane from './CloudPane'
import WindPane from './WindPane'
import StormPane from './StormPane'
import { SAT_REGIONS } from '../utils/satFrames'
import { WIND_LEVELS, DEFAULT_WIND_LEVEL } from '../utils/gfsIndex'
import { stormsInRegion, ALERT_COLOR } from '../utils/cyclones'
import { fetchStormList } from '../services/cycloneData'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { useTransitionAnim } from '../useTransitionAnim'

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

// The teal heading with a rule that the METAR/TAF, NOTAM and SIGMET input screens use for their sections.
const SectionHeader = ({ title }) => (
  <div className="cp-section-header">
    <span className="cp-section-title">{title}</span>
    <div className="cp-divider" />
  </div>
)

// Still pictures of the sky for a route or a region: CLOUD (infrared satellite), WINDS (GFS winds aloft by flight
// level) and STORMS (current tropical cyclones). The tabs pick the view; one set of choices holds what to look at: a saved
// briefing (the Duty Log's picker), or a region when none is picked, and the flight level for WINDS.
// CLOUD and WINDS build their picture once per briefing, keep it in the briefing and show it offline; STORMS is
// never kept. With no briefing a region still is shown (not kept). All views share the choices. Nothing is downloaded
// until the full-width button under them (FETCH SATELLITE IMAGE, then RETAKE) is pressed: the shell counts presses per view and
// briefing / region (/ level) and hands the count to the view as `n`; a view reports back `{ hasPic, busy }`.
export default function SatelliteViewer() {
  const saves = useCalculatorStore(s => s.briefing.saves)
  const isOnline = useOnlineStatus()
  const [pickedId, setPickedId] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [regionId, setRegionId] = useState(SAT_REGIONS[0].id)
  const [view, setView] = useState('cloud')
  const animStyle = useCalculatorStore(s => s.settings.animStyle)
  const viewAnim = useTransitionAnim(view, VIEWS.map(v => v.id), animStyle)
  const [levelPick, setLevelPick] = useState({ key: '', fl: DEFAULT_WIND_LEVEL })
  const [stormList, setStormList] = useState([])           // current storms, for the dots on the region bar (STORMS view only)
  const [seen, setSeen] = useState({})                     // a view other than CLOUD is only started the first time it is asked for
  const [presses, setPresses] = useState({})               // `${view}|${briefing or region}[|level]` → times the button was pressed
  const [status, setStatus] = useState({})                 // view → { hasPic, busy }, reported by each view
  const report = useMemo(() => Object.fromEntries(VIEWS.map(v => [v.id, st => setStatus(prev => (
    prev[v.id]?.hasPic === st.hasPic && prev[v.id]?.busy === st.busy ? prev : { ...prev, [v.id]: st }
  ))])), [])

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

  const pressKey = id => `${id}|${key}${id === 'winds' ? `|${fl}` : ''}`
  const nOf = id => presses[pressKey(id)] ?? 0
  const press = () => setPresses(p => ({ ...p, [pressKey(view)]: (p[pressKey(view)] ?? 0) + 1 }))
  const cur = status[view] ?? { hasPic: false, busy: false }
  const fetchButton = isOnline && (
    <div style={{ marginBottom: 20 }}>
      <button onClick={press} disabled={cur.busy} style={{
        width: '100%', padding: '12px', background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)', borderRadius: 6,
        cursor: cur.busy ? 'default' : 'pointer', fontFamily: mono, fontSize: 10,
        letterSpacing: '0.16em', color: 'var(--cp-acc)', opacity: cur.busy ? 0.5 : 1 }}>
        {cur.busy ? '⊙ FETCHING…' : cur.hasPic ? '⟳ RETAKE' : '⊕ FETCH SATELLITE IMAGE'}
      </button>
      {!cur.hasPic && !cur.busy && (
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--cp-dim)', textAlign: 'center', marginTop: 8 }}>
          {view === 'winds' ? 'PICK A SOURCE AND LEVEL, THEN FETCH' : 'PICK A SOURCE, THEN FETCH'}
        </div>
      )}
    </div>
  )

  const pickItems = saves.map(save => briefingItem({ save, auto: false, near: true }, null))   // newest first, as saved

  return (
    <div>
      <ModuleHeader title="SATELLITE" subtitle="CLOUD · WINDS ALOFT · STORMS" />

      <BriefingTabBar tabs={VIEWS} active={view} onSelect={id => { setView(id); setSeen(s => ({ ...s, [id]: true })) }} />

      <SectionHeader title="Source" />
      <div className="cp-label" style={{ marginBottom: 4 }}>BRIEFING</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: entry ? 20 : 12 }}>
        {entry ? (
          <MenuChip label="BRIEFING" align="left" items={[
            { heading: briefingName(entry) },
            { label: 'Change…', onClick: () => setPickOpen(true) },
            { label: 'Clear', onClick: () => setPickedId(''), color: 'var(--cp-red)' },
          ]} />
        ) : (
          <>
            <AddChip label="+ BRIEFING" onClick={() => setPickOpen(true)} />
            <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)' }}>OR CHOOSE A REGION</span>
          </>
        )}
      </div>

      {!entry && (
        <>
          <div className="cp-label" style={{ marginBottom: 4 }}>REGION</div>
          <div className="cp-tab-bar" style={{ overflowX: 'auto', maxWidth: '100%', marginBottom: 20 }}>
            <Seg value={regionId} onChange={setRegionId}
              options={SAT_REGIONS.map(r => ({
                value: r.id,
                label: <>{r.label}{view === 'storms' && <StormDot storms={stormsInRegion(stormList, r)} />}</>,
              }))} />
          </div>
        </>
      )}

      {view === 'winds' && (
        <>
          <SectionHeader title="Flight Level" />
          <div className="cp-tab-bar" style={{ overflowX: 'auto', maxWidth: '100%', marginBottom: 20 }}>
            <Seg value={fl} onChange={f => setLevelPick({ key, fl: f })}
              options={WIND_LEVELS.map(l => ({ value: l.fl, label: `FL${l.fl}` }))} />
          </div>
        </>
      )}

      {fetchButton}

      {/* Every view stays mounted once opened, so switching back and forth keeps what each one shows. */}
      <div className={view === 'cloud' ? viewAnim.className : undefined} style={{ ...viewAnim.style, display: view === 'cloud' ? 'block' : 'none' }}>
        <CloudPane entry={entry} region={region} active={view === 'cloud'} n={nOf('cloud')} onStatus={report.cloud} />
      </div>
      {seen.winds && (
        <div className={view === 'winds' ? viewAnim.className : undefined} style={{ ...viewAnim.style, display: view === 'winds' ? 'block' : 'none' }}>
          <WindPane entry={entry} region={region} fl={fl} active={view === 'winds'} n={nOf('winds')} onStatus={report.winds} />
        </div>
      )}
      {seen.storms && (
        <div className={view === 'storms' ? viewAnim.className : undefined} style={{ ...viewAnim.style, display: view === 'storms' ? 'block' : 'none' }}>
          <StormPane entry={entry} region={region} active={view === 'storms'} n={nOf('storms')} onStatus={report.storms} />
        </div>
      )}

      <LinkPicker open={pickOpen} title="PICK BRIEFING" subtitle="SATELLITE · CLOUD · WINDS · STORMS"
        searchHint="Search flight, route, tail…" allLabel="SHOW ALL BRIEFINGS"
        items={pickItems} onPick={id => { setPickedId(id); setPickOpen(false) }} onCancel={() => setPickOpen(false)} />
    </div>
  )
}
