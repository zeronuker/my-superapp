// Saved duty logs — newest first. Tap to open, trash to delete, NEW to create.
const mono = 'var(--cb-font-mono)'

// Build a "WMKK → VOMM → WMKK" route string from a log's sectors.
function routeOf(log) {
  const pts = []
  log.sectors.forEach((s) => {
    if (s.from && pts[pts.length - 1] !== s.from) pts.push(s.from)
    if (s.dest && pts[pts.length - 1] !== s.dest) pts.push(s.dest)
  })
  return pts.length ? pts.join(' → ') : '—'
}

export default function LogList({ logs, onNew, onOpen, onDelete }) {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--cp-border)', paddingBottom: 10, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>DUTY LOG</div>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-acc)' }}>FLIGHT DUTY RECORD</div>
        </div>
        <button onClick={onNew} className="cp-btn" style={{
          color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)',
          display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: '0.1em',
        }}>+ NEW</button>
      </div>

      <div className="cp-label" style={{ marginBottom: 10 }}>Saved · offline</div>

      {logs.length === 0 && (
        <div style={{
          fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.08em',
          textAlign: 'center', padding: '32px 0',
        }}>
          NO LOGS YET — TAP NEW TO START
        </div>
      )}

      {logs.map((log) => {
        const n = log.sectors.length
        return (
          <div key={log.id} onClick={() => onOpen(log.id)} style={{
            background: 'var(--cp-bg2)', border: '1px solid var(--cp-border2)', borderRadius: 6,
            padding: 11, marginBottom: 9, cursor: 'pointer', position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--cp-txt)', letterSpacing: '0.06em' }}>
                {log.date || 'UNDATED'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--cp-acc)' }}>{log.aircraft?.[0]?.reg || '—'}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this log? This cannot be undone.')) onDelete(log.id) }}
                  aria-label="delete log"
                  className="cp-btn"
                  style={{ padding: '2px 6px', color: 'var(--cp-red)', borderColor: 'var(--cp-border)' }}
                >✕</button>
              </span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-muted)', letterSpacing: '0.08em' }}>
              {routeOf(log)}
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', marginTop: 4, letterSpacing: '0.08em' }}>
              {n} SECTOR{n === 1 ? '' : 'S'} · {log.aircraft?.[0]?.type || '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
