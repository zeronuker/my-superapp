// Phone-fit check: opens the running dev server at several phone widths and
// reports anything that sticks out past the left/right edge of the screen, or
// is silently cut off inside a box that clips sideways overflow.
//
//   1. npm run dev            (in another terminal; server on :5173)
//   2. npm run check:fit
//
// Env: BASE_URL (default http://localhost:5173), WIDTHS (default 320,360,375,414),
//      CHROME_PATH (default: Chrome in Program Files).
// Exits 1 if anything is found. Uses a throw-away Chrome profile, so it never
// touches your saved settings. Data tabs (weather, NOTAM, maps) are checked in
// whatever state the dev server gives them (usually offline/empty).
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const WIDTHS = (process.env.WIDTHS || '320,360,375,414').split(',').map(Number)
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const SETTLE_MS = 1600 // tool/tab animations plus headroom
const GROUPS = ['CALCULATOR', 'FLIGHT DATA', 'FLIGHT OPERATIONS', 'PRAYER']

// Runs inside the page. Lists (1) elements poking past the screen edge, except
// inside a box that scrolls sideways on purpose (tables, tab strips), and
// (2) boxes that clip sideways overflow (overflow-x hidden/clip) while their
// content is wider than they are. Ellipsis text and tiny boxes are ignored.
const findProblems = () => {
  const W = document.documentElement.clientWidth
  const scrolls = e => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true
    }
    return false
  }
  const label = e => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)}`
  const bad = []
  for (const e of document.querySelectorAll('body *')) {
    if (e instanceof SVGElement || e.closest('.leaflet-container, .maplibregl-map')) continue
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.opacity === '0') continue
    if ((r.right > W + 0.5 || r.left < -0.5) && !scrolls(e)) {
      bad.push(`${label(e)} ${Math.round(r.left)}..${Math.round(r.right)}`)
    } else if (
      (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' &&
      e.clientWidth > 120 && e.scrollWidth > e.clientWidth + 1
    ) {
      bad.push(`${label(e)} clipped ${e.scrollWidth}/${e.clientWidth}`)
    }
  }
  return bad.slice(0, 4)
}

const failures = []
let done = 0
let total = 1
const progress = label => {
  const width = 24
  const filled = Math.round((done / total) * width)
  const line = `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${String(Math.round((done / total) * 100)).padStart(3)}%  ${label}`
  process.stdout.write(`\r${line.padEnd(78).slice(0, 78)}`)
}

const newPage = async (browser, width, settings) => {
  const page = await (await browser.createBrowserContext()).newPage()
  await page.setViewport({ width, height: 800 })
  if (settings) await page.evaluateOnNewDocument(s => localStorage.setItem('cb-settings', s), JSON.stringify(settings))
  await page.goto(BASE)
  return page
}

const clickText = (page, selector, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().toUpperCase().includes(t))
  el?.click()
  return !!el
}, selector, text.toUpperCase())

// The settings button can be clicked before the app has attached its handlers,
// so retry until the panel's tab strip shows up.
const openSettings = async page => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => document.querySelector('button[aria-label="Open settings"]')?.click())
    try { await page.waitForSelector('[role=dialog] [aria-current]', { timeout: 3000 }); return } catch { /* retry */ }
  }
  throw new Error('Settings panel did not open')
}

// Counts the steps one width takes, so the bar can show real percentages.
const countSteps = async browser => {
  const page = await newPage(browser, WIDTHS[0])
  await page.waitForSelector('.cp-launch-card')
  const tools = await page.$$eval('.cp-launch-card', c => c.length)
  await openSettings(page)
  const settingsTabs = await page.$$eval('[role=dialog] [aria-current]', t => t.length)
  await page.close()
  return 1 + tools + 2 + GROUPS.length + settingsTabs // home, tools, tabs top+bottom, groups, settings tabs
}

const run = async (browser, width) => {
  const check = async (label, page) => {
    progress(`${width}px  ${label}`)
    await sleep(SETTLE_MS)
    const bad = await page.evaluate(findProblems)
    if (bad.length) failures.push(`${width}px  ${label}: ${bad.join(' | ')}`)
    done++
  }

  // Launcher (default): home screen, then every tool.
  const page = await newPage(browser, width)
  await page.waitForSelector('.cp-launch-card')
  await check('home', page)
  const names = await page.$$eval('.cp-launch-card', c => c.map(e => e.textContent.trim()))
  for (const [i, name] of names.entries()) {
    await page.evaluate(n => document.querySelectorAll('.cp-launch-card')[n].click(), i)
    await check(name, page)
    await clickText(page, 'button', 'HOME')
    await sleep(500)
  }

  // Settings panel, every tab.
  await openSettings(page)
  const tabCount = await page.$$eval('[role=dialog] [aria-current]', t => t.length)
  for (let i = 0; i < tabCount; i++) {
    await page.evaluate(n => document.querySelectorAll('[role=dialog] [aria-current]')[n].click(), i)
    await check(`settings tab ${i + 1}`, page)
  }
  await page.close()

  // The other two navigation styles (tab bar top/bottom, grouped).
  for (const [position, settings] of [['top', { navStyle: 'tabs', tabPosition: 'top' }], ['bottom', { navStyle: 'tabs', tabPosition: 'bottom' }]]) {
    const p = await newPage(browser, width, settings)
    await p.waitForSelector('.cp-tab')
    await check(`tab bar (${position})`, p)
    await p.close()
  }
  const grouped = await newPage(browser, width, { navStyle: 'grouped' })
  await grouped.waitForSelector('nav[aria-label="Calculators"] button')
  for (const g of GROUPS) {
    await clickText(grouped, 'nav[aria-label="Calculators"] button', g)
    await check(`grouped nav: ${g.toLowerCase()}`, grouped)
  }
  await grouped.close()
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  total = (await countSteps(browser)) * WIDTHS.length
  for (const w of WIDTHS) await run(browser, w)
} finally {
  await browser.close()
}
progress('done')
console.log()
if (failures.length) {
  console.error(`\nSticks out past the screen edge, or is cut off:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`OK: nothing sticks out at ${WIDTHS.join(', ')} px`)
