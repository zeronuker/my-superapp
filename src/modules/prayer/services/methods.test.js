import { describe, it, expect } from 'vitest'
import { METHODS, METHOD_ID, FALLBACK_METHOD_ID, resolveMethodId, methodName } from './methods'
import { calculateLocal } from './adhanLocal'

describe('resolveMethodId', () => {
  it('maps the manual choices to their ids', () => {
    expect(resolveMethodId('jakim')).toBe(17)
    expect(resolveMethodId('mwl')).toBe(3)
    expect(Object.values(METHOD_ID).every(id => METHODS[id])).toBe(true)
  })
  it('uses what Auto resolved to, else the fallback', () => {
    expect(resolveMethodId('auto', 13)).toBe(13)
    expect(resolveMethodId('auto')).toBe(FALLBACK_METHOD_ID)
    expect(resolveMethodId('auto', 99)).toBe(FALLBACK_METHOD_ID)
  })
  it('passes a known id straight through', () => {
    expect(resolveMethodId(20)).toBe(20)
    expect(resolveMethodId(6)).toBe(FALLBACK_METHOD_ID)
  })
})

describe('METHODS table', () => {
  it('builds usable parameters for every id', () => {
    for (const id of Object.keys(METHODS)) expect(METHODS[id].params().fajrAngle).toBeGreaterThan(0)
  })
  it('carries the special cases', () => {
    expect(METHODS[22].params().ishaInterval).toBe(77)
    expect(METHODS[22].params().adjustments.maghrib).toBe(3)
    expect(METHODS[4].params().ishaInterval).toBe(90)
    expect(methodName(17)).toBe('JAKIM (Malaysia)')
  })
})

describe('calculateLocal in the location zone', () => {
  const KL = [3.139, 101.6869]
  const noon = new Date(2026, 9, 22, 12)
  it('formats in the given zone', () => {
    const t = calculateLocal(...KL, noon, 17, 'shafi', '24hr', 'Asia/Kuala_Lumpur')
    expect(t.Fajr).toBe('05:39')
    expect(t.Imsak).toBe('05:29')
    expect(t.methodId).toBe(17)
    expect(t.timeZone).toBe('Asia/Kuala_Lumpur')
  })
  it('shows a different clock reading in another zone, same moment', () => {
    const kl = calculateLocal(...KL, noon, 17, 'shafi', '24hr', 'Asia/Kuala_Lumpur')
    const utc = calculateLocal(...KL, noon, 17, 'shafi', '24hr', 'UTC')
    expect(utc.Fajr).toBe('21:39')
    expect(utc.fajrDate.getTime()).toBe(kl.fajrDate.getTime())
  })
})
