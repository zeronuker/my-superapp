import { useEffect, useRef, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import WindPicture from './WindPicture'
import { PictureNote } from './SatPicture'
import SatLoader from './SatLoader'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { windValidTime } from '../utils/windPicture'
import { buildWindSnapshot } from '../services/windSnapshot'
import { snapshotInputFromBriefing } from '../services/mapPicture'
import { WIND_STEPS, holdForLoader } from '../utils/loaderSteps'

const mono = 'var(--cb-font-mono)'

// The WINDS view of the Satellite tab: one still winds-aloft picture at a flight level. For a saved briefing it is valid
// for the briefing's departure time, built the first time it is opened online and kept in the save (RETAKE, or another
// flight level, replaces it); offline the stored one shows. With none picked it is a region picture, not kept.
// `active` is false while the other view is showing, so nothing is downloaded for a view nobody is looking at.
export default function WindPane({ entry, region, fl, active }) {
  const isOnline = useOnlineStatus()
  const attachWindSnapshot = useCalculatorStore(s => s.attachWindSnapshot)
  const key = entry?.id ?? region.id
  const savedSnap = entry?.windSnapshot ?? null
  const [bump, setBump] = useState({ key: '', n: 0 })                     // RETAKE count for the current briefing / region
  const rebuilds = bump.key === key ? bump.n : 0
  const [state, setState] = useState({ status: 'idle', snap: null })      // idle | loading | ready | error
  const regionCache = useRef({})                                           // `${region}:${fl}` → picture, this visit only
  const cacheKey = `${region.id}:${fl}`

  useEffect(() => {
    if (!active) return
    // A stored picture just shows (no network) unless it is for another flight level or RETAKE was pressed.
    if (entry && savedSnap && savedSnap.fl === fl && rebuilds === 0) { setState({ status: 'ready', snap: savedSnap }); return }
    if (!entry && regionCache.current[cacheKey] && rebuilds === 0) { setState({ status: 'ready', snap: regionCache.current[cacheKey] }); return }
    if (!isOnline) { setState({ status: savedSnap ? 'ready' : 'error', snap: savedSnap }); return }

    const ctl = new AbortController()
    const startedAt = Date.now()
    setState({ status: 'loading', snap: savedSnap })                       // keeps showing the old picture meanwhile
    ;(async () => {
      try {
        let snap
        if (entry) {
          const input = snapshotInputFromBriefing(entry.route, entry.data)
          snap = await buildWindSnapshot({ ...input, fl, validMs: windValidTime(entry.route, Date.now()) }, ctl.signal)
          const r = await attachWindSnapshot(entry.id, snap)
          if (!r.ok) throw new Error('could not save the picture')
        } else {
          const [w, s, e, n] = region.box
          snap = await buildWindSnapshot({ coords: [[w, s], [e, n]], pad: 0, fl }, ctl.signal)
          regionCache.current[cacheKey] = snap
        }
        if (!savedSnap) await holdForLoader(startedAt, WIND_STEPS, ctl.signal)       // a first picture waits for the loader's steps
        if (!ctl.signal.aborted) setState({ status: 'ready', snap })
      } catch (err) {
        if (!ctl.signal.aborted) setState(savedSnap ? { status: 'ready', snap: savedSnap } : { status: 'error', snap: null })
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entry` changes whenever the save is rewritten; the key decides
  }, [key, fl, rebuilds, isOnline, active])

  const retake = () => { delete regionCache.current[cacheKey]; setBump({ key, n: rebuilds + 1 }) }
  const busy = state.status === 'loading' || state.status === 'idle'   // idle: the moment before the first build starts

  return (
    <div>
      {state.snap && state.status !== 'error' ? <WindPicture snap={state.snap} />
        : busy ? <SatLoader steps={WIND_STEPS} />
        : <PictureNote>{isOnline
            ? 'NO WIND FORECAST AVAILABLE RIGHT NOW. TRY AGAIN SHORTLY.'
            : entry ? 'THIS BRIEFING HAS NO WIND PICTURE YET. OPEN THIS TAB ONLINE TO ADD ONE.'
            : 'WIND PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>}

      {state.snap && busy && (
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginTop: 8 }}>UPDATING…</div>
      )}

      {isOnline && (state.status === 'ready' || state.status === 'error') && (
        <div style={{ marginTop: 12 }}>
          <button className="cp-btn" onClick={retake} disabled={busy}>RETAKE</button>
        </div>
      )}
    </div>
  )
}
