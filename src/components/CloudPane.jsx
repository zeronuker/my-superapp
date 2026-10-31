import { useEffect, useRef, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import SatPicture, { PictureNote } from './SatPicture'
import SatLoader from './SatLoader'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { buildSatSnapshot } from '../services/satelliteSnapshot'
import { snapshotInputFromBriefing } from '../services/mapPicture'
import { CLOUD_STEPS, holdForLoader } from '../utils/loaderSteps'

const mono = 'var(--cb-font-mono)'

// The CLOUD view of the Satellite tab: one still infrared picture. For a saved briefing it is built the first time it
// is opened online and kept in the save (RETAKE replaces it); with none picked it is a region still, not kept.
// `active` is false while the other view is showing, so nothing is downloaded for a view nobody is looking at.
export default function CloudPane({ entry, region, active }) {
  const isOnline = useOnlineStatus()
  const attachSatSnapshot = useCalculatorStore(s => s.attachSatSnapshot)
  const key = entry?.id ?? region.id
  const [bump, setBump] = useState({ key: '', n: 0 })                    // RETAKE count for the current briefing / region
  const rebuilds = bump.key === key ? bump.n : 0
  const [state, setState] = useState({ status: 'idle', snap: null })     // idle | loading | ready | error
  const regionCache = useRef({})                                          // region id → picture, this visit only
  const savedSnap = entry?.satSnapshot ?? null

  useEffect(() => {
    if (!active) return
    // A briefing that already has its picture just shows it (no network); RETAKE is the only reason to rebuild.
    if (entry && savedSnap && rebuilds === 0) { setState({ status: 'ready', snap: savedSnap }); return }
    if (!entry && regionCache.current[region.id] && rebuilds === 0) { setState({ status: 'ready', snap: regionCache.current[region.id] }); return }
    if (!isOnline) { setState({ status: savedSnap ? 'ready' : 'error', snap: savedSnap }); return }

    const ctl = new AbortController()
    const startedAt = Date.now()
    setState({ status: 'loading', snap: savedSnap })                       // a retake keeps showing the old picture meanwhile
    ;(async () => {
      try {
        let snap
        if (entry) {
          snap = await buildSatSnapshot(snapshotInputFromBriefing(entry.route, entry.data), ctl.signal)
          const r = await attachSatSnapshot(entry.id, snap)
          if (!r.ok) throw new Error('could not save the picture')
        } else {
          const [w, s, e, n] = region.box
          snap = await buildSatSnapshot({ coords: [[w, s], [e, n]], only: region, pad: 0 }, ctl.signal)
          regionCache.current[region.id] = snap
        }
        if (!savedSnap) await holdForLoader(startedAt, CLOUD_STEPS, ctl.signal)      // a first picture waits for the loader's steps
        if (!ctl.signal.aborted) setState({ status: 'ready', snap })
      } catch (err) {
        if (!ctl.signal.aborted) setState(savedSnap ? { status: 'ready', snap: savedSnap } : { status: 'error', snap: null })
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entry` changes whenever the save is rewritten; the key decides
  }, [key, rebuilds, isOnline, active])

  const retake = () => { delete regionCache.current[region.id]; setBump({ key, n: rebuilds + 1 }) }
  const busy = state.status === 'loading' || state.status === 'idle'   // idle: the moment before the first build starts

  return (
    <div>
      {state.snap && state.status !== 'error' ? <SatPicture snap={state.snap} />
        : busy ? <SatLoader steps={CLOUD_STEPS} />
        : <PictureNote>{isOnline
            ? 'NO SATELLITE PICTURE AVAILABLE FOR THIS AREA RIGHT NOW. TRY AGAIN SHORTLY.'
            : entry ? 'THIS BRIEFING HAS NO SATELLITE PICTURE YET. OPEN THIS TAB ONLINE TO ADD ONE.'
            : 'SATELLITE PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>}

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
