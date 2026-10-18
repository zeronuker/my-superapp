// Shown on METAR/TAF, NOTAM and SIGMET while they display a saved briefing's
// data (cache carries `snapshotAt`) — it is as old as the save, not live.
export default function SnapshotBanner({ at }) {
  return (
    <div style={{
      background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
      borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
      fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)', fontWeight: 700,
    }}>
      SAVED BRIEFING SNAPSHOT
      <span style={{ color: 'var(--cp-dim)', fontWeight: 400 }}>
        {' '}· DATA AS OF {new Date(at).toUTCString().toUpperCase()} · MAY BE OUTDATED — fetch to refresh
      </span>
    </div>
  )
}
