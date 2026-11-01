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

// The WINDS view of the Satellite tab: one still winds-aloft picture at a flight level. Nothing is downloaded until the
// shell's button is pressed (`n` = presses for this briefing / region and level; 0 = none yet): a briefing's stored picture
// for this level, or a region picture fetched earlier this visit, just shows. For a saved briefing it is valid for the
// briefing's departure time and kept in the save (RETAKE, or another flight level, replaces it); a region one is not kept.
// `active` is false while another view is showing; `onStatus` tells the shell whether there is a picture and whether it is busy.
export default function WindPane({ entry, region, fl, active, n, onStatus }) {
  const isOnline = useOnlineStatus()
  const attachWindSnapshot = useCalculatorStore(s => s.attachWindSnapshot)
  const savedSnap = entry?.windSnapshot ?? null
  const [state, setState] = useState({ status: 'idle', snap: null })      // idle | loading | ready | error
  const regionCache = useRef({})                                           // `${region}:${fl}` → picture, this visit only
  const built = useRef({})                                                 // `${key}:${fl}` → the press count its picture was fetched for
  const key = `${entry?.id ?? region.id}:${fl}`

  useEffect(() => {
    if (!active) return
    const shown = entry ? (savedSnap?.fl === fl ? savedSnap : null) : regionCache.current[key] ?? null
    const fallback = entry ? savedSnap : shown                             // a stored picture of another level still beats nothing, offline or after a failure
    if (shown && (n === 0 || built.current[key] === n)) { setState({ status: 'ready', snap: shown }); return }
    if (n === 0) { setState(isOnline ? { status: 'idle', snap: null } : { status: fallback ? 'ready' : 'error', snap: fallback }); return }
    if (!isOnline) { setState({ status: fallback ? 'ready' : 'error', snap: fallback }); return }

    const ctl = new AbortController()
    const startedAt = Date.now()
    setState({ status: 'loading', snap: fallback })                        // the loader shows; a failure brings the old picture back
    ;(async () => {
      try {
        let snap
        if (entry) {
          const input = snapshotInputFromBriefing(entry.route, entry.data)
          snap = await buildWindSnapshot({ ...input, fl, validMs: windValidTime(entry.route, Date.now()) }, ctl.signal)
          const r = await attachWindSnapshot(entry.id, snap)
          if (!r.ok) throw new Error('could not save the picture')
        } else {
          const [w, s, e, nn] = region.box
          snap = await buildWindSnapshot({ coords: [[w, s], [e, nn]], pad: 0, fl }, ctl.signal)
          regionCache.current[key] = snap
        }
        built.current[key] = n
        await holdForLoader(startedAt, WIND_STEPS, ctl.signal)
        if (!ctl.signal.aborted) setState({ status: 'ready', snap })
      } catch (err) {
        if (!ctl.signal.aborted) { built.current[key] = n; setState(fallback ? { status: 'ready', snap: fallback } : { status: 'error', snap: null }) }
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entry` changes whenever the save is rewritten; the key decides
  }, [key, n, isOnline, active])

  const loading = state.status === 'loading' || (state.status === 'idle' && n > 0)   // idle with a press: the moment before the build starts
  const hasPic = state.status === 'ready' && !!state.snap
  useEffect(() => { onStatus({ hasPic, busy: loading }) }, [hasPic, loading, onStatus])

  return loading ? <SatLoader steps={WIND_STEPS} />
    : state.status === 'idle' ? <PictureNote>PRESS “FETCH SATELLITE IMAGE” TO LOAD THE FL{fl} WINDS PICTURE.</PictureNote>
    : hasPic ? <WindPicture snap={state.snap} />
    : <PictureNote>{isOnline
        ? 'NO WIND FORECAST AVAILABLE RIGHT NOW. TRY AGAIN SHORTLY.'
        : entry ? 'THIS BRIEFING HAS NO WIND PICTURE YET. GO ONLINE AND PRESS “FETCH SATELLITE IMAGE”.'
        : 'WIND PICTURES NEED AN INTERNET CONNECTION.'}</PictureNote>
}
