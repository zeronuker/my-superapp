// CVR → SuperApp. Loaded by the "SuperApp OFP" bookmark (made in Settings → Cloud Sync) on
// cvr.batikair.com.my's Voyage Reports page, where the pilot is already logged in.
//
// One tap sends every flight on the page dated in the CURRENT CALENDAR MONTH (device clock; the date is the
// dd-Mon-yyyy in the row) to the SuperApp OFP inbox. A flight whose inbox entry already has the same OFP number
// is skipped; a revised OFP (new number) is sent again and replaces the old entry.
//
// It uses the CVR WEBSITE's own two endpoints — the same ones the page's "Flight Plan" button calls —
// which return the OFP already decrypted as plain text (the company app's /api/eff/download-zip gives a
// ZipCrypto-ENCRYPTED zip instead, which a browser can't open):
//   GET /VoyageReports/FlightPlanFiles?reportId=<id>&sector=<sector>   -> { archives:[{ objectKey, files:[{name,path,folder}] }] }
//   GET /VoyageReports/FlightPlanFile?reportId=<id>&key=<objectKey>&entry=<path to XmlOFP.txt>  -> the XmlOFP text
// Same-origin, so the site's login cookie rides along — no password, no token kept here.
// A row's report number comes from its Flight Plan button (viewFlightPlan(reportId,'SECTOR','LABEL')) or, when that
// button is not shown yet, from its other report buttons (viewReportDetails / sendReportEmail / ExportReportPdf?reportId=).
// A row it cannot send (no report number, or flight text it cannot read) is listed in the panel with the reason
// and what its buttons call, so a flight-day row is never silently left out.
// It drops each XmlOFP into the SuperApp OFP inbox (/api/dutylog-sync?kind=ofp), one flight after another.
// The bookmark sets window.__cbCvr = { api: <SuperApp origin>, code: <sync code>, dry?: true }.
// The endpoints are not documented: if CVR changes them this shows CVR's error; importing a file still works.
//
// The panel is SuperApp's ClaudeBorne look with the OxygenOS feel (see src/oxygen.css): square corners, the brand grid and
// gradient stripe, mono labels, frosted glass, spring motion. It always uses the dark theme and mint accent, whatever the
// app's Settings say (CVR's page cannot read the app's storage). It starts as a dot, grows into the panel, and – shrinks it
// to a pill that shows the result (+ opens it again); × closes it for good and stops any flights not yet started.
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

  // The label's date ("… 07-Nov-2026") is in the given calendar month. A label with no readable date is not. Tested.
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  function labelMonth(label) {
    const m = /\d{2}-([A-Za-z]{3})-(\d{4})/.exec(label || '')
    const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
    return i < 0 ? null : { month: i, year: Number(m[2]) }
  }
  const inMonth = (label, now) => { const d = labelMonth(label); return !!d && d.month === now.getMonth() && d.year === now.getFullYear() }

  // "OD1703 TWU-BKI 07-Nov-2026" -> the panel row's parts { flight: 'OD1703', route: 'TWU › BKI', date: '07 NOV' }; a label
  // in any other shape is shown whole as the flight. Tested.
  function splitLabel(label) {
    const s = (label || '').trim()
    const m = /^(\S+)\s+(\S+)\s+(\d{2})-([A-Za-z]{3})-\d{4}$/.exec(s)
    return m ? { flight: m[1], route: m[2].replace(/-/g, ' › '), date: `${m[3]} ${m[4].toUpperCase()}` } : { flight: s, route: '', date: '' }
  }

  // The inbox entry's id for a flight: one per report and sector, so a revised OFP replaces it.
  const inboxId = f => `cvr-${f.reportId}-${f.sector.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 64)
  // The inbox (items: [{ id, label }]) already holds this flight with this same OFP number (its label ends " · OFP n"). Tested.
  function alreadySent(items, f, ofpNo) {
    const item = (items || []).find(i => i.id === inboxId(f))
    return !!ofpNo && Number(/ · OFP (\d+)$/.exec(item?.label || '')?.[1]) === ofpNo
  }

  globalThis.__cbParseRow = parseRow
  globalThis.__cbPickOfp = pickOfp
  globalThis.__cbInMonth = inMonth
  globalThis.__cbSplitLabel = splitLabel
  globalThis.__cbAlreadySent = alreadySent
  if (typeof document === 'undefined') return

  const cfg = globalThis.__cbCvr || {}
  if (location.hostname !== 'cvr.batikair.com.my') { alert('Open cvr.batikair.com.my (Voyage Reports) first, then tap the bookmark again.'); return }
  if (!cfg.api || !cfg.code) { alert('This bookmark is incomplete. Copy it again from SuperApp → Settings → Cloud Sync.'); return }

  const now = new Date()
  const monthName = now.toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase()
  const rows = [...document.querySelectorAll('.roster-item')]
    .map(row => parseRow(
      [...row.querySelectorAll('[onclick],[href]')].map(e => e.getAttribute('onclick') || e.getAttribute('href')).join(' '),
      row.textContent))
    .filter(Boolean)
  // One row per report and sector (a report can hold more than one sector); only this month's.
  const flights = rows.filter(r => !r.skip && inMonth(r.label, now)).filter((f, i, a) => a.findIndex(x => x.reportId === f.reportId && x.sector === f.sector) === i)
  // A row with no readable date is kept in the list: it cannot be told apart from this month's.
  const skipped = rows.filter(r => r.skip && (!labelMonth(r.label) || inMonth(r.label, now))).filter((s, i, a) => a.findIndex(x => x.label === s.label) === i)

  // ── The panel. It lives on CVR's page, so it brings its own CSS, scoped under #cb-cvr and written out in full
  // (CVR's own button/font rules must not leak in). Colours are SuperApp's dark theme tokens. ──
  const CSS = `
    #cb-cvr, #cb-cvr * { box-sizing: border-box; margin: 0; letter-spacing: normal; text-transform: none; text-align: left; }
    #cb-cvr {
      --s1:#141a2e; --s2:#1b2340; --mint:#3FE0C5; --blue:#3B8DFF; --grad:linear-gradient(135deg,#3FE0C5 0%,#3B8DFF 55%,#5B6BFF 100%);
      --ink:#e8ecf5; --dim:#9aa5c0; --line:rgba(255,255,255,.1); --line2:rgba(255,255,255,.16); --green:#4ade80; --yellow:#fcd34d; --red:#f87171;
      --sp:cubic-bezier(.34,1.56,.64,1); --ea:cubic-bezier(.22,1,.36,1);
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:2147483647; width:34px; height:34px; display:flex; flex-direction:column; overflow:hidden; border-radius:17px;
      font:400 12px/1.4 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; color:var(--ink);
      background:var(--grad) top/100% 2px no-repeat, linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/24px 24px,
        linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/24px 24px, color-mix(in srgb,var(--s1) 93%,transparent);
      backdrop-filter:blur(18px) saturate(170%); -webkit-backdrop-filter:blur(18px) saturate(170%);
      border:1px solid var(--line2);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 2px 4px rgba(0,0,0,.25),0 22px 50px rgba(0,0,0,.45);
      transition:width .7s var(--sp),height .7s var(--sp),top .7s var(--ea),transform .7s var(--ea),border-radius .5s var(--ea),box-shadow .5s var(--ea);
    }
    #cb-cvr.open { width:min(376px, calc(100vw - 20px)); height:min(560px, calc(100vh - 40px)); height:min(560px, calc(100dvh - 40px)); border-radius:8px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 2px 4px rgba(0,0,0,.25),0 22px 50px rgba(0,0,0,.45),0 0 40px color-mix(in srgb,var(--mint) 12%,transparent); }
    #cb-cvr.mini { top:14px; transform:translate(-50%,0); width:min(272px, calc(100vw - 20px)); height:34px; border-radius:17px; background:var(--grad) top/100% 2px no-repeat, rgba(4,7,14,.96); }
    #cb-cvr .hd { flex:none; display:flex; align-items:center; gap:10px; height:34px; padding:0 9px; white-space:nowrap; }
    #cb-cvr.open .hd { height:40px; border-bottom:1px solid var(--line); }
    #cb-cvr .dot { flex:none; width:16px; height:16px; border-radius:50%; background:var(--grad); box-shadow:0 0 12px color-mix(in srgb,var(--mint) 65%,transparent); }
    #cb-cvr .dot.warn { background:var(--yellow); box-shadow:0 0 12px rgba(252,211,77,.6); }
    #cb-cvr .dot.bad { background:var(--red); box-shadow:0 0 12px rgba(248,113,113,.6); }
    #cb-cvr .ttl { flex:1; min-width:0; display:flex; align-items:baseline; gap:9px; opacity:0; overflow:hidden; text-overflow:ellipsis; font-size:12px; color:var(--ink); transition:opacity .4s var(--ea) .25s; }
    #cb-cvr.open .ttl, #cb-cvr.mini .ttl { opacity:1; }
    #cb-cvr .wm { font:800 16px/1 'Tourney', system-ui, sans-serif; letter-spacing:.08em; color:var(--mint); }
    @supports ((-webkit-background-clip:text) or (background-clip:text)) { #cb-cvr .wm { background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; } }
    #cb-cvr .sub { font-size:11px; letter-spacing:.2em; color:var(--dim); }
    #cb-cvr .x { flex:none; width:24px; height:24px; padding:0; border-radius:4px; border:1px solid var(--line2); background:transparent; color:var(--dim); cursor:pointer;
      font-family:inherit; font-size:14px; line-height:1; display:flex; align-items:center; justify-content:center; opacity:0; transition:transform .35s var(--sp),border-color .15s,color .15s,opacity .3s .3s; }
    #cb-cvr.open .x, #cb-cvr.mini .x { opacity:1; }
    #cb-cvr .x:hover { border-color:var(--mint); color:var(--mint); }
    #cb-cvr .x.cl:hover { border-color:var(--red); color:var(--red); }
    #cb-cvr .x:active { transform:scale(.88); }
    #cb-cvr .stack { flex:1; min-height:0; display:flex; flex-direction:column; opacity:0; transition:opacity .4s var(--ea) .3s; }
    #cb-cvr.open .stack { opacity:1; }
    #cb-cvr .top { flex:none; padding:12px 12px 0; }
    #cb-cvr .top:empty, #cb-cvr .foot:empty { display:none; }
    #cb-cvr .list { flex:1; min-height:0; overflow-y:auto; padding:2px 12px 4px; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.22) transparent;
      -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 8px,#000 calc(100% - 12px),transparent 100%); mask-image:linear-gradient(to bottom,transparent 0,#000 8px,#000 calc(100% - 12px),transparent 100%); }
    #cb-cvr .list::-webkit-scrollbar { width:6px; }
    #cb-cvr .list::-webkit-scrollbar-thumb { background:rgba(255,255,255,.22); border-radius:3px; }
    #cb-cvr .foot { flex:none; padding:8px 12px 14px; border-top:1px solid var(--line); }
    #cb-cvr .sec { display:flex; align-items:center; gap:10px; margin-bottom:10px; font-size:11px; letter-spacing:.2em; color:var(--mint); white-space:nowrap; }
    #cb-cvr .sec i { flex:1; height:1px; background:var(--line2); }
    #cb-cvr .sec span:last-child { color:var(--dim); letter-spacing:.12em; }
    #cb-cvr .segs { display:flex; gap:3px; margin-bottom:10px; }
    #cb-cvr .seg { position:relative; flex:1; min-width:3px; height:6px; border-radius:1px; background:rgba(255,255,255,.1); overflow:hidden; transition:background .4s var(--ea),box-shadow .4s var(--ea); }
    #cb-cvr .seg.on { background:var(--mint); box-shadow:0 0 10px color-mix(in srgb,var(--mint) 70%,transparent); }
    #cb-cvr .seg.skip { background:#5d6a8f; }
    #cb-cvr .seg.dry { background:var(--yellow); }
    #cb-cvr .seg.fail { background:var(--red); box-shadow:0 0 10px rgba(248,113,113,.6); }
    #cb-cvr .seg.cur::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(63,224,197,.9),transparent); transform:translateX(-100%); animation:cbsw 1s linear infinite; }
    @keyframes cbsw { to { transform:translateX(100%); } }
    @keyframes cbri { from { opacity:0; transform:translateY(14px) scale(.97); } }
    @keyframes cbpop { 0% { transform:scale(.4); opacity:0; } 100% { transform:scale(1); opacity:1; } }
    @keyframes cbspin { to { transform:rotate(360deg); } }
    @keyframes cbrp { to { transform:scale(1); opacity:0; } }
    #cb-cvr .row { position:relative; overflow:hidden; display:flex; align-items:center; gap:10px; padding:8px 10px 8px 14px; margin-bottom:6px; border-radius:4px;
      background:color-mix(in srgb,var(--s2) 70%,transparent); border:1px solid var(--line); box-shadow:inset 0 1px 0 rgba(255,255,255,.05); animation:cbri .55s var(--sp) backwards; }
    #cb-cvr .row::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--line2); transition:background .3s; }
    #cb-cvr .row[data-k=run]::before { background:var(--mint); }
    #cb-cvr .row[data-k=ok]::before { background:var(--green); }
    #cb-cvr .row[data-k=dry]::before { background:var(--yellow); }
    #cb-cvr .row[data-k=skip]::before { background:#5d6a8f; }
    #cb-cvr .row[data-k=fail]::before { background:var(--red); }
    #cb-cvr .ic { flex:none; width:20px; height:20px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:12px; border:1px solid var(--line2); color:var(--dim); }
    #cb-cvr .ic[data-s=run] { border:2px solid rgba(63,224,197,.25); border-top-color:var(--mint); border-radius:50%; animation:cbspin .8s linear infinite; }
    #cb-cvr .ic[data-s=ok] { background:color-mix(in srgb,var(--green) 16%,transparent); border-color:color-mix(in srgb,var(--green) 50%,transparent); color:var(--green); animation:cbpop .45s var(--sp); }
    #cb-cvr .ic[data-s=dry] { background:color-mix(in srgb,var(--yellow) 14%,transparent); border-color:color-mix(in srgb,var(--yellow) 50%,transparent); color:var(--yellow); animation:cbpop .45s var(--sp); }
    #cb-cvr .ic[data-s=skip] { background:rgba(255,255,255,.06); animation:cbpop .45s var(--sp); }
    #cb-cvr .ic[data-s=fail] { background:color-mix(in srgb,var(--red) 16%,transparent); border-color:color-mix(in srgb,var(--red) 50%,transparent); color:var(--red); animation:cbpop .45s var(--sp); }
    #cb-cvr .rt { flex:1; min-width:0; line-height:1.35; }
    #cb-cvr .rt b { display:block; font-weight:500; font-size:13px; letter-spacing:.06em; color:var(--ink); }
    #cb-cvr .rt span { display:block; font-size:11px; color:var(--dim); letter-spacing:.1em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #cb-cvr .rt .why { white-space:normal; letter-spacing:.02em; margin-top:2px; color:var(--red); overflow-wrap:anywhere; }
    #cb-cvr .rt .why.warn { color:var(--yellow); }
    #cb-cvr .tg { flex:none; font-size:11px; letter-spacing:.08em; padding:2px 7px; border-radius:3px; border:1px solid var(--line2); color:var(--dim); }
    #cb-cvr .tg.ok { color:var(--mint); border-color:color-mix(in srgb,var(--mint) 40%,transparent); background:color-mix(in srgb,var(--mint) 9%,transparent); }
    #cb-cvr .tg.warn { color:var(--yellow); border-color:color-mix(in srgb,var(--yellow) 40%,transparent); background:color-mix(in srgb,var(--yellow) 9%,transparent); }
    #cb-cvr .tg.bad { color:var(--red); border-color:color-mix(in srgb,var(--red) 40%,transparent); background:color-mix(in srgb,var(--red) 9%,transparent); }
    #cb-cvr .sum { animation:cbri .6s var(--sp); }
    #cb-cvr .tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    #cb-cvr .tile { position:relative; overflow:hidden; padding:12px 6px 9px; text-align:center; border-radius:4px; background:color-mix(in srgb,var(--s2) 70%,transparent); border:1px solid var(--line); box-shadow:inset 0 1px 0 rgba(255,255,255,.06); }
    #cb-cvr .tile * { text-align:center; }
    #cb-cvr .tile.g::before { content:""; position:absolute; left:0; right:0; top:0; height:2px; background:var(--grad); }
    #cb-cvr .tile b { display:block; font-size:26px; font-weight:500; line-height:1.1; font-variant-numeric:tabular-nums; color:var(--ink); }
    #cb-cvr .tile span { font-size:11px; letter-spacing:.18em; color:var(--dim); }
    #cb-cvr .tile.g b { color:var(--mint); text-shadow:0 0 14px color-mix(in srgb,var(--mint) 55%,transparent); }
    #cb-cvr .tile.r b { color:var(--red); }
    #cb-cvr .note { font-size:11px; color:var(--dim); line-height:1.55; margin-top:10px; letter-spacing:.03em; }
    #cb-cvr .acts { display:flex; gap:8px; margin-top:12px; }
    #cb-cvr .btn { position:relative; overflow:hidden; flex:1; padding:9px 8px; border-radius:4px; border:1px solid var(--line2); background:transparent; color:var(--ink); cursor:pointer;
      font:400 12px/1.2 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; letter-spacing:.1em; text-align:center;
      transition:transform .45s var(--sp),box-shadow .3s var(--ea),border-color .15s,color .15s,background .15s; }
    #cb-cvr .btn:hover { transform:translateY(-1px); border-color:var(--blue); box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.3); }
    #cb-cvr .btn:active { transform:scale(.96); }
    #cb-cvr .btn.pri { border-color:var(--mint); color:var(--mint); background:#0d2840; }
    #cb-cvr .btn.pri:hover { border-color:var(--mint); box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 22px color-mix(in srgb,var(--mint) 22%,transparent); }
    #cb-cvr .rip { position:absolute; border-radius:50%; pointer-events:none; transform:scale(0); background:color-mix(in srgb,var(--mint) 30%,transparent); animation:cbrp .8s var(--ea) forwards; }
    #cb-cvr .card { text-align:center; padding:14px 8px 4px; animation:cbri .6s var(--sp); --c:var(--yellow); }
    #cb-cvr .card.r { --c:var(--red); }
    #cb-cvr .card * { text-align:center; }
    #cb-cvr .card .big { width:52px; height:52px; margin:0 auto 12px; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:22px; color:var(--c);
      background:color-mix(in srgb,var(--c) 10%,transparent); border:1px solid color-mix(in srgb,var(--c) 45%,transparent); box-shadow:0 0 28px color-mix(in srgb,var(--c) 22%,transparent); }
    #cb-cvr .card p { font-size:12px; letter-spacing:.14em; color:var(--ink); margin-bottom:5px; }
    #cb-cvr .card small { display:block; font-size:11px; color:var(--dim); line-height:1.55; overflow-wrap:anywhere; }
    #cb-cvr .cant { margin-top:12px; padding-top:10px; border-top:1px solid var(--line); font-size:11px; line-height:1.55; color:var(--dim); overflow-wrap:anywhere; }
    #cb-cvr .cant b { display:block; font-weight:500; letter-spacing:.14em; color:var(--yellow); margin-bottom:2px; }
    @media (prefers-reduced-motion: reduce) { #cb-cvr, #cb-cvr * { animation-duration:.01ms !important; transition-duration:.01ms !important; } }`
  document.getElementById('cb-cvr-css')?.remove()
  const style = document.createElement('style')
  style.id = 'cb-cvr-css'
  style.textContent = CSS
  document.head.appendChild(style)
  if (!document.getElementById('cb-cvr-font')) {
    const font = document.createElement('link')
    font.id = 'cb-cvr-font'
    font.rel = 'stylesheet'
    font.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Tourney:wght@800&display=swap'
    document.head.appendChild(font)
  }

  const h = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  document.getElementById('cb-cvr')?.remove()
  const box = h('div')
  box.id = 'cb-cvr'
  const dot = h('span', 'dot')
  const ttl = h('span', 'ttl')
  const x = h('button', 'x', '–')
  x.setAttribute('aria-label', 'Minimise')
  // × closes the panel for good. Closing while sending stops the flights not yet started (a flight already
  // in flight finishes; what was sent stays in the inbox).
  let closed = false
  const dismiss = () => { closed = true; box.remove() }
  const xc = h('button', 'x cl', '×')
  xc.setAttribute('aria-label', 'Close')
  xc.onclick = dismiss
  const hd = h('div', 'hd')
  hd.append(dot, ttl, x, xc)
  // Fixed size, centred in the window: the header, the progress (top) and the summary (foot) stay put; only the list scrolls.
  const top = h('div', 'top')
  const rowsEl = h('div')               // what a (re)run fills; the "cannot send" list stays below it
  const list = h('div', 'list')
  list.appendChild(rowsEl)
  const foot = h('div', 'foot')
  const stack = h('div', 'stack')
  stack.append(top, list, foot)
  box.append(hd, stack)
  document.body.appendChild(box)

  // The header: SUPERAPP wordmark + what it is doing, or (minimised) the short result. `tone`: '' | 'warn' | 'bad'.
  const state = { sub: '· SEND OFP', pill: 'sending…', tone: '' }
  function paint() {
    dot.className = 'dot' + (state.tone ? ' ' + state.tone : '')
    ttl.replaceChildren(...(box.classList.contains('mini')
      ? [h('span', '', state.pill)]
      : [h('span', 'wm', 'SUPERAPP'), h('span', 'sub', state.sub)]))
  }
  const set = (sub, pill, tone = '') => { Object.assign(state, { sub, pill, tone }); paint() }
  x.onclick = () => {
    const mini = box.classList.toggle('mini')
    box.classList.toggle('open', !mini)
    x.textContent = mini ? '+' : '–'
    x.setAttribute('aria-label', mini ? 'Open' : 'Minimise')
    paint()
  }
  paint()
  setTimeout(() => box.classList.add('open'), 200)   // dot → panel

  function ripple(e) {
    const b = e.currentTarget, q = b.getBoundingClientRect(), s = Math.max(q.width, q.height) * 2.2, d = h('span', 'rip')
    d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - q.left - s / 2}px;top:${e.clientY - q.top - s / 2}px`
    b.appendChild(d)
    setTimeout(() => d.remove(), 800)
  }
  const btn = (label, cls, onclick) => { const b = h('button', 'btn ' + cls, label); b.onpointerdown = ripple; b.onclick = onclick; return b }
  const acts = (...b) => { const a = h('div', 'acts'); a.append(...b); return a }
  const close = () => btn('CLOSE', '', dismiss)
  const count = (e, to) => { let i = 0; e.textContent = 0; if (!to) return; const t = setInterval(() => { e.textContent = ++i; if (i >= to) clearInterval(t) }, 120) }

  // A message card in the list (nothing to send, login expired, SuperApp unreachable), its buttons in the foot.
  // `keep`: add it under the rows already shown instead of replacing them.
  function card(tone, glyph, title, text, buttons, keep) {
    const c = h('div', 'card' + (tone === 'bad' ? ' r' : ''))
    c.append(h('div', 'big', glyph), h('p', '', title), h('small', '', text))
    if (keep) rowsEl.appendChild(c)
    else { top.replaceChildren(); rowsEl.replaceChildren(c) }
    foot.replaceChildren(acts(...buttons))
    list.scrollTop = list.scrollHeight
  }

  // Rows that cannot be sent, newest first as on the page: why, and what the row's buttons call.
  if (skipped.length) {
    const sk = h('div', 'cant')
    sk.appendChild(h('b', '', `CANNOT SEND (${skipped.length})`))
    skipped.slice(0, 6).forEach(s => sk.appendChild(h('div', '', `${s.label}: ${s.skip}. ${s.has.length ? `Row has: ${s.has.join(', ')}` : 'Row has no buttons'}.`)))
    if (skipped.length > 6) sk.appendChild(h('div', '', `…and ${skipped.length - 6} more`))
    list.appendChild(sk)
  }

  // An expired login answers with the sign-in page (HTML, status 200) instead of the data. Expired / refused logins
  // stop the whole run (`fatal`): every other flight would fail the same way.
  const fatal = (e) => Object.assign(e, { fatal: true })
  const RELOGIN = 'CVR did not answer with flight plan data. Your CVR login may have expired: reload this page, sign in, then tap the bookmark again.'
  // A refused request: the status and the start of what CVR said, short enough to read here.
  const refused = async (r) => {
    const said = (await r.text().catch(() => '')).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
    const e = new Error(`CVR answered ${r.status}${said ? `: ${said}` : '.'}` + (r.status === 401 || r.status === 403 ? ' Reload this page, sign in again, then retry.' : ''))
    return r.status === 401 || r.status === 403 ? fatal(e) : e
  }
  const getJson = async (url) => {
    const r = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' } })
    if (!r.ok) throw await refused(r)
    return r.json().catch(() => { throw fatal(new Error(RELOGIN)) })
  }

  // What SuperApp's inbox holds now: [{ id, label, sentAt }].
  async function listInbox() {
    const r = await fetch(`${cfg.api}/api/dutylog-sync?` + new URLSearchParams({ code: cfg.code, kind: 'ofp' }))
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`SuperApp refused the list (${r.status}): ${d.error || ''}`)
    return d.items || []
  }

  // One flight: find its OFP, skip it if the inbox has that OFP number, else download and send it.
  // Returns { kind: 'sent' | 'dry' | 'skip', ofpNo, revised, warn }; throws with the reason when it cannot.
  async function sendFlight(f, inbox) {
    const d = await getJson('/VoyageReports/FlightPlanFiles?' + new URLSearchParams({ reportId: f.reportId, sector: f.sector }))
    let picked
    // CVR's answer carries its own `message`: when nothing can be taken, show that too.
    try { picked = pickOfp(d.archives, f.sector) } catch (e) { throw new Error(e.message + (d.message ? ` CVR says: ${String(d.message).slice(0, 140)}` : '')) }
    const { archive, file, ofpNo, unsure } = picked
    if (alreadySent(inbox, f, ofpNo)) return { kind: 'skip', ofpNo }
    const revised = inbox.some(i => i.id === inboxId(f))   // the inbox has this flight with an older OFP
    const label = f.label + (ofpNo ? ` · OFP ${ofpNo}` : '')
    const r = await fetch('/VoyageReports/FlightPlanFile?' + new URLSearchParams({ reportId: f.reportId, key: archive.objectKey, entry: file.path }), { headers: { Accept: '*/*' } })
    if (!r.ok) throw await refused(r)
    const text = await r.text()
    if (!/<FlightPlan/.test(text)) throw /<html|<!doctype/i.test(text.slice(0, 500)) ? fatal(new Error(RELOGIN)) : new Error('That file was not an XmlOFP.')
    const warn = unsure ? 'CVR did not mark this package as this sector: check the flight on the OFP card.' : ''
    if (cfg.dry) return { kind: 'dry', ofpNo, revised, warn, kb: Math.round(text.length / 1024) }
    const s = await fetch(`${cfg.api}/api/dutylog-sync?` + new URLSearchParams({ code: cfg.code, kind: 'ofp', id: inboxId(f), label }), {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text,
    })
    if (!s.ok) throw new Error(`SuperApp refused it (${s.status}): ${(await s.json().catch(() => ({}))).error || ''}`)
    return { kind: 'sent', ofpNo, revised, warn }
  }

  // One flight's row in the list; the returned function shows its outcome.
  function flightRow(f) {
    const p = splitLabel(f.label)
    const row = h('div', 'row')
    row.dataset.k = 'run'
    const ic = h('span', 'ic')
    ic.dataset.s = 'run'
    const rt = h('div', 'rt')
    rt.append(h('b', '', p.flight), h('span', '', [p.route, p.date].filter(Boolean).join(' · ')))
    const tg = h('span', 'tg')
    row.append(ic, rt, tg)
    rowsEl.appendChild(row)
    list.scrollTop = list.scrollHeight
    return (kind, tag, why = '', warn = false) => {
      row.dataset.k = ic.dataset.s = kind
      ic.textContent = { ok: '✓', dry: '✓', skip: '–', fail: '✕' }[kind]
      tg.textContent = tag
      tg.className = 'tg ' + ({ ok: 'ok', dry: 'warn', fail: 'bad' }[kind] || '')
      if (why) rt.appendChild(h('span', 'why' + (warn ? ' warn' : ''), why))
      list.scrollTop = list.scrollHeight
    }
  }

  async function start() {
    rowsEl.replaceChildren()
    top.replaceChildren()
    foot.replaceChildren()
    set('· SEND OFP', 'sending…')
    if (!flights.length) {
      card('warn', '∅', `NO FLIGHTS DATED ${monthName}`, `Open Voyage Reports, make sure ${monthName.charAt(0) + monthName.slice(1).toLowerCase()} is listed, then tap the bookmark again.`, [close()])
      set('· SEND OFP', 'nothing to send', 'warn')
      return
    }
    const sec = h('div', 'sec')
    const cnt = h('span', '', `0 / ${flights.length}`)
    sec.append(h('span', '', monthName), h('i'), cnt)
    const segsEl = h('div', 'segs')
    flights.forEach(() => segsEl.appendChild(h('div', 'seg')))
    top.append(sec, segsEl)

    let inbox = []
    try { inbox = await listInbox() } catch (e) {
      // A dry run sends nothing, so it can go on without the list.
      if (closed) return
      if (!cfg.dry) {
        card('bad', '⚠', 'NOT SENT', e.message, [close(), btn('TRY AGAIN', 'pri', start)])
        set('· NOT SENT', 'not sent', 'bad')
        return
      }
    }
    const n = { sent: 0, dry: 0, skip: 0, fail: 0 }
    const segs = [...segsEl.children]
    for (let i = 0; i < flights.length; i++) {
      if (closed) return
      const f = flights[i]
      const show = flightRow(f)
      segs[i].classList.add('cur')
      let r, err
      try { r = await sendFlight(f, inbox) } catch (e) { err = e }
      if (closed) return
      segs[i].classList.remove('cur')
      if (err) {
        n.fail++
        show('fail', 'FAILED', err.fatal ? 'Login expired.' : err.message)
        segs[i].classList.add('fail')
      } else {
        n[r.kind]++
        const tag = (r.revised ? '↻ ' : '') + (r.ofpNo ? `OFP ${r.ofpNo}` : r.kind === 'dry' ? 'READ' : 'SENT')
        show(r.kind === 'sent' ? 'ok' : r.kind, tag, r.kind === 'dry' ? `${r.kb} kB read, not sent.${r.warn ? ' ' + r.warn : ''}` : r.warn, true)
        segs[i].classList.add({ sent: 'on', dry: 'dry', skip: 'skip' }[r.kind])
      }
      cnt.textContent = `${i + 1} / ${flights.length}`
      state.pill = `${i + 1} / ${flights.length}`
      paint()
      if (err?.fatal) {
        card('bad', '⚠', 'YOUR CVR LOGIN EXPIRED', 'Reload this page, sign in, then tap the bookmark again.', [close(), btn('RELOAD PAGE', 'pri', () => location.reload())], true)
        set('· NOT SENT', 'login expired', 'bad')
        return
      }
    }

    const sum = h('div', 'sum')
    const tiles = h('div', 'tiles')
    const tile = (cls, label, value) => { const t = h('div', 'tile ' + cls), b = h('b'); t.append(b, h('span', '', label)); tiles.appendChild(t); count(b, value) }
    tile('g', cfg.dry ? 'READ' : 'SENT', cfg.dry ? n.dry : n.sent)
    tile('', 'HAVE IT', n.skip)
    tile(n.fail ? 'r' : '', 'FAILED', n.fail)
    const note = h('div', 'note', cfg.dry ? 'Dry run: nothing was sent to SuperApp.' : 'Open SuperApp, then Briefing › + NEW › From CVR.' + (n.fail ? ' Retry the failed ones.' : ''))
    const open = btn('OPEN SUPERAPP', 'pri', () => window.open(cfg.api, '_blank', 'noopener'))
    sum.append(tiles, note, acts(...(n.fail ? [btn('RETRY FAILED', '', start)] : []), open))
    foot.appendChild(sum)
    const done = cfg.dry ? n.dry : n.sent
    const pill = [...(done || !n.fail ? [done ? `${done} ${cfg.dry ? 'read' : 'sent'}` : 'up to date'] : []), ...(n.fail ? [`${n.fail} failed`] : [])].join(' · ')
    set(n.fail ? '· DONE WITH ERRORS' : cfg.dry ? '· DRY RUN' : '· ALL SENT', pill, n.fail ? 'warn' : '')
  }
  start()
})()
