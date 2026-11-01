import { useEffect, useRef, useState } from 'react'
import StormPicture from './StormPicture'
import { PictureNote } from './SatPicture'
import SatLoader from './SatLoader'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { buildStormSnapshot } from '../services/stormSnapshot'
import { snapshotInputFromBriefing } from '../services/mapPicture'
import { STORM_STEPS, holdForLoader } from '../utils/loaderSteps'

// The STORMS view of the Satellite tab: the current tropical cyclones near a saved briefing's route (or in a region) on the
// relief map, with a list under it. Never kept in the briefing: storms change within hours, so nothing is downloaded until the
// shell's button is pressed (`n` = presses for this briefing / region; 0 = none yet), it is held in memory while you switch
// views, and it needs internet. The shell's RETAKE builds it again.
// `active` is false while another view is showing; `onStatus` tells the shell whether there is a picture and whether it is busy.
export default function StormPane({ entry, region, active, n, onStatus }) {
  const isOnline = useOnlineStatus()
  const key = entry?.id ?? region.id
  const [state, setState] = useState({ status: 'idle', snap: null })     // idle | loading | ready | error
  const visit = useRef({})                                                // briefing / region id → picture, this visit only
  const built = useRef({})                                                // key → the press count its picture was fetched for

  useEffect(() => {
    if (!active) return
    const old = visit.current[key] ?? null
    if (old && (n === 0 || built.current[key] === n)) { setState({ status: 'ready', snap: old }); return }
    if (n === 0) { setState({ status: isOnline ? 'idle' : 'error', snap: null }); return }
    if (!isOnline) { setState({ status: old ? 'ready' : 'error', snap: old }); return }

    const ctl = new AbortController()
    const startedAt = Date.now()
    setState({ status: 'loading', snap: old })                             // the loader shows; a failed retake brings the old picture back
    ;(async () => {
      try {
        let snap
        if (entry) {
          snap = await buildStormSnapshot(snapshotInputFromBriefing(entry.route, entry.data), ctl.signal)
        } else {
          const [w, s, e, nn] = region.box
          snap = await buildStormSnapshot({ coords: [[w, s], [e, nn]], pad: 0 }, ctl.signal)
        }
        visit.current[key] = snap
        built.current[key] = n
        await holdForLoader(startedAt, STORM_STEPS, ctl.signal)
        if (!ctl.signal.aborted) setState({ status: 'ready', snap })
      } catch (err) {
        if (!ctl.signal.aborted) { built.current[key] = n; setState(old ? { status: 'ready', snap: old } : { status: 'error', snap: null }) }
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entry` changes whenever the save is rewritten; the key decides
  }, [key, n, isOnline, active])

  const loading = state.status === 'loading' || (state.status === 'idle' && n > 0)   // idle with a press: the moment before the build starts
  const hasPic = state.status === 'ready' && !!state.snap
  useEffect(() => { onStatus({ hasPic, busy: loading }) }, [hasPic, loading, onStatus])

  return loading ? <SatLoader steps={STORM_STEPS} />
    : state.status === 'idle' ? <PictureNote>PRESS “FETCH SATELLITE IMAGE” TO LOAD THE STORM PICTURE.</PictureNote>
    : hasPic ? <StormPicture snap={state.snap} />
    : <PictureNote>{isOnline
        ? 'NO STORM PICTURE AVAILABLE FOR THIS AREA RIGHT NOW. TRY AGAIN SHORTLY.'
        : 'STORM PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>
}
