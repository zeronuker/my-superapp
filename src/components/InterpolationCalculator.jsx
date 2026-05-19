import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'

function bilinearInterpolate(rows, zValues, lookupX, lookupZ) {
  const x = parseFloat(lookupX)
  const z = parseFloat(lookupZ)
  if (isNaN(x) || isNaN(z)) return null

  const zParsed = zValues.map(v => parseFloat(v))
  if (zParsed.some(isNaN)) return null

  const validRows = rows
    .map(r => ({ x: parseFloat(r.x), ys: r.ys.map(y => parseFloat(y)) }))
    .filter(r => !isNaN(r.x))
    .sort((a, b) => a.x - b.x)

  if (validRows.length < 2) return null

  let xi1 = -1
  for (let i = 0; i < validRows.length - 1; i++) {
    if (x >= validRows[i].x && x <= validRows[i + 1].x) { xi1 = i; break }
  }
  if (xi1 === -1) return undefined

  const sortedZIdx = zParsed.map((z, i) => ({ z, i })).sort((a, b) => a.z - b.z)
  let zi1 = -1
  for (let i = 0; i < sortedZIdx.length - 1; i++) {
    if (z >= sortedZIdx[i].z && z <= sortedZIdx[i + 1].z) { zi1 = i; break }
  }
  if (zi1 === -1) return undefined

  const r1 = validRows[xi1], r2 = validRows[xi1 + 1]
  const ci1 = sortedZIdx[zi1].i, ci2 = sortedZIdx[zi1 + 1].i
  const z1 = sortedZIdx[zi1].z, z2 = sortedZIdx[zi1 + 1].z
  const x1 = r1.x, x2 = r2.x
  const y11 = r1.ys[ci1], y12 = r1.ys[ci2]
  const y21 = r2.ys[ci1], y22 = r2.ys[ci2]
  if ([y11, y12, y21, y22].some(isNaN)) return null

  const interpZ = (ya, yb) => z1 === z2 ? ya : ya + (z - z1) * (yb - ya) / (z2 - z1)
  const yAtX1 = interpZ(y11, y12)
  const yAtX2 = interpZ(y21, y22)
  return x1 === x2 ? yAtX1 : yAtX1 + (x - x1) * (yAtX2 - yAtX1) / (x2 - x1)
}

function getActiveXPair(rows, lookupX) {
  const x = parseFloat(lookupX)
  const valid = rows.map((r, i) => ({ x: parseFloat(r.x), i })).filter(p => !isNaN(p.x)).sort((a, b) => a.x - b.x)
  if (isNaN(x) || valid.length < 2) return []
  for (let i = 0; i < valid.length - 1; i++) {
    if (x >= valid[i].x && x <= valid[i + 1].x) return [valid[i].i, valid[i + 1].i]
  }
  return []
}

function getActiveZPair(zValues, lookupZ) {
  const z = parseFloat(lookupZ)
  const valid = zValues.map((v, i) => ({ z: parseFloat(v), i })).filter(p => !isNaN(p.z)).sort((a, b) => a.z - b.z)
  if (isNaN(z) || valid.length < 2) return []
  for (let i = 0; i < valid.length - 1; i++) {
    if (z >= valid[i].z && z <= valid[i + 1].z) return [valid[i].i, valid[i + 1].i]
  }
  return []
}

function fmt(val) {
  if (val === null) return ''
  if (val === undefined) return 'out of range'
  return parseFloat(val.toFixed(6)).toString()
}

