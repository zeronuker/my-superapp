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
// Tappable — opens the full read-only detail sub-screen for that log.
function ViewedLogRow({ log, onOpen }) {
  const n = log.sectors?.length || 0
  return (
    <div onClick={() => onOpen(log)} style={{
      background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 4,
      padding: '8px 10px', marginBottom: 7, cursor: 'pointer',
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

const roLblStyle = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--cp-dim)', display: 'block', marginBottom: 3,
}
const roSecLabel = {
  fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'var(--cp-muted)', margin: '16px 0 8px',
}

function ReadOnlyField({ label, value, labelStyle }) {
  return (
    <div>
      {label && <label style={labelStyle || roLblStyle}>{label}</label>}
      <div className="cp-input" style={{ fontSize: 11, padding: '6px 7px', color: 'var(--cp-txt)' }}>
        {value || '—'}
      </div>
    </div>
  )
}

function ViewedAircraft({ aircraft, index }) {
  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderRadius: 6, padding: 10, marginBottom: 9, background: 'var(--cp-bg2)' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)',
          background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px' }}>
          AIRCRAFT #{index + 1}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7, marginBottom: 7 }}>
        <ReadOnlyField label="Registration" value={aircraft.reg} />
        <ReadOnlyField label="Type" value={aircraft.type} />
        <ReadOnlyField label="MTOW" value={aircraft.mtow} />
        <ReadOnlyField label="MLW" value={aircraft.mlw} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, alignItems: 'start' }}>
        <ReadOnlyField label="Configuration" value={aircraft.config} />
        <div style={{ gridColumn: '2 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9,
          background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6, padding: '9px 10px' }}>
          <ReadOnlyField label="DOW" value={aircraft.dow} labelStyle={{ ...roLblStyle, color: 'var(--cp-acc)' }} />
          <ReadOnlyField label="DOI" value={aircraft.doi} labelStyle={{ ...roLblStyle, color: 'var(--cp-acc)' }} />
        </div>
      </div>
    </div>
  )
}

function ViewedSector({ sector, index }) {
  const hasRemark = (sector.remark || '').trim().length > 0
  return (
    <div style={{ border: '1px solid var(--cp-border2)', borderRadius: 6, padding: 10, marginBottom: 9, background: 'var(--cp-bg2)' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-acc)',
          background: 'var(--cp-accdim)', borderRadius: 4, padding: '2px 7px' }}>
          SECTOR #{index + 1}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7, marginBottom: 7 }}>
        <ReadOnlyField label="FLT No" value={sector.fltNo} />
        <ReadOnlyField label="From" value={sector.from} />
        <ReadOnlyField label="To" value={sector.dest} />
        <ReadOnlyField label="PAX" value={sector.pax} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 7 }}>
        <ReadOnlyField label="Fuel Off Block" value={sector.fuelOff} />
        <ReadOnlyField label="Fuel On Block" value={sector.fuelOn} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 }}>
        <ReadOnlyField label="Off Block" value={sector.offBlk} />
        <ReadOnlyField label="T/O" value={sector.takeoff} />
        <ReadOnlyField label="LDG" value={sector.ldg} />
        <ReadOnlyField label="On Block" value={sector.onBlk} />
      </div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px dashed var(--cp-border2)', paddingTop: 8, marginTop: 9 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--cp-dim)', whiteSpace: 'nowrap' }}>ENG OUT</span>
        <div style={{ flex: 1 }}><ReadOnlyField label="N1" value={sector.engN1} /></div>
        <div style={{ flex: 1 }}><ReadOnlyField label="ALT" value={sector.engAlt} /></div>
        <div style={{ flex: 1 }}><ReadOnlyField label="IAS" value={sector.engIas} /></div>
      </div>
      {hasRemark && (
        <div style={{ marginTop: 9, borderTop: '1px dashed var(--cp-border2)', paddingTop: 8 }}>
          <label style={roLblStyle}>Remarks</label>
          <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--cp-txt)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {sector.remark}
          </div>
        </div>
      )}
    </div>
  )
}

