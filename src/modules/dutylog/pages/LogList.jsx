import { useMemo, useState } from 'react'
import useDutyLogStore from '../store/dutylogStore'
import { generateSyncCode, pushLogs, pullLogs } from '../services/sync'

// Saved duty logs — newest first. Tap to open, trash to delete, NEW to create.
const mono = 'var(--cb-font-mono)'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// Build a "WMKK → VOMM → WMKK" route string from a log's sectors.
function routeOf(log) {
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

function LogCard({ log, onOpen, onDelete }) {
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
      <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', marginTop: 4, letterSpacing: '0.08em' }}>
        {n} SECTOR{n === 1 ? '' : 'S'} · {log.aircraft?.[0]?.type || '—'}
      </div>
    </div>
  )
}

function BackupSyncPanel() {
  const logs = useDutyLogStore(s => s.logs)
  const syncCode = useDutyLogStore(s => s.syncCode)
  const setSyncCode = useDutyLogStore(s => s.setSyncCode)
  const replaceLogs = useDutyLogStore(s => s.replaceLogs)

  const [copied, setCopied] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(null) // null | 'backup' | 'restore'
  const [error, setError] = useState('')

  const handleBackup = async () => {
    setError('')
    setBusy('backup')
    try {
      const code = syncCode || generateSyncCode()
      await pushLogs(code, logs)
      setSyncCode(code)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleCopy = () => {
    if (!syncCode) return
    navigator.clipboard?.writeText(syncCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const handleRestore = async () => {
    const code = restoreCode.trim().toUpperCase()
    if (!code) return
    if (!window.confirm('Restoring will replace all logs currently on this device. Continue?')) return
    setError('')
    setBusy('restore')
    try {
      const restored = await pullLogs(code)
      replaceLogs(restored)
      setSyncCode(code)
      setRestoreCode('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 6,
        padding: '9px 11px', cursor: 'pointer',
      }}>
        <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', color: 'var(--cp-txt)' }}>
          BACKUP & SYNC
        </span>
        <span style={{ color: 'var(--cp-acc)', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div style={{
          marginTop: 9, padding: 12, borderRadius: 6,
          background: 'var(--cp-bg2)', border: '1px solid var(--cp-border2)',
        }}>
          <div className="cp-label" style={{ marginBottom: 6 }}>Your backup code</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{
              flex: 1, fontFamily: mono, fontSize: 13, letterSpacing: '0.1em',
              color: syncCode ? 'var(--cp-acc)' : 'var(--cp-dim)', background: 'var(--cp-bg3)',
              border: '1px solid var(--cp-border)', borderRadius: 4, padding: '8px 10px',
            }}>{syncCode || 'NO BACKUP YET'}</div>
            <button
              onClick={handleCopy}
              disabled={!syncCode}
              className="cp-btn"
              style={{ padding: '8px 10px', opacity: syncCode ? 1 : 0.4 }}
            >{copied ? 'COPIED' : 'COPY'}</button>
          </div>
          <button
            onClick={handleBackup}
            disabled={busy === 'backup'}
            className="cp-btn"
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
          >{busy === 'backup' ? 'BACKING UP…' : syncCode ? 'SYNC NOW' : 'BACKUP NOW'}</button>
          <div style={{
            fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em',
            lineHeight: 1.6, marginBottom: 14,
          }}>
            Save this code somewhere safe. Anyone with this code can view or restore these logs.
          </div>

          <div className="cp-divider" style={{ margin: '14px 0' }} />

          <div className="cp-label" style={{ marginBottom: 6 }}>Restore from a code</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              className="cp-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleRestore}
              disabled={busy === 'restore' || !restoreCode.trim()}
              className="cp-btn"
              style={{ padding: '8px 10px' }}
            >{busy === 'restore' ? 'RESTORING…' : 'RESTORE'}</button>
          </div>

          {error && (
            <div style={{
              fontFamily: mono, fontSize: 9, color: 'var(--cp-red)', letterSpacing: '0.06em',
              lineHeight: 1.6, marginTop: 10,
            }}>{error}</div>
          )}
        </div>
      )}
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

export default function LogList({ logs, onNew, onOpen, onDelete }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

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
        Duty logs are stored locally on this device by default. Use Backup & Sync below for an optional off-device copy.
      </div>

      <BackupSyncPanel />

      <div className="cp-label" style={{ marginBottom: 10 }}>Saved · offline</div>

      {logs.length === 0 && (
        <div style={{
          fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.08em',
          textAlign: 'center', padding: '32px 0',
        }}>
          NO LOGS YET — TAP NEW TO START
        </div>
      )}

      {undated.map(log => <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete} />)}
      {flat.map(log => <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete} />)}

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
            {monthLogs.map(log => <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete} />)}
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
                  {monthLogs.map(log => <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete} />)}
                </CollapsibleBanner>
              )
            })}
          </CollapsibleBanner>
        )
      })}
    </div>
  )
}
