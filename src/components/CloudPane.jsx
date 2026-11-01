import { useEffect, useRef, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import SatPicture, { PictureNote } from './SatPicture'
import SatLoader from './SatLoader'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import { buildSatSnapshot } from '../services/satelliteSnapshot'
import { snapshotInputFromBriefing } from '../services/mapPicture'
import { CLOUD_STEPS, holdForLoader } from '../utils/loaderSteps'

// The CLOUD view of the Satellite tab: one still infrared picture. Nothing is downloaded until the shell's button is pressed
// (`n` = presses for this briefing / region; 0 = none yet): a briefing's stored picture, or a region picture fetched earlier
// this visit, just shows. A fetch for a saved briefing is kept in the save (RETAKE replaces it); a region one is not kept.
// `active` is false while another view is showing; `onStatus` tells the shell whether there is a picture and whether it is busy.
export default function CloudPane({ entry, region, active, n, onStatus }) {
  const isOnline = useOnlineStatus()
  const attachSatSnapshot = useCalculatorStore(s => s.attachSatSnapshot)
  const key = entry?.id ?? region.id
  const [state, setState] = useState({ status: 'idle', snap: null })     // idle | loading | ready | error
  const regionCache = useRef({})                                          // region id → picture, this visit only
  const built = useRef({})                                                // key → the press count its picture was fetched for
  const savedSnap = entry?.satSnapshot ?? null

  useEffect(() => {
    if (!active) return
    const old = entry ? savedSnap : regionCache.current[key] ?? null
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
          snap = await buildSatSnapshot(snapshotInputFromBriefing(entry.route, entry.data), ctl.signal)
          const r = await attachSatSnapshot(entry.id, snap)
          if (!r.ok) throw new Error('could not save the picture')
        } else {
          const [w, s, e, nn] = region.box
          snap = await buildSatSnapshot({ coords: [[w, s], [e, nn]], only: region, pad: 0 }, ctl.signal)
          regionCache.current[key] = snap
        }
        built.current[key] = n
        await holdForLoader(startedAt, CLOUD_STEPS, ctl.signal)
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

  return loading ? <SatLoader steps={CLOUD_STEPS} />
    : state.status === 'idle' ? <PictureNote>PRESS “FETCH SATELLITE IMAGE” TO LOAD THE CLOUD PICTURE.</PictureNote>
    : hasPic ? <SatPicture snap={state.snap} />
    : <PictureNote>{isOnline
        ? 'NO SATELLITE PICTURE AVAILABLE FOR THIS AREA RIGHT NOW. TRY AGAIN SHORTLY.'
        : entry ? 'THIS BRIEFING HAS NO SATELLITE PICTURE YET. GO ONLINE AND PRESS “FETCH SATELLITE IMAGE”.'
        : 'SATELLITE PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>
}
