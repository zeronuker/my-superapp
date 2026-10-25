import { describe, it, expect } from 'vitest'
import { utcParts, localParts, blockMinutes, fmtHm, ofpWarning, WARN_MS } from './ofpTimes'

const STD = '2026-10-22T18:15:00Z'
const COMPUTED = '2026-10-22T14:45:00Z'
const at = iso => Date.parse(iso)
const H = 3600e3

describe('utcParts / localParts', () => {
  it('formats UTC time and date', () => {
    expect(utcParts(STD)).toEqual({ time: '18:15Z', date: '22 OCT 2026' })
  })

  it('gives the local time, offset and date at each airport (OD372: 02:15 +0800 on the 23rd)', () => {
    expect(localParts(STD, 'Asia/Kuala_Lumpur')).toEqual({ time: '02:15', offset: '+0800', date: '23 OCT 2026' })
    expect(localParts('2026-10-22T22:30:00Z', 'Asia/Dili')).toEqual({ time: '07:30', offset: '+0900', date: '23 OCT 2026' })
  })

  it('keeps the same date when local and UTC fall on the same day', () => {
    expect(localParts('2026-10-25T04:15:00Z', 'Asia/Kuala_Lumpur')).toEqual({ time: '12:15', offset: '+0800', date: '25 OCT 2026' })
  })

  it('handles a zone behind UTC and a zero offset', () => {
    expect(localParts('2026-10-22T18:15:00Z', 'America/New_York').offset).toBe('-0400')
    expect(localParts('2026-01-22T18:15:00Z', 'Europe/London')).toEqual({ time: '18:15', offset: '+0000', date: '22 JAN 2026' })
  })

  it('returns null for an unknown zone or a bad time', () => {
    expect(localParts(STD, 'Nowhere/Land')).toBeNull()
    expect(localParts(STD, undefined)).toBeNull()
    expect(utcParts('nope')).toBeNull()
  })
})

describe('block time', () => {
  it('is STA minus STD, across midnight too', () => {
    expect(fmtHm(blockMinutes(STD, '2026-10-22T22:30:00Z'))).toBe('04:15')
    expect(fmtHm(blockMinutes('2026-10-22T22:00:00Z', '2026-10-23T02:10:00Z'))).toBe('04:10')
    expect(blockMinutes(STD, null)).toBeNull()
  })
})

describe('ofpWarning', () => {
  const w = now => ofpWarning(at(now), { std: STD, computed: COMPUTED })

  it('says nothing within 6 hours either side of STD (edges included)', () => {
    expect(ofpWarning(at(STD) - WARN_MS, { std: STD, computed: COMPUTED })).toBeNull()
    expect(w('2026-10-22T15:23:00Z')).toBeNull()
    expect(w(STD)).toBeNull()
    expect(ofpWarning(at(STD) + WARN_MS, { std: STD, computed: COMPUTED })).toBeNull()
  })

  it('is red once STD is more than 6 hours gone, counting from when the OFP was generated', () => {
    expect(ofpWarning(at(STD) + WARN_MS + 60e3, { std: STD, computed: COMPUTED })).toEqual({
      level: 'past', text: 'This OFP was generated 9 hours ago (22 Oct).',
    })
  })

  it('counts calendar days by UTC date from 24 hours', () => {
    expect(w('2026-10-25T11:50:00Z')).toEqual({ level: 'past', text: 'This OFP was generated 3 days ago (22 Oct).' })
    expect(w('2026-10-23T15:00:00Z')).toEqual({ level: 'past', text: 'This OFP was generated 1 day ago (22 Oct).' })
  })

  it('is yellow when STD is more than 6 hours away, in hours then days', () => {
    expect(ofpWarning(at(STD) - 10 * H - 30 * 60e3, { std: STD, computed: COMPUTED })).toEqual({
      level: 'future', text: 'This OFP’s STD is 10 hours ahead (22 Oct).',
    })
    expect(w('2026-10-20T12:00:00Z')).toEqual({ level: 'future', text: 'This OFP’s STD is 2 days ahead (22 Oct).' })
  })

  it('falls back to STD when the OFP has no computed time', () => {
    expect(ofpWarning(at('2026-10-25T11:50:00Z'), { std: STD, computed: null }).text).toBe('This OFP’s STD was 3 days ago (22 Oct).')
  })

  it('says nothing without a usable STD', () => {
    expect(ofpWarning(Date.now(), { std: null, computed: COMPUTED })).toBeNull()
  })
})