export default function InterpolationCalculator() {
  const { interpolation, setInterpolation } = useCalculatorStore()
  const { zValues, rows, lookupX, lookupZ, result } = interpolation
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    setInterpolation({ result: fmt(bilinearInterpolate(rows, zValues, lookupX, lookupZ)) })
  }, [rows, zValues, lookupX, lookupZ])

  const setRows = next => setInterpolation({ rows: next })
  const setZValues = next => setInterpolation({ zValues: next })

  const updateCell = (ri, ci, val) => setRows(rows.map((r, i) => {
    if (i !== ri) return r
    const ys = [...r.ys]; ys[ci] = val; return { ...r, ys }
  }))
  const updateX = (ri, val) => setRows(rows.map((r, i) => i === ri ? { ...r, x: val } : r))
  const updateZ = (ci, val) => setZValues(zValues.map((z, i) => i === ci ? val : z))
  const addRow = () => setRows([...rows, { x: '', ys: zValues.map(() => '') }])
  const removeRow = idx => { if (rows.length <= 3) return; setRows(rows.filter((_, i) => i !== idx)) }
  const addCol = () => { setZValues([...zValues, '']); setRows(rows.map(r => ({ ...r, ys: [...r.ys, ''] }))) }
  const removeCol = ci => { if (zValues.length <= 1) return; setZValues(zValues.filter((_, i) => i !== ci)); setRows(rows.map(r => ({ ...r, ys: r.ys.filter((_, i) => i !== ci) }))) }

  const activeXPair = getActiveXPair(rows, lookupX)
  const activeZPair = getActiveZPair(zValues, lookupZ)
  const isRowActive = ri => activeXPair.includes(ri)
  const isColActive = ci => activeZPair.includes(ci)

  const S = {
    colBorder: ci => `1px solid ${isColActive(ci) ? 'var(--cp-accdim)' : 'var(--cp-border3)'}`,
    colBg: ci => isColActive(ci) ? 'rgba(79,195,247,0.05)' : 'transparent',
    rowBg: ri => isRowActive(ri) ? 'var(--cp-hover)' : 'var(--cp-bg2)',
    cellText: (ri, ci) => (isRowActive(ri) || isColActive(ci)) ? 'var(--cp-acc)' : 'var(--cp-txt)',
  }

  const hasEnoughData = rows.filter(r => r.x !== '').length >= 2 && zValues.filter(z => z !== '').length >= 1
  const hasLookup = lookupX !== '' && lookupZ !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── How-to banner ── */}
      <div style={{
        background: 'var(--cp-bg3)',
        border: '1px solid var(--cp-border2)',
        borderLeft: '3px solid var(--cp-acc)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setGuideOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "var(--cb-font-mono)",
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: 'var(--cp-acc)' }}>?</span>
            <span style={{ fontSize: 11, color: 'var(--cp-acc)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              How to use this calculator
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--cp-dim)', transform: guideOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {guideOpen && (
          <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--cp-border2)' }}>
            <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--cp-muted)', letterSpacing: '0.08em', lineHeight: 1.9 }}>
                This tool finds an <span style={{ color: 'var(--cp-acc)' }}>interpolated value (Y)</span> from a lookup table
                — the same technique used in aviation charts (performance tables, weight & balance, etc.).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['1', 'Fill the table', 'Each ROW has a "Row Variable" (left column). Each COLUMN header is a "Column Variable". The cells are the known Y values at those intersections.'],
                  ['2', 'Enter your lookup values', 'Type your Row Variable value in "Row Lookup" and your Column Variable value in "Column Lookup" below the table.'],
                  ['3', 'Read the result', 'Y Result auto-calculates. The highlighted rows & columns show which bracketing values are being used.'],
                ].map(([num, title, desc]) => (
                  <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      minWidth: 22, height: 22, borderRadius: '50%',
                      background: 'var(--cp-accdim)', color: 'var(--cp-acc)',
                      fontFamily: "var(--cb-font-mono)", fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                    }}>{num}</div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cp-acc)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{title}</div>
                      <div style={{ fontSize: 11, color: 'var(--cp-muted)', letterSpacing: '0.05em', lineHeight: 1.7 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 4, padding: '8px 12px', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.1em', lineHeight: 2 }}>
                EXAMPLE: altitude (rows) × temperature (columns) → fuel burn (Y cells)<br/>
                Row lookup = 35000, Column lookup = ISA+15 → gives you interpolated fuel burn
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Step progress indicator ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {[
          { n: 1, label: 'Fill table', done: hasEnoughData },
          { n: 2, label: 'Set lookups', done: hasLookup },
          { n: 3, label: 'Read result', done: hasLookup && result && result !== 'out of range' },
        ].map((step, i) => (
          <React.Fragment key={step.n}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: step.done ? 'rgba(74,222,128,0.15)' : 'var(--cp-bg3)',
                border: `1px solid ${step.done ? 'var(--cp-green)' : 'var(--cp-border)'}`,
                color: step.done ? 'var(--cp-green)' : 'var(--cp-dim)',
                fontFamily: "var(--cb-font-mono)", fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{step.done ? '✓' : step.n}</div>
              <span style={{ fontSize: 10, color: step.done ? 'var(--cp-green)' : 'var(--cp-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{step.label}</span>
            </div>
            {i < 2 && <div style={{ height: 1, flex: 1, background: 'var(--cp-border)', margin: '0 8px' }} />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Data table ── */}
      <div>
        <div className="cp-section-header">
          <span className="cp-section-title">Step 1 — Lookup Table</span>
          <div className="cp-divider" />
        </div>
        <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.1em', lineHeight: 1.6, marginBottom: 10, marginTop: -6 }}>
          ROW VARIABLE (left) × COLUMN VARIABLE (top) → Y VALUES (cells)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ minWidth: 90 }}>
                  <div style={{ color: 'var(--cp-acc)', fontSize: 9, letterSpacing: '0.15em' }}>ROW VAR →</div>
                </th>
                {zValues.map((z, ci) => (
                  <th key={ci} style={{ minWidth: 90, borderLeft: S.colBorder(ci), background: isColActive(ci) ? 'rgba(79,195,247,0.08)' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '2px 4px' }}>
                      <input
                        type="number"
                        value={z}
                        onChange={e => updateZ(ci, e.target.value)}
                        placeholder="Col val"
                        style={{
                          background: 'transparent', border: 'none', color: isColActive(ci) ? 'var(--cp-acc)' : 'var(--cp-dim)',
                          fontFamily: "var(--cb-font-mono)", fontSize: 11, textAlign: 'center',
                          width: '100%', outline: 'none', letterSpacing: '0.1em',
                        }}
                      />
                      {zValues.length > 1 && (
                        <button onClick={() => removeCol(ci)} style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--cp-red)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--cp-dim)'}
                        >×</button>
                      )}
                    </div>
                  </th>
                ))}
                <th style={{ width: 36, borderLeft: '1px solid var(--cp-border3)' }}>
                  <button onClick={addCol} style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--cp-acc)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--cp-dim)'}
                  >+</button>
                </th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: S.rowBg(ri), borderBottom: '1px solid var(--cp-border3)' }}>
                  <td style={{ textAlign: 'center', color: 'var(--cp-dim)', fontSize: 11, padding: '0 6px' }}>{ri + 1}</td>
                  <td>
                    <input type="number" value={row.x} onChange={e => updateX(ri, e.target.value)} placeholder="row value"
                      style={{ background: 'transparent', border: 'none', color: S.cellText(ri, -1), fontFamily: "var(--cb-font-mono)", fontSize: 13, textAlign: 'center', width: '100%', padding: '8px 4px', outline: 'none' }} />
                  </td>
                  {zValues.map((_, ci) => (
                    <td key={ci} style={{ borderLeft: S.colBorder(ci), background: S.colBg(ci) }}>
                      <input type="number" value={row.ys[ci] ?? ''} onChange={e => updateCell(ri, ci, e.target.value)} placeholder="y"
                        style={{ background: 'transparent', border: 'none', color: S.cellText(ri, ci), fontFamily: "var(--cb-font-mono)", fontSize: 13, textAlign: 'center', width: '100%', padding: '8px 4px', outline: 'none' }} />
                    </td>
                  ))}
                  <td />
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => removeRow(ri)} disabled={rows.length <= 3}
                      style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', cursor: rows.length <= 3 ? 'default' : 'pointer', fontSize: 16, padding: '4px 6px', opacity: rows.length <= 3 ? 0 : 1 }}
                      onMouseEnter={e => { if (rows.length > 3) e.currentTarget.style.color = 'var(--cp-red)' }}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--cp-dim)'}
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} style={{
          width: '100%', padding: '8px', background: 'transparent', marginTop: 6,
          border: '1px dashed var(--cp-border)', borderRadius: 4,
          color: 'var(--cp-dim)', fontFamily: "var(--cb-font-mono)",
          fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--cp-acc)'; e.currentTarget.style.color = 'var(--cp-acc)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cp-border)'; e.currentTarget.style.color = 'var(--cp-dim)' }}
        >+ Add Row</button>
      </div>

      {/* ── Lookup panel ── */}
      <div>
        <div className="cp-section-header" style={{ marginBottom: 10 }}>
          <span className="cp-section-title">Step 2 — Enter Your Values</span>
          <div className="cp-divider" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Row Variable Lookup', value: lookupX, onChange: v => setInterpolation({ lookupX: v }), placeholder: 'e.g. 35000' },
            { label: 'Column Variable Lookup', value: lookupZ, onChange: v => setInterpolation({ lookupZ: v }), placeholder: 'e.g. 15' },
          ].map((f, i) => (
            <div key={i}>
              <div className="cp-label" style={{ marginBottom: 6 }}>{f.label}</div>
              <input
                type="number"
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                placeholder={f.placeholder}
                className="cp-input"
                style={{ fontSize: 15 }}
              />
            </div>
          ))}
        </div>

        {/* Result card */}
        <div style={{
          background: 'var(--cp-bg3)',
          border: '1px solid var(--cp-border2)',
          borderLeft: `3px solid ${result && result !== 'out of range' ? 'var(--cp-green)' : result === 'out of range' ? 'var(--cp-yellow)' : 'var(--cp-border2)'}`,
          borderRadius: 4,
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="cp-label" style={{ marginBottom: 6 }}>Step 3 — Interpolated Y Result</div>
            <div style={{
              fontFamily: "var(--cb-font-mono)", fontWeight: 700,
              fontSize: result === 'out of range' ? 16 : 32,
              color: result === 'out of range' ? 'var(--cp-yellow)' : result ? 'var(--cp-acc)' : 'var(--cp-dim)',
              lineHeight: 1,
            }}>
              {result || (hasLookup ? '—' : 'enter values above')}
            </div>
            {result === 'out of range' && (
              <div style={{ fontSize: 11, color: 'var(--cp-yellow)', marginTop: 6, letterSpacing: '0.08em' }}>
                Lookup value is outside the table range
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.1em', textAlign: 'right', lineHeight: 2 }}>
            BILINEAR<br/>INTERPOLATION
          </div>
        </div>
      </div>
    </div>
  )
}
