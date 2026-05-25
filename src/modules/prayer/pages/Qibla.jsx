import CompassDial from '../components/CompassDial'
import { T } from '../components/tokens'

export default function QiblaPage({ bearing, needleAngle, live, permissionNeeded, onRequestPermission, location }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.18em',
        color: 'var(--cp-acc)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        QIBLAT
        <div style={{ flex: 1, height: 1, background: T.bord2 }} />
      </div>

      {!location ? (
        <div style={{ padding: '32px 0', textAlign: 'center',
          fontFamily: T.sans, fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
          Set a location on the TIMES tab to calculate Qiblat direction.
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 16 }}>
          <CompassDial
            bearing={bearing ?? 0}
            needleAngle={needleAngle ?? 0}
            live={live}
            permissionNeeded={permissionNeeded}
            onRequestPermission={onRequestPermission}
          />
        </div>
      )}

      {location && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em' }}>
            FROM {location.city?.toUpperCase() ?? 'CURRENT LOCATION'}
            {location.country ? `, ${location.country.toUpperCase()}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
