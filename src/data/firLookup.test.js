import { describe, it, expect } from 'vitest'
import { icaoToFir } from './firLookup'

describe('icaoToFir', () => {
  it('gives an Uzbek airport under its new UZ code the Tashkent FIR, UZTR', () => {
    expect(icaoToFir('UZTT')).toEqual({ icao: 'UZTR', name: 'Tashkent FIR' })
    expect(icaoToFir('UZSS')?.icao).toBe('UZTR')
  })
  it('leaves the old UT rule as it was', () => {
    expect(icaoToFir('UTTT')?.icao).toBe('UTDD')
  })
  it('still resolves an ordinary airport', () => {
    expect(icaoToFir('WMKK')?.icao).toBeTruthy()
  })
})
