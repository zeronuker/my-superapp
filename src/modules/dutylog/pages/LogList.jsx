import { useMemo, useState } from 'react'

// Saved duty logs — newest first. Tap to open, trash to delete, NEW to create.
const mono = 'var(--cb-font-mono)'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// Build a "WMKK → VOMM → WMKK" route string from a log's sectors.
export function routeOf(log) {
  const pts = []
  log.sectors.forEach((s) => {
    if (s.from && pts[pts.length - 1] !== s.from) pts.push(s.from)
    if (s.dest && pts[pts.length - 1] !== s.dest) pts.push(s.dest)
  })
  return pts.length ? pts.join(' → ') : '—'
}

function parseLogYM(log) {
  if (!log.date) return null
  const [y, m] = log.date.split('-').map(Number)
  if (!y || !m) return null
  return { year: y, month: m }
}

// Splits logs (already newest-first) into: undated, the current/future flat
// list, past months still within the current (ongoing) year, and fully
// past years — each past year nests its own past months (year > month).
// Grouping is keyed off each log's own date, computed fresh every render so
// a month/year rolling over while the app is open re-buckets automatically.
function groupLogs(logs) {
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1

  const undated = []
  const flat = []
  const pastMonthsThisYear = new Map()
  const pastYears = new Map()

  for (const log of logs) {
    const ym = parseLogYM(log)
    if (!ym) { undated.push(log); continue }
    const { year, month } = ym
    const isPast = year < curY || (year === curY && month < curM)
    if (!isPast) { flat.push(log); continue }
    if (year === curY) {
      const key = `${year}-${month}`
      if (!pastMonthsThisYear.has(key)) pastMonthsThisYear.set(key, { year, month, logs: [] })
      pastMonthsThisYear.get(key).logs.push(log)
    } else {
      if (!pastYears.has(year)) pastYears.set(year, new Map())
      const monthsMap = pastYears.get(year)
      if (!monthsMap.has(month)) monthsMap.set(month, [])
      monthsMap.get(month).push(log)
    }
  }

  const pastMonthsArr = [...pastMonthsThisYear.values()].sort((a, b) => b.month - a.month)
  const pastYearsArr = [...pastYears.entries()]
    .map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .map(([month, monthLogs]) => ({ month, logs: monthLogs }))
        .sort((a, b) => b.month - a.month),
    }))
    .sort((a, b) => b.year - a.year)

  return { undated, flat, pastMonthsArr, pastYearsArr }
}

// Per-entry sync status — derived from existing store fields, no new per-log
// data needed: a log counts as synced once the store's lastSyncedAt (set by
// any successful push) is at or after that log's own updatedAt.
function SyncBadge({ log, syncCode, lastSyncedAt, onSyncNow, syncBusy }) {
  if (!syncCode) {
    return <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.06em', flexShrink: 0 }}>NOT BACKED UP</span>
  }
  const synced = lastSyncedAt && log.updatedAt <= lastSyncedAt
  if (synced) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cp-green)' }} />
        <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-green)', letterSpacing: '0.06em' }}>SYNCED</span>
      </span>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSyncNow?.() }}
      disabled={syncBusy}
      className="cp-btn"
      style={{ fontSize: 8, padding: '4px 8px', flexShrink: 0 }}
    >{syncBusy ? '…' : '○ SYNC'}</button>
  )
}

function LogCard({ log, onOpen, onDelete, syncCode, lastSyncedAt, onSyncNow, syncBusy }) {
  const n = log.sectors.length
  return (
    <div onClick={() => onOpen(log.id)} style={{
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>
          {n} SECTOR{n === 1 ? '' : 'S'} · {log.aircraft?.[0]?.type || '—'}
        </span>
        <SyncBadge log={log} syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
      </div>
    </div>
  )
}

// Read-only summary row for a viewed (not-yet-imported) snapshot's logs.
function ViewedLogRow({ log }) {
  const n = log.sectors?.length || 0
  return (
    <div style={{
      background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 4,
      padding: '8px 10px', marginBottom: 7,
    }}>
      <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: 'var(--cp-txt)', letterSpacing: '0.06em' }}>
        {log.date || 'UNDATED'}
      </div>
      <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', marginTop: 2, letterSpacing: '0.06em' }}>
        {routeOf(log)} · {n} SECTOR{n === 1 ? '' : 'S'}
      </div>
    </div>
  )
}

