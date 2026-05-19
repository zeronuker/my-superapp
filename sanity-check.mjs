import { readFileSync } from 'fs'

const tables = JSON.parse(readFileSync('./src/data/lookupTables.json', 'utf8'))

function extractTempValue(tempStr) {
  if (tempStr === 'ISA') return 0
  const match = tempStr.match(/ISA([+-]\d+)/)
  return match ? parseInt(match[1]) : 0
}

function interpolateAltitude(weight, weights, altitudes) {
  if (!weight || weights.length < 2 || weights.length !== altitudes.length) return null
  const w = parseFloat(weight)
  if (w < weights[0] || w > weights[weights.length - 1]) return null
  for (let i = 0; i < weights.length - 1; i++) {
    const w1 = weights[i], w2 = weights[i + 1]
    if (w >= w1 && w <= w2) {
      const h1 = altitudes[i], h2 = altitudes[i + 1]
      if (h1 === null || h2 === null) return null
      return Math.round(h1 + (w - w1) * (h2 - h1) / (w2 - w1))
    }
  }
  return null
}

function interpolateAltitude2D(weight, isaDeviation, weights, temperatures, data) {
  const dev = parseFloat(isaDeviation)
  const w = parseFloat(weight)
  if (isNaN(dev) || isNaN(w)) return null

  const tempValues = temperatures.map(extractTempValue)
  const minDev = tempValues[0], maxDev = tempValues[tempValues.length - 1]
  const clampedDev = Math.max(minDev, Math.min(maxDev, dev))
  const clamped = clampedDev !== dev

  let lowerIdx = 0
  for (let i = 0; i < tempValues.length; i++) {
    if (tempValues[i] <= clampedDev) lowerIdx = i
  }

  const lowerCol = temperatures[lowerIdx]

  if (tempValues[lowerIdx] === clampedDev) {
    const alt = interpolateAltitude(w, weights, data[lowerCol])
    return { altitude: alt, clamped }
  }

  const upperIdx = clampedDev >= maxDev ? lowerIdx : lowerIdx + 1
  const upperCol = temperatures[upperIdx]
  const lowerAlt = interpolateAltitude(w, weights, data[lowerCol])
  if (lowerAlt === null) return { altitude: null, clamped }
  const upperAlt = interpolateAltitude(w, weights, data[upperCol])
  if (upperAlt === null) return { altitude: lowerAlt, clamped }

  const t1 = tempValues[lowerIdx], t2 = tempValues[upperIdx]
  const altitude = Math.round(lowerAlt + (clampedDev - t1) * (upperAlt - lowerAlt) / (t2 - t1))
  return { altitude, clamped }
}

function fmt(val) {
  if (val === null || val === undefined) return 'N/A'
  return val.toLocaleString() + ' ft'
}

// Test cases: representative weights and ISA deviations
const testCases = [
  { weight: 50, isa: 10 },
  { weight: 50, isa: 15 },
  { weight: 50, isa: 20 },
  { weight: 60, isa: 10 },
  { weight: 60, isa: 12 },
  { weight: 60, isa: 15 },
  { weight: 60, isa: 17 },
  { weight: 60, isa: 20 },
  { weight: 70, isa: 10 },
  { weight: 70, isa: 15 },
  { weight: 70, isa: 20 },
  { weight: 75, isa: 13 },
  { weight: 80, isa: 10 },
  { weight: 80, isa: 15 },
  { weight: 80, isa: 20 },
  // Edge cases
  { weight: 45, isa: 10 },  // min weight for kias310
  { weight: 45, isa: 15 },
  { weight: 45, isa: 20 },  // expect N/A for kias310
  { weight: 85, isa: 10 },  // max weight LRC only
  { weight: 40, isa: 10 },  // min weight LRC only
]

const rows = []

for (const [acId, ac] of Object.entries(tables)) {
  for (const [varId, variant] of Object.entries(ac.variants)) {
    for (const tc of testCases) {
      const lrcTable = variant.tables.longRangeCruise
      const kiasTable = variant.tables.kias310 ?? null

      const lrcResult = lrcTable
        ? interpolateAltitude2D(tc.weight, tc.isa, lrcTable.weights, lrcTable.temperatures, lrcTable.data)
        : null

      const kiasResult = kiasTable
        ? interpolateAltitude2D(tc.weight, tc.isa, kiasTable.weights, kiasTable.temperatures, kiasTable.data)
        : null

      rows.push({
        aircraft: ac.displayName,
        variant: variant.displayName,
        weight: tc.weight,
        isa: `ISA+${tc.isa}`,
        lrc: lrcResult ? (lrcResult.clamped ? fmt(lrcResult.altitude) + '*' : fmt(lrcResult.altitude)) : 'N/A',
        kias: kiasResult ? (kiasResult.clamped ? fmt(kiasResult.altitude) + '*' : fmt(kiasResult.altitude)) : 'N/A',
      })
    }
  }
}

// Print as table
const col = (s, w) => String(s ?? '').padEnd(w)
const header = `${'Aircraft'.padEnd(22)} ${'Variant'.padEnd(12)} ${'Wt(t)'.padStart(6)} ${'ISA'.padEnd(8)} ${'LRC Alt'.padStart(12)} ${'KIAS310 Alt'.padStart(12)}`
console.log(header)
console.log('-'.repeat(header.length))
let lastGroup = ''
for (const r of rows) {
  const group = `${r.aircraft}|${r.variant}`
  if (group !== lastGroup) { console.log(''); lastGroup = group }
  console.log(
    `${col(r.aircraft, 22)} ${col(r.variant, 12)} ${String(r.weight).padStart(6)} ${col(r.isa, 8)} ${r.lrc.padStart(12)} ${r.kias.padStart(12)}`
  )
}
console.log('\n* = ISA deviation was outside table range and was clamped')
