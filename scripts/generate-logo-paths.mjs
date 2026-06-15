/**
 * Converts text in the ClaudeBorne horizontal logo SVG to vector paths.
 * Downloads Tourney woff2 from Google Fonts (one-time), extracts glyph
 * outlines via fontkit, and writes public/brand/logo-horizontal.svg.
 *
 * Run: node scripts/generate-logo-paths.mjs
 */

import * as fontkit from 'fontkit'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'public', 'brand', 'logo-horizontal.svg')

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    https.get(url, { headers: { 'User-Agent': ua } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(get(res.headers.location))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function getLatinWoff2(weight) {
  const css = (await get(
    `https://fonts.googleapis.com/css2?family=Tourney:wght@${weight}&display=swap`
  )).toString()

  const blocks = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m => m[1])
  const latin  = blocks.find(b => b.includes('U+0000-00FF'))
  if (!latin) throw new Error(`No latin @font-face block found for weight ${weight}`)

  const m = latin.match(/url\(([^)]+\.woff2)\)/)
  if (!m) throw new Error(`No woff2 URL in latin block for weight ${weight}`)

  console.log(`  [woff2 w${weight}] ${m[1].slice(0, 80)}…`)
  return get(m[1])
}

// ── Glyph → SVG path ─────────────────────────────────────────────────────────

function glyphToD(glyph, tx, ty, scale) {
  const d = []
  for (const { command: c, args: a } of glyph.path.commands) {
    const x = i => tx + a[i] * scale
    const y = i => ty - a[i] * scale
    if      (c === 'moveTo')    d.push(`M${x(0)} ${y(1)}`)
    else if (c === 'lineTo')    d.push(`L${x(0)} ${y(1)}`)
    else if (c === 'curveTo')   d.push(`C${x(0)} ${y(1)} ${x(2)} ${y(3)} ${x(4)} ${y(5)}`)
    else if (c === 'qCurveTo')  d.push(`Q${x(0)} ${y(1)} ${x(2)} ${y(3)}`)
    else if (c === 'closePath') d.push('Z')
  }
  return d.join(' ')
}

function textToD(font, text, anchorX, baselineY, fontSize, letterSpacing = 0, anchor = 'start') {
  const scale = fontSize / font.unitsPerEm

  // Compute total rendered width (for centering)
  let totalW = 0
  for (let i = 0; i < text.length; i++) {
    const g = font.glyphForCodePoint(text.codePointAt(i))
    totalW += g.advanceWidth * scale
    if (i < text.length - 1) totalW += letterSpacing
  }

  let cx = anchor === 'middle' ? anchorX - totalW / 2 : anchorX

  const parts = []
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)
    const g  = font.glyphForCodePoint(cp)
    const d  = glyphToD(g, cx, baselineY, scale)
    if (d) parts.push(d)
    cx += g.advanceWidth * scale + (i < text.length - 1 ? letterSpacing : 0)
  }
  return parts.join(' ')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Downloading fonts…')
  const [buf700, buf400] = await Promise.all([
    getLatinWoff2(700),
    getLatinWoff2(400),
  ])

  console.log('Parsing fonts…')
  const f700 = fontkit.create(buf700)
  const f400 = fontkit.create(buf400)
  console.log(`  w700 unitsPerEm=${f700.unitsPerEm}`)
  console.log(`  w400 unitsPerEm=${f400.unitsPerEm}`)

  console.log('Converting text to paths…')

  // "C" — outlined, centred at x=148, baseline y=204 (top-aligned with CLAUDEBORNE), 108px w700
  const dC         = textToD(f700, 'C',                    148, 204, 108, 0,  'middle')

  // "CLAUDEBORNE" — filled white, centred x=374, baseline y=155, 38px w700, ls=8
  const dWordmark  = textToD(f700, 'CLAUDEBORNE',          374, 155, 38,  8,  'middle')

  // "PILOT  UTILITY  SUITE" — centred x=374, baseline y=192, 13px w400, ls=4
  const dSubtitle  = textToD(f400, 'PILOT  UTILITY  SUITE', 374, 192, 13,  4,  'middle')

  const svg = `<svg width="100%" viewBox="0 0 680 320" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="navyBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#081420"/>
      <stop offset="100%" stop-color="#0A1C30"/>
    </linearGradient>
    <pattern id="squareGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff" stroke-width="0.3" opacity="0.12"/>
    </pattern>
    <clipPath id="logoClip">
      <rect x="80" y="30" width="520" height="240" rx="4"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect x="80" y="30" width="520" height="240" rx="4" fill="url(#navyBg)"/>
  <rect x="80" y="30" width="520" height="240" rx="4" fill="url(#squareGrid)" clip-path="url(#logoClip)"/>

  <!-- Panel rules -->
  <line x1="80" y1="78"  x2="600" y2="78"  stroke="#162535" stroke-width="0.8"/>
  <line x1="80" y1="252" x2="600" y2="252" stroke="#162535" stroke-width="0.8"/>

  <!-- Engineering corner marks -->
  <line x1="80"  y1="40"  x2="80"  y2="58"  stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="80"  y1="40"  x2="98"  y2="40"  stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="600" y1="40"  x2="600" y2="58"  stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="600" y1="40"  x2="582" y2="40"  stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="80"  y1="260" x2="80"  y2="242" stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="80"  y1="260" x2="98"  y2="260" stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="600" y1="260" x2="600" y2="242" stroke="#3dd9cc" stroke-width="1.2"/>
  <line x1="600" y1="260" x2="582" y2="260" stroke="#3dd9cc" stroke-width="1.2"/>

  <!-- Outlined C (paths) -->
  <path fill="none" stroke="#3dd9cc" stroke-width="2" d="${dC}"/>

  <!-- CLAUDEBORNE wordmark (paths) -->
  <path fill="#ffffff" d="${dWordmark}"/>

  <!-- Divider -->
  <line x1="214" y1="165" x2="534" y2="165" stroke="#3dd9cc" stroke-width="0.8"/>

  <!-- PILOT UTILITY SUITE subtitle (paths) -->
  <path fill="#6bbfcc" d="${dSubtitle}"/>
</svg>`

  fs.writeFileSync(OUT, svg, 'utf8')
  console.log(`Written: ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
