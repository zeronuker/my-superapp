import { describe, it, expect } from 'vitest'
import { fmtTrack } from './traffic'

describe('fmtTrack', () => {
  it('rounds and pads to 3 digits', () => { expect(fmtTrack(64.653824)).toBe('065°') })
  it('pads single-digit tracks', () => { expect(fmtTrack(7)).toBe('007°') })
})
