import { useState } from 'react'
import SatPicture from './SatPicture'
import WindPicture from './WindPicture'

const mono = 'var(--cb-font-mono)'

// The SATELLITE tab of a saved briefing: the cloud picture and the winds picture as two sub-tabs. Each is shown
// when the Satellite module has made it for this briefing; the other says so.
export default function SavedSatellite({ sat, wind }) {
  const [sub, setSub] = useState(sat ? 'cloud' : 'winds')
  const views = [
    { id: 'cloud', label: 'CLOUD', snap: sat },
    { id: 'winds', label: 'WINDS', snap: wind },
  ]
  const current = views.find(v => v.id === sub)

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {views.map(v => (
          <button key={v.id} role="tab" aria-selected={sub === v.id} onClick={() => setSub(v.id)}
            className={`cp-btn${sub === v.id ? ' active' : ''}`} style={{ minWidth: 90, opacity: v.snap || sub === v.id ? 1 : 0.55 }}>{v.label}</button>
        ))}
      </div>

      {current.snap
        ? (sub === 'cloud' ? <SatPicture snap={current.snap} /> : <WindPicture snap={current.snap} />)
        : (
          <div style={{
            fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', color: 'var(--cp-dim)', textAlign: 'center',
            padding: '48px 16px', border: '1px solid var(--cp-border)', borderRadius: 6,
          }}>
            NO {current.label} PICTURE SAVED IN THIS BRIEFING YET. OPEN THE {current.label} VIEW IN THE SATELLITE TAB (FLIGHT DATA) ONLINE TO MAKE ONE.
          </div>
        )}
    </div>
  )
}