// Full read-only detail sub-screen for a single log from a viewed (not-yet-
// imported) snapshot — same fields as the real editor, just not editable.
function ViewedLogDetail({ log, onBack }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} className="cp-btn" aria-label="back" style={{ padding: '4px 9px' }}>←</button>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>
            {log.date || 'UNDATED'}
          </div>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-acc)' }}>READ-ONLY</div>
        </div>
      </div>

      {(log.aircraft || []).length > 0 && (
        <>
          <div style={roSecLabel}>AIRCRAFT</div>
          {log.aircraft.map((a, i) => <ViewedAircraft key={a.id} aircraft={a} index={i} />)}
        </>
      )}

      <div style={roSecLabel}>SECTORS</div>
      {(log.sectors || []).map((s, i) => <ViewedSector key={s.id} sector={s} index={i} />)}

      {log.notes && (
        <>
          <div style={roSecLabel}>NOTES</div>
          <div style={{
            fontFamily: mono, fontSize: 11, color: 'var(--cp-txt)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 4, padding: '8px 10px',
          }}>
            {log.notes}
          </div>
        </>
      )}

      {(log.crew || []).length > 0 && (
        <>
          <div style={roSecLabel}>CREW</div>
          {log.crew.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 7, marginBottom: 7 }}>
              <ReadOnlyField value={c.name} />
              <ReadOnlyField value={c.position} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// Renders a grouped-logs result (see groupLogs) with the current/flat list
// followed by collapsible past-months and past-years banners — shared between
// the main duty log list and the viewed-code panel so both get the same
// current-month/year collapse behaviour.
function GroupedLogs({ undated, flat, pastMonthsArr, pastYearsArr, expanded, onToggle, renderLog }) {
  return (
    <>
      {undated.map(renderLog)}
      {flat.map(renderLog)}

      {pastMonthsArr.map(({ year, month, logs: monthLogs }) => {
        const key = `month:${year}-${month}`
        return (
          <CollapsibleBanner
            key={key}
            label={`${MONTH_NAMES[month - 1]} ${year}`}
            count={monthLogs.length}
            expanded={expanded.has(key)}
            onToggle={() => onToggle(key)}
          >
            {monthLogs.map(renderLog)}
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
            onToggle={() => onToggle(yearKey)}
          >
            {months.map(({ month, logs: monthLogs }) => {
              const key = `month:${year}-${month}`
              return (
                <CollapsibleBanner
                  key={key}
                  label={`${MONTH_NAMES[month - 1]} ${year}`}
                  count={monthLogs.length}
                  expanded={expanded.has(key)}
                  onToggle={() => onToggle(key)}
                >
                  {monthLogs.map(renderLog)}
                </CollapsibleBanner>
              )
            })}
          </CollapsibleBanner>
        )
      })}
    </>
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
  const [openViewedLog, setOpenViewedLog] = useState(null)

  const [viewedExpanded, setViewedExpanded] = useState(() => new Set())
  const toggleViewed = (key) => setViewedExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

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

  const closeView = () => {
    setViewedCode(null); setViewedLogs([]); setConfirmImport(false); setImportError(''); setOpenViewedLog(null)
  }

  const promptLog = syncPromptId ? logs.find(l => l.id === syncPromptId) : null

  const { undated, flat, pastMonthsArr, pastYearsArr } = useMemo(() => groupLogs(logs), [logs])
  const {
    undated: viewedUndated, flat: viewedFlat,
    pastMonthsArr: viewedPastMonthsArr, pastYearsArr: viewedPastYearsArr,
  } = useMemo(() => groupLogs(viewedLogs), [viewedLogs])

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
        Duty logs are stored locally on this device. Use Cloud Sync in Settings for an optional online sync.
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
            New duty log saved locally. Set up a cloud sync code in Settings to sync it.
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

      <GroupedLogs
        undated={undated} flat={flat} pastMonthsArr={pastMonthsArr} pastYearsArr={pastYearsArr}
        expanded={expanded} onToggle={toggle}
        renderLog={(log) => (
          <LogCard key={log.id} log={log} onOpen={onOpen} onDelete={onDelete}
            syncCode={syncCode} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} syncBusy={syncBusy} />
        )}
      />

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
          {openViewedLog ? (
            <ViewedLogDetail log={openViewedLog} onBack={() => setOpenViewedLog(null)} />
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>VIEWING · {viewedCode} · READ-ONLY</span>
                <button onClick={closeView} className="cp-btn" style={{ fontSize: 8, padding: '3px 7px' }}>CLOSE</button>
              </div>
              {viewedLogs.length === 0 ? (
                <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em', padding: '8px 0' }}>
                  NO LOGS FOUND FOR THIS CODE
                </div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  <GroupedLogs
                    undated={viewedUndated} flat={viewedFlat}
                    pastMonthsArr={viewedPastMonthsArr} pastYearsArr={viewedPastYearsArr}
                    expanded={viewedExpanded} onToggle={toggleViewed}
                    renderLog={(log) => <ViewedLogRow key={log.id} log={log} onOpen={setOpenViewedLog} />}
                  />
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
