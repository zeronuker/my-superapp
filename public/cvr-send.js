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
// It drops the XmlOFP into the SuperApp OFP inbox (/api/dutylog-sync?kind=ofp).
// The bookmark sets window.__cbCvr = { api: <SuperApp origin>, code: <sync code>, dry?: true }.
// The endpoints are not documented: if CVR changes them this shows CVR's error; importing a file still works.
(() => {
  // One roster row -> { reportId, sector, label, hasPlan }, or null. `attrs` is the row's onclick/href values
  // joined, `text` its text ("OD1703 | TWU BKI | 07-Nov-2026 | …"). The one piece of parsing, so it has a test.
  function parseRow(attrs, text) {
    const fp = /viewFlightPlan\(\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/.exec(attrs || '')
    if (fp) return { reportId: fp[1], sector: fp[2], label: fp[3], hasPlan: true }
    const id = /(?:viewReportDetails|sendReportEmail)\(\s*(\d+)|reportId=(\d+)/.exec(attrs || '')
    const t = /([A-Z0-9]{2}\d{1,4})\s*\|\s*([A-Z]{3})\s+([A-Z]{3})\s*\|\s*(\d{2}-[A-Za-z]{3}-\d{4})/.exec((text || '').replace(/\s+/g, ' '))
    if (!id || !t) return null
    return { reportId: id[1] || id[2], sector: t[1] + t[2] + t[3], label: `${t[1]} ${t[2]}-${t[3]} ${t[4]}`, hasPlan: false }
  }
  globalThis.__cbParseRow = parseRow
  if (typeof document === 'undefined') return

  const cfg = globalThis.__cbCvr || {}
  if (location.hostname !== 'cvr.batikair.com.my') { alert('Open cvr.batikair.com.my (Voyage Reports) first, then tap the bookmark again.'); return }
  if (!cfg.api || !cfg.code) { alert('This bookmark is incomplete. Copy it again from SuperApp → Settings → Cloud Sync.'); return }

  const flights = [...document.querySelectorAll('.roster-item')]
    .map(row => parseRow(
      [...row.querySelectorAll('[onclick],[href]')].map(e => e.getAttribute('onclick') || e.getAttribute('href')).join(' '),
      row.textContent))
    .filter(Boolean)
    .filter((f, i, a) => a.findIndex(x => x.reportId === f.reportId) === i)   // one row per report

  document.getElementById('cb-cvr')?.remove()
  const box = document.createElement('div')
  box.id = 'cb-cvr'
  const list = flights.length
    ? flights.map(f => `<button class="cb-f" data-id="${f.reportId}" style="display:block;width:100%;text-align:left;margin:0 0 6px;padding:10px;border-radius:6px;border:1px solid #3a4652;background:#0e141a;color:#e8eef3;font:13px ui-monospace,Menlo,monospace;cursor:pointer">${f.label}${f.hasPlan ? '' : ' <span style="color:#fbbf24">· not submitted</span>'}</button>`).join('')
    : `<div style="font-size:12px;color:#9aa7b4;padding:8px 0">No flights with a report on this page. Open Voyage Reports and make sure your flights are listed, then tap the bookmark again.</div>`
  box.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">` +
      `<b style="letter-spacing:.12em;font-size:13px;color:#3fe0c5">SUPERAPP · SEND OFP</b>` +
      `<button id="cb-close" style="background:none;border:0;color:#9aa7b4;font-size:22px;cursor:pointer">×</button></div>` +
    `<div style="font-size:11px;color:#9aa7b4;margin-bottom:8px">Tap a flight to send its OFP to SuperApp.</div>` +
    `<div id="cb-list" style="max-height:50vh;overflow:auto">${list}</div>` +
    `<div id="cb-status" role="status" style="min-height:18px;font-size:13px;margin-top:10px;line-height:1.4"></div>`
  Object.assign(box.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147483647,
    width: 'min(360px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', boxSizing: 'border-box',
    padding: '14px', borderRadius: '10px', background: '#151d24', color: '#e8eef3',
    border: '1px solid #3fe0c5', boxShadow: '0 10px 40px rgba(0,0,0,.6)', font: '14px -apple-system, system-ui, sans-serif',
  })
  document.body.appendChild(box)

  const statusEl = box.querySelector('#cb-status')
  const status = (text, color = '#e8eef3') => { statusEl.textContent = text; statusEl.style.color = color }
  box.querySelector('#cb-close').onclick = () => box.remove()

  const getJson = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' } }); if (!r.ok) throw new Error(`CVR ${r.status}`); return r.json() }

  async function send(f) {
    status('Looking up the OFP…')
    const q = new URLSearchParams({ reportId: f.reportId, sector: f.sector })
    const d = await getJson('/VoyageReports/FlightPlanFiles?' + q)
    const archive = (d.archives || []).find(a => a.matchesSector && a.readable) || (d.archives || []).find(a => a.readable)
    const file = archive && (archive.files || []).find(x => x.name === 'XmlOFP.txt')
    if (!file) throw new Error('No XmlOFP in this flight plan yet.')

    status('Downloading the OFP…')
    const fq = new URLSearchParams({ reportId: f.reportId, key: archive.objectKey, entry: file.path })
    const r = await fetch('/VoyageReports/FlightPlanFile?' + fq, { headers: { Accept: '*/*' } })
    if (!r.ok) throw new Error(`CVR download failed (${r.status}).`)
    const text = await r.text()
    if (!/<FlightPlan/.test(text)) throw new Error('That file was not an XmlOFP.')

    if (cfg.dry) return status(`Dry run: ${f.label} — XmlOFP ${Math.round(text.length / 1024)} kB read, NOT sent.`, '#fbbf24')
    status('Sending to SuperApp…')
    const s = await fetch(`${cfg.api}/api/dutylog-sync?` + new URLSearchParams({ code: cfg.code, kind: 'ofp', id: 'cvr-' + f.reportId, label: f.label }), {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text,
    })
    if (!s.ok) throw new Error(`SuperApp refused it (${s.status}): ${(await s.json().catch(() => ({}))).error || ''}`)
    status(`${f.label} sent ✓ — in SuperApp: Briefing → + NEW → From CVR.`, '#22c55e')
  }

  box.querySelectorAll('.cb-f').forEach(btn => {
    btn.onclick = async () => {
      const f = flights.find(x => x.reportId === btn.dataset.id)
      box.querySelectorAll('.cb-f').forEach(b => (b.disabled = true))
      try { await send(f) } catch (e) { status(e.message, '#f87171') }
      box.querySelectorAll('.cb-f').forEach(b => (b.disabled = false))
    }
  })
})()