function SyncToast({ children, actions }) {
  return (
    <div style={{
      background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6,
      padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--cp-txt)', letterSpacing: '0.04em', lineHeight: 1.5 }}>
        {children}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
    </div>
  )
}

function CollapsibleBanner({ label, count, expanded, onToggle, children }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div onClick={onToggle} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 6,
        padding: '9px 11px', cursor: 'pointer',
      }}>
        <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', color: 'var(--cp-txt)' }}>
          {label}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>
            {count} LOG{count === 1 ? '' : 'S'}
          </span>
          <span style={{ color: 'var(--cp-acc)', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
        </span>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 10, marginTop: 9 }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function LogList({
  logs, onNew, onOpen, onDelete,
  syncCode, lastSyncedAt, onSyncNow, syncBusy, syncError,
  syncPromptId, onDismissSyncPrompt, onOpenSettings,
  onView, onImport,
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const [viewInput, setViewInput] = useState('')
  const [viewBusy, setViewBusy] = useState(false)
  const [viewError, setViewError] = useState('')
  const [viewedCode, setViewedCode] = useState(null)
  const [viewedLogs, setViewedLogs] = useState([])
  const [confirmImport, setConfirmImport] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')

  const handleViewCode = async () => {
    const code = viewInput.trim().toUpperCase()
    if (!code) return
    setViewError('')
    setViewBusy(true)
    try {
      const result = await onView(code)
      setViewedLogs(result)
      setViewedCode(code)
      setConfirmImport(false)
    } catch (e) {
      setViewError(e.message)
    } finally {
      setViewBusy(false)
    }
  }

  const handleImportClick = async () => {
    if (!confirmImport) { setConfirmImport(true); return }
    setImportError('')
    setImportBusy(true)
    try {
      await onImport(viewedCode)
      setViewedCode(null)
      setViewedLogs([])
      setConfirmImport(false)
      setViewInput('')
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImportBusy(false)
    }
  }

  const closeView = () => { setViewedCode(null); setViewedLogs([]); setConfirmImport(false); setImportError('') }

  const promptLog = syncPromptId ? logs.find(l => l.id === syncPromptId) : null

  const { undated, flat, pastMonthsArr, pastYearsArr } = useMemo(() => groupLogs(logs), [logs])

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

      <div style={{
        background: 'rgba(59,141,255,0.06)',
        border: '1px solid rgba(59,141,255,0.2)',
        borderLeft: '3px solid var(--cb-blue)',
        borderRadius: 4,
        padding: '10px 14px',
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: '0.08em',
        lineHeight: 1.7,
        color: 'var(--cp-dim)',
        textAlign: 'justify',
        marginBottom: 14,
      }}>
        <span style={{ color: 'var(--cb-blue)', fontWeight: 700, letterSpacing: '0.15em' }}>ℹ INFO · </span>
        Duty logs are stored locally on this device. Use Backup & Sync in Settings for an optional online sync.
      </div>

      {promptLog && (
        syncCode ? (
          <SyncToast actions={<>
            <button
              onClick={() => { onSyncNow(); onDismissSyncPrompt() }}
              disabled={syncBusy}
              className="cp-btn"
              style={{ fontSize: 9, padding: '5px 10px' }}
            >{syncBusy ? '…' : 'SYNC NOW'}</button>
            <button onClick={onDismissSyncPrompt} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>LATER</button>
          </>}>
            New duty log saved locally. Sync it to the cloud now?
          </SyncToast>
        ) : (
          <SyncToast actions={<>
            <button
              onClick={() => { onOpenSettings(); onDismissSyncPrompt() }}
              className="cp-btn"
              style={{ fontSize: 9, padding: '5px 10px' }}
            >GO TO SETTINGS</button>
            <button onClick={onDismissSyncPrompt} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>LATER</button>
          </>}>
            New duty log saved locally. Set up cloud sync in Settings to back it up.
          </SyncToast>
        )
      )}

      {syncError && (
        <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-red)', letterSpacing: '0.06em', lineHeight: 1.6, marginBottom: 14 }}>
          {syncError}
        </div>
      )}

      <div className="cp-label" style={{ marginBottom: 10 }}>Saved · offline</div>

      {logs.length === 0 && (
        <div style={{
          fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.08em',
          textAlign: 'center', padding: '32px 0',
        }}>
          NO LOGS YET — TAP NEW TO START
        </div>
      )}

      {undated.map(log => (
        <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete}
          syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
      ))}
      {flat.map(log => (
        <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete}
          syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
      ))}

      {pastMonthsArr.map(({ year, month, logs: monthLogs }) => {
        const key = `month:${year}-${month}`
        return (
          <CollapsibleBanner
            key={key}
            label={`${MONTH_NAMES[month - 1]} ${year}`}
            count={monthLogs.length}
            expanded={expanded.has(key)}
            onToggle={() => toggle(key)}
          >
            {monthLogs.map(log => (
              <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete}
                syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
            ))}
          </CollapsibleBanner>
        )
      })}

      {pastYearsArr.map(({ year, months }) => {
        const yearKey = `year:${year}`
        const yearCount = months.reduce((sum, m) => sum + m.logs.length, 0)
        return (
          <CollapsibleBanner
            key={yearKey}
            label={String(year)}
            count={yearCount}
            expanded={expanded.has(yearKey)}
            onToggle={() => toggle(yearKey)}
          >
            {months.map(({ month, logs: monthLogs }) => {
              const key = `month:${year}-${month}`
              return (
                <CollapsibleBanner
                  key={key}
                  label={`${MONTH_NAMES[month - 1]} ${year}`}
                  count={monthLogs.length}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                >
                  {monthLogs.map(log => (
                    <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete}
                      syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
                  ))}
                </CollapsibleBanner>
              )
            })}
          </CollapsibleBanner>
        )
      })}

      <div className="cp-divider" style={{ margin: '18px 0' }} />

      <div className="cp-label" style={{ marginBottom: 6 }}>Have a code? Enter here to view it</div>
      <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.5, marginBottom: 8 }}>
        View another device's synced logs without changing anything on this device. You can choose to import them below.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={viewInput}
          onChange={(e) => setViewInput(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          className="cp-input"
          style={{ flex: 1 }}
        />
        <button onClick={handleViewCode} disabled={viewBusy || !viewInput.trim()} className="cp-btn" style={{ padding: '8px 10px' }}>
          {viewBusy ? '…' : 'VIEW'}
        </button>
      </div>

      {viewError && (
        <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
          {viewError}
        </div>
      )}

      {viewedCode && (
        <div style={{ marginTop: 14, border: '1px solid var(--cp-border)', borderRadius: 6, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>VIEWING · {viewedCode} · READ-ONLY</span>
            <button onClick={closeView} className="cp-btn" style={{ fontSize: 8, padding: '3px 7px' }}>CLOSE</button>
          </div>
          {viewedLogs.length === 0 ? (
            <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em', padding: '8px 0' }}>
              NO LOGS IN THIS BACKUP
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {viewedLogs.map(log => <ViewedLogRow key={log.id} log={log} />)}
            </div>
          )}
          <button onClick={handleImportClick} disabled={importBusy} className="cp-btn-danger cp-btn" style={{ width: '100%', padding: '8px 10px' }}>
            {importBusy ? 'IMPORTING…' : (confirmImport ? 'CONFIRM IMPORT' : 'IMPORT TO THIS DEVICE')}
          </button>
          {confirmImport && (
            <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
              This will overwrite all logs currently on this device and make this device the owner of {viewedCode}. This action is not reversible.
            </div>
          )}
          {importError && (
            <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
              {importError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
