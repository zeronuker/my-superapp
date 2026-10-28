import { useEffect, useMemo, useRef, useState } from 'react'
import { MONTH_NAMES, monthCounts, itemsInMonth, yearBounds, paginate } from '../utils/monthGroups'

const mono = 'var(--cb-font-mono)'
const ACTIVE = { color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }

// A list shown one month at a time: a year switcher, a scrollable row of all 12 months (the
// selected one kept centred, empty ones dimmed but tappable) and that month's items, paged.
// `items` are already filtered; `getYM(item)` → { year, month } or null (null = left out; the
// caller shows those itself). While `searching`, the month row is replaced by every item in
// one paged list, so a match in any year shows. `noun` is e.g. 'LOG'.
export default function MonthBrowser({ items, getYM, renderItem, searching, noun, pageSize = 5 }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [page, setPage] = useState(1)
  const stripRef = useRef(null)
  const firstScroll = useRef(true)

  const bounds = useMemo(() => yearBounds(items, getYM, now.getFullYear()), [items, getYM])
  const counts = useMemo(() => monthCounts(items, getYM, year), [items, getYM, year])
  const list = searching ? items : itemsInMonth(items, getYM, year, month)
  const { shown, pages, cur } = paginate(list, page, pageSize)

  useEffect(() => { setPage(1) }, [searching])

  // Keep the selected month centred in the row.
  useEffect(() => {
    const strip = stripRef.current
    const btn = strip?.querySelector('[aria-pressed="true"]')
    if (!btn) return
    strip.scrollTo({ left: btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2, behavior: firstScroll.current ? 'auto' : 'smooth' })
    firstScroll.current = false
  }, [year, month, searching])

  const pick = (y, m) => { setYear(y); setMonth(m); setPage(1) }
  const label = `${noun}${list.length === 1 ? '' : 'S'}`
  const navBtn = { fontSize: 12, padding: '4px 10px' }

  return (
    <div>
      {!searching && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <button className="cp-btn" style={navBtn} aria-label="Previous year" disabled={year <= bounds.min}
              onClick={() => pick(year - 1, month)}>‹</button>
            <span style={{ fontFamily: mono, fontSize: 14, letterSpacing: '0.1em', minWidth: 48, textAlign: 'center' }}>{year}</span>
            <button className="cp-btn" style={navBtn} aria-label="Next year" disabled={year >= bounds.max}
              onClick={() => pick(year + 1, month)}>›</button>
          </div>
          <div ref={stripRef} className="cp-tab-bar" style={{ position: 'relative', display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
            {MONTH_NAMES.map((name, i) => {
              const on = month === i + 1
              return (
                <button key={name} className="cp-btn" aria-pressed={on} onClick={() => pick(year, i + 1)}
                  style={{
                    flex: '0 0 62px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0',
                    fontSize: 11, letterSpacing: '0.08em', ...(on ? ACTIVE : {}), ...(counts[i] || on ? {} : { opacity: 0.45 }),
                  }}>
                  {name.slice(0, 3)}
                  <span style={{ fontSize: 10, color: on ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>{counts[i] || '–'}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginBottom: 8 }}>
        <span>{searching ? 'ALL YEARS' : `${MONTH_NAMES[month - 1]} ${year}`}</span>
        <span>{list.length} {label}</span>
      </div>

      {list.length === 0 && !searching && (
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-dim)', textAlign: 'center', padding: '24px 0' }}>
          NO ENTRIES
        </div>
      )}
      {shown.map(renderItem)}

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
          <button className="cp-btn" onClick={() => setPage(cur - 1)} disabled={cur === 1}
            style={{ ...navBtn, fontSize: 10, letterSpacing: '0.16em', opacity: cur === 1 ? 0.4 : 1 }}>‹ PREV</button>
          <div style={{ textAlign: 'center', fontFamily: mono }}>
            <div style={{ fontSize: 13 }}>{(cur - 1) * pageSize + 1}–{Math.min(list.length, cur * pageSize)} of {list.length}</div>
            <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>PAGE {cur} OF {pages}</div>
          </div>
          <button className="cp-btn" onClick={() => setPage(cur + 1)} disabled={cur === pages}
            style={{ ...navBtn, fontSize: 10, letterSpacing: '0.16em', opacity: cur === pages ? 0.4 : 1 }}>NEXT ›</button>
        </div>
      )}
    </div>
  )
}
