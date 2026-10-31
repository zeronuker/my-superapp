import { useEffect, useRef, useState } from 'react'
import StormPicture from './StormPicture'
import { PictureNote } from './SatPicture'
import SatLoader from './SatLoader'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { buildStormSnapshot } from '../services/stormSnapshot'
import { snapshotInputFromBriefing } from '../services/mapPicture'
import { STORM_STEPS, holdForLoader } from '../utils/loaderSteps'

const mono = 'var(--cb-font-mono)'

// The STORMS view of the Satellite tab: the current tropical cyclones near a saved briefing's route (or in a region) on the
// relief map, with a list under it. Never kept in the briefing: storms change within hours, so it is built each visit
// (it is held in memory while you switch views) and needs internet. RETAKE builds it again.
// `active` is false while another view is showing, so nothing is downloaded for a view nobody is looking at.
export default function StormPane({ entry, region, active }) {
  const isOnline = useOnlineStatus()
  const key = entry?.id ?? region.id
  const [bump, setBump] = useState({ key: '', n: 0 })                    // RETAKE count for the current briefing / region
  const rebuilds = bump.key === key ? bump.n : 0
  const [state, setState] = useState({ status: 'idle', snap: null })     // idle | loading | ready | error
  const visit = useRef({})                                                // briefing / region id → picture, this visit only

  useEffect(() => {
    if (!active) return
    const old = visit.current[key] ?? null
    if (old && rebuilds === 0) { setState({ status: 'ready', snap: old }); return }
    if (!isOnline) { setState({ status: old ? 'ready' : 'error', snap: old }); return }

    const ctl = new AbortController()
    const startedAt = Date.now()
    setState({ status: 'loading', snap: old })                             // a retake keeps showing the old picture meanwhile
    ;(async () => {
      try {
        let snap
        if (entry) {
          snap = await buildStormSnapshot(snapshotInputFromBriefing(entry.route, entry.data), ctl.signal)
        } else {
          const [w, s, e, n] = region.box
          snap = await buildStormSnapshot({ coords: [[w, s], [e, n]], pad: 0 }, ctl.signal)
        }
        visit.current[key] = snap
        if (!old) await holdForLoader(startedAt, STORM_STEPS, ctl.signal)            // a first picture waits for the loader's steps
        if (!ctl.signal.aborted) setState({ status: 'ready', snap })
      } catch (err) {
        if (!ctl.signal.aborted) setState(old ? { status: 'ready', snap: old } : { status: 'error', snap: null })
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entry` changes whenever the save is rewritten; the key decides
  }, [key, rebuilds, isOnline, active])

  const retake = () => setBump({ key, n: rebuilds + 1 })
  const busy = state.status === 'loading' || state.status === 'idle'   // idle: the moment before the first build starts

  return (
    <div>
      {state.snap && state.status !== 'error' ? <StormPicture snap={state.snap} />
        : busy ? <SatLoader steps={STORM_STEPS} />
        : <PictureNote>{isOnline
            ? 'NO STORM PICTURE AVAILABLE FOR THIS AREA RIGHT NOW. TRY AGAIN SHORTLY.'
            : 'STORM PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>}

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
