import { describe, it, expect } from 'vitest'
import { parseNotam, parseNotamResponses } from './notamAPI'

// ISO timestamp `days` from now (negative = past)
const iso = days => new Date(Date.now() + days * 86_400_000).toISOString()

const base = (over = {}) => ({
  notam_number: 'A1234/25',
  icao_code: 'WMKK',
  qcode: 'QMRLC',
  starts_at: iso(-1),
  ends_at: iso(1),
  is_permanent: false,
  icao_message:
    'A1234/25 NOTAMN Q) WMFC/QMRLC/IV/NBO/A/000/999/0258N10142E005 ' +
    'A) WMKK B) 2501150000 C) 2501202359 E) RWY 14L/32R CLOSED',
  ...over,
})

describe('parseNotam', () => {
  it('maps core fields from a Notamify object', () => {
    const n = parseNotam(base())
    expect(n.id).toBe('A1234/25')
    expect(n.icao).toBe('WMKK')
    expect(n.qCode).toBe('QMRLC')
    expect(n.category).toBe('AERODROME') // QM* → aerodrome/movement area
    expect(n.summary).toBe('Runway')     // QMR → runway
    expect(n.raw).toContain('RWY 14L/32R CLOSED')
  })

  it('marks an in-window NOTAM ACTIVE', () => {
    expect(parseNotam(base()).validity.status).toBe('ACTIVE')
  })

  it('marks a not-yet-started NOTAM FUTURE', () => {
    expect(parseNotam(base({ starts_at: iso(1), ends_at: iso(2) })).validity.status).toBe('FUTURE')
  })

  it('marks a finished NOTAM EXPIRED', () => {
    expect(parseNotam(base({ starts_at: iso(-3), ends_at: iso(-1) })).validity.status).toBe('EXPIRED')
  })

  it('handles permanent NOTAMs', () => {
    const n = parseNotam(base({ is_permanent: true, ends_at: null, starts_at: iso(-1) }))
    expect(n.validity.status).toBe('ACTIVE')
    expect(n.endStr).toBe('PERM')
  })

  it('normalises a qcode missing its Q prefix', () => {
    expect(parseNotam(base({ qcode: 'MRLC' })).qCode).toBe('QMRLC')
  })

  it('falls back to the Q) line in raw text when qcode is absent', () => {
    const n = parseNotam(base({ qcode: '' }))
    expect(n.qCode).toBe('QMRLC')
  })

  it('returns null for missing input or id', () => {
    expect(parseNotam(null)).toBeNull()
    expect(parseNotam({ icao_code: 'WMKK' })).toBeNull()
  })
})

describe('parseNotamResponses', () => {
  it('dedupes by id and sorts ACTIVE → FUTURE → EXPIRED', () => {
    const resp = [{
      notams: [
        base({ notam_number: 'EXP/25', starts_at: iso(-3), ends_at: iso(-1) }),
        base({ notam_number: 'ACT/25', starts_at: iso(-1), ends_at: iso(1) }),
        base({ notam_number: 'FUT/25', starts_at: iso(1),  ends_at: iso(2) }),
        base({ notam_number: 'ACT/25', starts_at: iso(-1), ends_at: iso(1) }), // dup
      ],
    }]
    const out = parseNotamResponses(resp)
    expect(out.map(n => n.id)).toEqual(['ACT/25', 'FUT/25', 'EXP/25'])
  })

  it('merges multiple airport responses', () => {
    const out = parseNotamResponses([
      { notams: [base({ notam_number: 'A1/25', icao_code: 'WMKK' })] },
      { notams: [base({ notam_number: 'B1/25', icao_code: 'WSSS' })] },
    ])
    expect(out).toHaveLength(2)
  })

  it('tolerates empty/malformed responses', () => {
    expect(parseNotamResponses([null, {}, { notams: [] }])).toEqual([])
  })
})
