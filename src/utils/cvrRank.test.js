import { describe, it, expect } from 'vitest'
import { parseCvrLabel, briefingDates, rankCvr } from './cvrRank'

const item = (id, label, sentAt = 1) => ({ id, label, sentAt })

describe('parseCvrLabel', () => {
  it('reads route (as ICAO) and date', () => {
    expect(parseCvrLabel('OD1703 TWU-BKI 07-Nov-2026 · OFP 3')).toEqual({ dep: 'WBKW', arr: 'WBKK', ymd: '2026-11-07' })
  })
  it('gives nulls for a label with neither', () => {
    expect(parseCvrLabel('Flight OD391')).toEqual({ dep: null, arr: null, ymd: '' })
  })
})

describe('briefingDates', () => {
  it('uses the OFP STD as the UTC date and the departure-local date', () => {
    const save = { route: { flightDetails: { info: { std: '2026-11-06T17:30:00Z' } } }, savedAt: 0 }
    expect(briefingDates(save, 'Asia/Kuala_Lumpur')).toEqual(['2026-11-06', '2026-11-07'])
  })
  it('falls back to the day it was saved', () => {
    expect(briefingDates({ route: {}, savedAt: Date.UTC(2026, 10, 7, 12) }, null)).toEqual(['2026-11-07'])
  })
})

describe('rankCvr', () => {
  const prefer = { dep: 'WBKW', arr: 'WBKK', dates: ['2026-11-07'] }
  it('puts same route + date first, then same route, each newest first, then the rest', () => {
    const list = [
      item('other-new', 'OD100 KUL-PEN 20-Nov-2026'),
      item('route-old', 'OD1703 TWU-BKI 01-Nov-2026'),
      item('exact', 'OD1703 TWU-BKI 07-Nov-2026'),
      item('route-new', 'OD1703 TWU-BKI 15-Nov-2026'),
      item('other-old', 'OD100 KUL-PEN 02-Nov-2026'),
    ]
    expect(rankCvr(list, prefer).map(i => i.id)).toEqual(['exact', 'route-new', 'route-old', 'other-new', 'other-old'])
  })
  it('breaks a tie on the sent time', () => {
    const list = [item('a', 'OD1 KUL-PEN 05-Nov-2026', 1), item('b', 'OD1 KUL-PEN 05-Nov-2026', 2)]
    expect(rankCvr(list, prefer).map(i => i.id)).toEqual(['b', 'a'])
  })
})
