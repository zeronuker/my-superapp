// CVR → SuperApp. Loaded by the "SuperApp OFP" bookmark (made in Settings → Cloud Sync) on
// cvr.batikair.com.my's Voyage Reports page, where the pilot is already logged in.
//
// It uses the CVR WEBSITE's own two endpoints — the same ones the page's "Flight Plan" button calls —
// which return the OFP already decrypted as plain text (the company app's /api/eff/download-zip gives a
// ZipCrypto-ENCRYPTED zip instead, which a browser can't open):
//   GET /VoyageReports/FlightPlanFiles?reportId=<id>&sector=<sector>   -> { archives:[{ objectKey, files:[{name,path,folder}] }] }
//   GET /VoyageReports/FlightPlanFile?reportId=<id>&key=<objectKey>&entry=<path to XmlOFP.txt>  -> the XmlOFP text
// Same-origin, so the site's login cookie rides along — no password, no token kept here.
// The flights come straight off the page, so the pilot just taps one. A row's report number comes from its
// Flight Plan button (viewFlightPlan(reportId,'SECTOR','LABEL')) or, when that button is not shown yet, from
// its other report buttons (viewReportDetails / sendReportEmail / ExportReportPdf?reportId=) — so a flight-day
// row that is not submitted yet is tried too (whether CVR serves its OFP before submission is what that tests).
// A row it cannot send (no report number, or flight text it cannot read) is listed in the panel with the reason
// and what its buttons call, so a flight-day row is never silently left out.
// It drops the XmlOFP into the SuperApp OFP inbox (/api/dutylog-sync?kind=ofp).
// The bookmark sets window.__cbCvr = { api: <SuperApp origin>, code: <sync code>, dry?: true }.
// The endpoints are not documented: if CVR changes them this shows CVR's error; importing a file still works.
(() => {
  // One roster row -> a flight { reportId, sector, label, hasPlan }, or { skip: why, label, has } for a row that
  // cannot be sent, or null for an empty row. `attrs` is the row's onclick/href values joined, `text` its text
  // ("OD1703 | TWU BKI | 07-Nov-2026 | …"). Tested.
  function parseRow(attrs, text) {
    attrs = attrs || ''
    const fp = /viewFlightPlan\(\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/.exec(attrs)
    if (fp) return { reportId: fp[1], sector: fp[2], label: fp[3], hasPlan: true }
    const id = /(?:viewReportDetails|sendReportEmail)\(\s*(\d+)|reportId=(\d+)/.exec(attrs)
    const clean = (text || '').replace(/\s+/g, ' ').trim()
    const t = /([A-Z0-9]{2}\d{1,4})\s*\|\s*([A-Z]{3})\s+([A-Z]{3})\s*\|\s*(\d{2}-[A-Za-z]{3}-\d{4})/.exec(clean)
    const label = t ? `${t[1]} ${t[2]}-${t[3]} ${t[4]}` : clean.slice(0, 48)
    if (id && t) return { reportId: id[1] || id[2], sector: t[1] + t[2] + t[3], label, hasPlan: false }
    if (!label) return null
    // What the row's buttons call: a screenshot of the panel then shows what a flight-day row carries.
    const has = [...new Set(attrs.match(/[A-Za-z_]\w*(?=\s*\()|\/\w+\/\w+(?=\?)/g) || [])].filter(n => n !== 'stopPropagation' && n !== 'void')
    return { skip: id ? 'its flight text could not be read' : 'no report number yet', label, has }
  }

  // FlightPlanFiles' archives -> the package to take and its XmlOFP. A revised OFP is a new package
  // (flightplans/<time><flight><sector>/<OFP number>.zip), so of this sector's packages the highest OFP number
  // wins. Throws saying which part is missing. `unsure`: the report's only package, but not marked as this
  // sector (taken, with a warning; with several packages and none for this sector, nothing is taken). Tested.
  function pickOfp(archives, sector) {
    const all = archives || []
    if (!all.length) throw new Error('CVR has no flight plan package for this flight yet.')
    const ofpNo = a => Number(/(\d+)\.zip$/i.exec(a.objectKey || '')?.[1]) || 0
    let mine = all.filter(a => a.matchesSector || (sector && (a.objectKey || '').toUpperCase().includes(sector.toUpperCase())))
    const unsure = !mine.length && all.length === 1
    if (unsure) mine = all
    if (!mine.length) throw new Error(`CVR has ${all.length} packages for this report, none of them for this sector.`)
    const archive = mine.filter(a => a.readable).sort((a, b) => ofpNo(b) - ofpNo(a))[0]
    if (!archive) throw new Error('CVR has the package but says it cannot be read yet.')
    const file = (archive.files || []).find(x => /^xmlofp\.(txt|xml)$/i.test(x.name || ''))
    if (!file) throw new Error('The package has no XmlOFP. It holds: ' + ((archive.files || []).map(x => x.name).join(', ') || 'nothing'))
    return { archive, file, ofpNo: ofpNo(archive) || null, unsure }
  }
  globalThis.__cbParseRow = parseRow
  globalThis.__cbPickOfp = pickOfp
  if (typeof document === 'undefined') return

  const cfg = globalThis.__cbCvr || {}
  if (location.hostname !== 'cvr.batikair.com.my') { alert('Open cvr.batikair.com.my (Voyage Reports) first, then tap the bookmark again.'); return }
  if (!cfg.api || !cfg.code) { alert('This bookmark is incomplete. Copy it again from SuperApp → Settings → Cloud Sync.'); return }

  const rows = [...document.querySelectorAll('.roster-item')]
    .map(row => parseRow(
      [...row.querySelectorAll('[onclick],[href]')].map(e => e.getAttribute('onclick') || e.getAttribute('href')).join(' '),
      row.textContent))
    .filter(Boolean)
  // One row per report and sector (a report can hold more than one sector).
  const flights = rows.filter(r => !r.skip).filter((f, i, a) => a.findIndex(x => x.reportId === f.reportId && x.sector === f.sector) === i)
  const skipped = rows.filter(r => r.skip).filter((s, i, a) => a.findIndex(x => x.label === s.label) === i)

  // The panel's own animations (it lives on CVR's page, so it brings its own CSS; all off for reduced motion).
  if (!document.getElementById('cb-cvr-css')) {
    const css = document.createElement('style')
    css.id = 'cb-cvr-css'
    css.textContent = `
      #cb-cvr { animation: cbin .25s ease-out }
      #cb-cvr .cb-spin { display:inline-block; width:12px; height:12px; box-sizing:border-box; border:2px solid rgba(63,224,197,.25); border-top-color:#3fe0c5; border-radius:50%; animation: cbspin .8s linear infinite }
      #cb-cvr .cb-bar { position:absolute; left:0; bottom:0; height:2px; width:35%; background:#3fe0c5; animation: cbbar 1.1s ease-in-out infinite }
      #cb-cvr .cb-pop { animation: cbpop .45s ease-out }
      #cb-cvr .cb-in { animation: cbfade .3s ease-out }
      #cb-cvr .cb-dots span { animation: cbdot 1.2s infinite; opacity:.2 }
      #cb-cvr .cb-dots span:nth-child(2) { animation-delay:.2s }
      #cb-cvr .cb-dots span:nth-child(3) { animation-delay:.4s }
      @keyframes cbspin { to { transform: rotate(360deg) } }
      @keyframes cbbar { 0% { left:-35% } 100% { left:100% } }
      @keyframes cbpop { 0% { transform:scale(.6); opacity:0 } 60% { transform:scale(1.15) } 100% { transform:scale(1); opacity:1 } }
      @keyframes cbin { from { opacity:0; transform:translate(-50%, -8px) } to { opacity:1 } }
      @keyframes cbfade { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:none } }
      @keyframes cbdot { 0%, 80%, 100% { opacity:.2 } 40% { opacity:1 } }
      @media (prefers-reduced-motion: reduce) { #cb-cvr, #cb-cvr * { animation: none !important } #cb-cvr .cb-dots span { opacity:1 } }`
    document.head.appendChild(css)
  }

  // Each step stays on screen at least this long, so the pilot can read what is happening.
  const MIN_STEP_MS = 700
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const atLeast = (p) => Promise.all([p, sleep(MIN_STEP_MS)]).then(([v]) => v)
  const el = (tag, style = '', text = '') => { const e = document.createElement(tag); e.style.cssText = style; e.textContent = text; return e }
  const dots = () => { const d = el('span'); d.className = 'cb-dots'; for (let i = 0; i < 3; i++) d.appendChild(el('span', '', '.')); return d }

  document.getElementById('cb-cvr')?.remove()
  const box = el('div', 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'width:min(360px, calc(100vw - 24px));max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;padding:14px;' +
    'border-radius:10px;background:#151d24;color:#e8eef3;border:1px solid #3fe0c5;box-shadow:0 10px 40px rgba(0,0,0,.6);' +
    'font:14px -apple-system, system-ui, sans-serif')
  box.id = 'cb-cvr'
  const head = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px')
  head.appendChild(el('b', 'letter-spacing:.12em;font-size:13px;color:#3fe0c5', 'SUPERAPP · SEND OFP'))
  const close = el('button', 'background:none;border:0;color:#9aa7b4;font-size:22px;cursor:pointer', '×')
  close.onclick = () => box.remove()
  head.appendChild(close)
  box.appendChild(head)
  box.appendChild(el('div', 'font-size:11px;color:#9aa7b4;margin-bottom:8px', flights.length
    ? 'Tap a flight to send its OFP to SuperApp.'
    : 'No flights with a report on this page. Open Voyage Reports and make sure your flights are listed, then tap the bookmark again.'))
  const listEl = el('div', 'max-height:42vh;overflow:auto')
  box.appendChild(listEl)
  // Rows that cannot be sent, newest first as on the page: why, and what the row's buttons call.
  if (skipped.length) {
    const sk = el('div', 'margin-top:8px;padding-top:8px;border-top:1px solid #3a4652;font-size:11px;line-height:1.5;color:#9aa7b4;overflow-wrap:anywhere')
    sk.appendChild(el('div', 'color:#fbbf24', `Cannot send (${skipped.length}):`))
    skipped.slice(0, 6).forEach(s => sk.appendChild(el('div', '', `${s.label}: ${s.skip}. ${s.has.length ? `Row has: ${s.has.join(', ')}` : 'Row has no buttons'}.`)))
    if (skipped.length > 6) sk.appendChild(el('div', '', `…and ${skipped.length - 6} more`))
    box.appendChild(sk)
  }
  const stepsEl = el('div', 'margin-top:10px;font-size:13px;line-height:1.4')
  stepsEl.setAttribute('role', 'status')
  box.appendChild(stepsEl)
  document.body.appendChild(box)

  // The tapped flight's progress: one line per step — ○ waiting, spinner + dots while running, ✓ done, ✗ failed.
  const STEPS = ['Finding the OFP on CVR', 'Downloading the OFP', cfg.dry ? 'Sending to SuperApp (dry run: skipped)' : 'Sending to SuperApp']
  function showSteps(active, failed) {
    stepsEl.replaceChildren(...STEPS.map((label, i) => {
      const line = el('div', `display:flex;align-items:center;gap:8px;margin:4px 0;color:${i > active ? '#6b7785' : '#e8eef3'}`)
      if (i === active) line.className = 'cb-in'   // only the step just reached animates in
      let icon
      if (i < active) { icon = el('span', 'color:#22c55e;width:12px;text-align:center', '✓'); if (i === active - 1) icon.className = 'cb-pop' }
      else if (i === active && failed) icon = el('span', 'color:#f87171;width:12px;text-align:center', '✗')
      else if (i === active) { icon = el('span'); icon.className = 'cb-spin' }
      else icon = el('span', 'width:12px;text-align:center', '○')
      const text = el('span', '', label)
      if (i === active && !failed) text.appendChild(dots())
      line.append(icon, text)
      return line
    }))
  }
  function finish(lines, color, bg) {
    const card = el('div', `margin-top:10px;padding:10px 12px;border-radius:8px;border:1px solid ${color};background:${bg};color:${color};font-size:13px;line-height:1.5`)
    card.className = 'cb-pop'
    lines.forEach((t, i) => card.appendChild(el('div', i ? 'color:#c9d3dc;font-size:12px' : 'font-weight:700', t)))
    stepsEl.appendChild(card)
    card.scrollIntoView({ block: 'nearest' })
  }

  // An expired login answers with the sign-in page (HTML, status 200) instead of the data.
  const RELOGIN = 'CVR did not answer with flight plan data. Your CVR login may have expired: reload this page, sign in, then tap the bookmark again.'
  // A refused request: the status and the start of what CVR said, short enough to read (and screenshot) here.
  const refused = async (r) => {
    const said = (await r.text().catch(() => '')).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
    return new Error(`CVR answered ${r.status}${said ? `: ${said}` : '.'}` + (r.status === 401 || r.status === 403 ? ' Reload this page, sign in again, then retry.' : ''))
  }
  const getJson = async (url) => {
    const r = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' } })
    if (!r.ok) throw await refused(r)
    return r.json().catch(() => { throw new Error(RELOGIN) })
  }

  async function send(f) {
    let step = 0
    const go = (i, work) => { step = i; showSteps(i); stepsEl.scrollIntoView({ block: 'nearest' }); return atLeast(work()) }
    try {
      const { archive, file, ofpNo, unsure } = await go(0, async () =>
        pickOfp((await getJson('/VoyageReports/FlightPlanFiles?' + new URLSearchParams({ reportId: f.reportId, sector: f.sector }))).archives, f.sector))
      const label = f.label + (ofpNo ? ` · OFP ${ofpNo}` : '')
      const text = await go(1, async () => {
        const r = await fetch('/VoyageReports/FlightPlanFile?' + new URLSearchParams({ reportId: f.reportId, key: archive.objectKey, entry: file.path }), { headers: { Accept: '*/*' } })
        if (!r.ok) throw await refused(r)
        const t = await r.text()
        if (!/<FlightPlan/.test(t)) throw new Error(/<html|<!doctype/i.test(t.slice(0, 500)) ? RELOGIN : 'That file was not an XmlOFP.')
        return t
      })
      await go(2, async () => {
        if (cfg.dry) return
        // One inbox entry per report and sector; sending a revised OFP replaces it.
        const id = `cvr-${f.reportId}-${f.sector.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 64)
        const s = await fetch(`${cfg.api}/api/dutylog-sync?` + new URLSearchParams({ code: cfg.code, kind: 'ofp', id, label }), {
          method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text,
        })
        if (!s.ok) throw new Error(`SuperApp refused it (${s.status}): ${(await s.json().catch(() => ({}))).error || ''}`)
      })
      showSteps(STEPS.length)
      const check = unsure ? ['CVR did not mark this package as this sector: check the flight on the OFP card.'] : []
      if (cfg.dry) finish([`Dry run: ${label}`, `OFP read (${Math.round(text.length / 1024)} kB), not sent.`, ...check], '#fbbf24', 'rgba(251,191,36,.1)')
      else finish([`✓ ${label} sent`, 'Now open SuperApp: Briefing → + NEW → From CVR.', ...check], '#22c55e', 'rgba(34,197,94,.12)')
    } catch (e) {
      showSteps(step, true)
      finish([`✗ Not sent`, e.message], '#f87171', 'rgba(248,113,113,.1)')
    }
  }

  const buttons = flights.map(f => {
    const b = el('button', 'position:relative;overflow:hidden;display:block;width:100%;text-align:left;margin:0 0 6px;padding:10px;' +
      'border-radius:6px;border:1px solid #3a4652;background:#0e141a;color:#e8eef3;font:13px ui-monospace,Menlo,monospace;cursor:pointer', f.label)
    if (!f.hasPlan) b.appendChild(el('span', 'color:#fbbf24', ' · not submitted'))
    b.onclick = async () => {
      buttons.forEach(x => { x.disabled = true; x.style.opacity = x === b ? '1' : '.45'; x.style.borderColor = x === b ? '#3fe0c5' : '#3a4652' })
      const bar = el('span'); bar.className = 'cb-bar'; b.appendChild(bar)
      await send(f)
      bar.remove()
      buttons.forEach(x => { x.disabled = false; x.style.opacity = '1' })
    }
    listEl.appendChild(b)
    return b
  })
})()
