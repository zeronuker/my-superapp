import React from 'react'

// QR finder-pattern modules for the decorative icon — not a real scannable
// code, just visual flavor to echo "the code that was just scanned".
const QR_MODULES = [
  // top-left finder eye
  [0, 0, 5, 1], [0, 4, 5, 1], [0, 1, 1, 3], [4, 1, 1, 3], [2, 2, 1, 1],
  // top-right finder eye
  [8, 0, 5, 1], [8, 4, 5, 1], [8, 1, 1, 3], [12, 1, 1, 3], [10, 2, 1, 1],
  // bottom-left finder eye
  [0, 8, 5, 1], [0, 12, 5, 1], [0, 9, 1, 3], [4, 9, 1, 3], [2, 10, 1, 1],
  // scattered data modules
  [6, 1, 1, 1], [6, 3, 1, 1], [7, 2, 1, 1], [6, 6, 1, 1], [8, 6, 1, 1], [10, 6, 1, 1], [12, 6, 1, 1],
  [6, 7, 1, 1], [9, 7, 1, 1], [11, 7, 1, 1], [2, 6, 1, 1], [3, 7, 1, 1], [1, 7, 1, 1],
  [7, 9, 1, 1], [9, 9, 1, 1], [11, 9, 1, 1], [7, 11, 1, 1], [9, 10, 1, 1], [6, 10, 1, 1],
  [11, 11, 1, 1], [8, 12, 1, 1], [10, 12, 1, 1],
]

const CORNER_SIDES = {
  tl: { top: 0, left: 0, borderRight: 'none', borderBottom: 'none', borderRadius: '4px 0 0 0' },
  tr: { top: 0, right: 0, borderLeft: 'none', borderBottom: 'none', borderRadius: '0 4px 0 0' },
  bl: { bottom: 0, left: 0, borderRight: 'none', borderTop: 'none', borderRadius: '0 0 0 4px' },
  br: { bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none', borderRadius: '0 0 4px 0' },
}

// Loading state shown while a scanned/typed duty-log code is being fetched.
// Echoes the QR-scan gesture that usually triggers it — viewfinder corner
// brackets + scan line, with a decorative QR icon inside.
export default function ScanViewfinderLoader({ code }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        {Object.entries(CORNER_SIDES).map(([pos, sides]) => (
          <div key={pos} style={{
            position: 'absolute', width: 22, height: 22, border: '2.5px solid var(--cp-acc)',
            animation: 'cp-corner-pulse 1.6s ease-in-out infinite', ...sides,
          }} />
        ))}
        <svg viewBox="0 0 13 13" style={{ position: 'absolute', inset: 21, opacity: 0.9 }}>
          {QR_MODULES.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="var(--cp-acc)" />
          ))}
        </svg>
        <div style={{
          position: 'absolute', left: 6, right: 6, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--cp-acc), transparent)',
          animation: 'cp-scanline 1.6s ease-in-out infinite',
        }} />
      </div>
      <div className="cp-label">READING CODE</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--cp-txt)' }}>
        {code}
      </div>
    </div>
  )
}
