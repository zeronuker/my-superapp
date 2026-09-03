import React from 'react'
import { fmtHazard, hazardColor, fmtSigmetAlt, fmtSigmetTime } from '../utils/sigmet'

// Extracted from SigmetViewer.jsx so BriefingView can render the same card
// without a circular import between the two components.
export default function SigmetCard({ s, now }) {
  const color = hazardColor(s.hazard)
  const expired = s.validTo && s.validTo.getTime() < now
  const altParts = []
  if (s.base != null) altParts.push(fmtSigmetAlt(s.base))
  if (s.top != null) altParts.push(fmtSigmetAlt(s.top))
  const altText = altParts.length === 2 ? altParts.join(' – ') : altParts.length === 1 ? `to ${altParts[0]}` : null

  const moveParts = []
  if (s.dir && s.spd) moveParts.push(`moving ${s.dir} at ${s.spd} kt`)
  if (s.chng) moveParts.push(s.chng)

  return (
    <div style={{
      background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)',
      borderLeft: `3px solid ${expired ? 'var(--cp-red)' : color}`,
      borderRadius: 6, padding: '10px 14px', opacity: expired ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            color: expired ? 'var(--cp-dim)' : color,
            textDecoration: expired ? 'line-through' : 'none',
          }}>
            {fmtHazard(s.hazard).toUpperCase()}{s.qualifier ? ` · ${s.qualifier}` : ''}
          </span>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>{s.firName || s.firId}</span>
        </div>
        {(s.validFrom || s.validTo) && (
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em' }}>
            {fmtSigmetTime(s.validFrom)} – {fmtSigmetTime(s.validTo)}
          </span>
        )}
      </div>
      {expired && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(248,113,113,0.12)',
          color: 'var(--cp-red)', borderRadius: 4, padding: '3px 8px', marginBottom: 6,
          fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        }}>
          ⚠ EXPIRED — DO NOT USE FOR PLANNING
        </div>
      )}
      {(altText || moveParts.length > 0) && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-txt)', marginBottom: 4 }}>
          {[altText, ...moveParts].filter(Boolean).join(' · ')}
        </div>
      )}
      {s.raw && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 6 }}>
          {s.raw}
        </div>
      )}
    </div>
  )
}
