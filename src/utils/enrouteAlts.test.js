import { describe, it, expect } from 'vitest'
import { addEnroute, removeEnroute, activeEnroute, padEnroute } from './enrouteAlts'

const five = (...v) => [...v, '', '', '', '', ''].slice(0, 5)

describe('addEnroute', () => {
  it('adds one empty field', () => {
    expect(addEnroute(1, five('WMKP'), 5)).toEqual({ count: 2, alts: five('WMKP') })
  })
  it('starts from none', () => {
    expect(addEnroute(0, five(), 5)).toEqual({ count: 1, alts: five() })
  })
  it('the new field is empty even if the slot still holds old text', () => {
    const r = addEnroute(1, ['WMKP', 'OLD', '', '', ''], 5)
    expect(r.count).toBe(2)
    expect(r.alts[1]).toBe('')
  })
  it('stops at the maximum', () => {
    const alts = five('A', 'B', 'C', 'D', 'E')
    expect(addEnroute(5, alts, 5)).toEqual({ count: 5, alts })
  })
  it('does not change the array it was given', () => {
    const alts = five('WMKP')
    addEnroute(1, alts, 5)
    expect(alts).toEqual(five('WMKP'))
  })
})

describe('removeEnroute', () => {
  it('removes a field and the ones after it move up', () => {
    expect(removeEnroute(3, five('WMKP', 'WSSS', 'WIII'), 1)).toEqual({ count: 2, alts: five('WMKP', 'WIII') })
  })
  it('removes the first', () => {
    expect(removeEnroute(3, five('WMKP', 'WSSS', 'WIII'), 0)).toEqual({ count: 2, alts: five('WSSS', 'WIII') })
  })
  it('removes the last', () => {
    expect(removeEnroute(3, five('WMKP', 'WSSS', 'WIII'), 2)).toEqual({ count: 2, alts: five('WMKP', 'WSSS') })
  })
  it('can remove the only field, leaving none', () => {
    expect(removeEnroute(1, five('WMKP'), 0)).toEqual({ count: 0, alts: five() })
  })
  it('removes an empty field too', () => {
    expect(removeEnroute(2, five('WMKP', ''), 1)).toEqual({ count: 1, alts: five('WMKP') })
  })
  it('ignores text hiding beyond the visible fields', () => {
    expect(removeEnroute(1, ['WMKP', 'STALE', '', '', ''], 0)).toEqual({ count: 0, alts: five() })
  })
  it('does nothing for an index that is not a visible field', () => {
    const alts = five('WMKP')
    expect(removeEnroute(1, alts, 3)).toEqual({ count: 1, alts })
    expect(removeEnroute(1, alts, -1)).toEqual({ count: 1, alts })
  })
  it('keeps the array length', () => {
    expect(removeEnroute(3, five('A', 'B', 'C'), 1).alts).toHaveLength(5)
  })
})

describe('activeEnroute', () => {
  it('lists the filled, visible alternates in order', () => {
    expect(activeEnroute(3, ['wmkp', ' ', 'WIII', 'HIDDEN', ''])).toEqual(['WMKP', 'WIII'])
  })
  it('an empty field and no field are the same thing', () => {
    expect(activeEnroute(1, ['', '', '', '', ''])).toEqual(activeEnroute(0, ['', '', '', '', '']))
  })
  it('copes with missing input', () => {
    expect(activeEnroute(undefined, undefined)).toEqual([])
    expect(activeEnroute(2, [])).toEqual([])
  })
})

describe('no limit on enroute alternates', () => {
  it('adds past 5 when no max is given, growing the array', () => {
    const r = addEnroute(5, five('A', 'B', 'C', 'D', 'E'))
    expect(r.count).toBe(6)
    expect(r.alts).toEqual(['A', 'B', 'C', 'D', 'E', ''])
  })
  it('keeps adding one at a time', () => {
    let st = { count: 0, alts: padEnroute([]) }
    for (let i = 0; i < 12; i++) st = addEnroute(st.count, st.alts)
    expect(st.count).toBe(12)
    expect(st.alts).toHaveLength(12)
  })
  it('padEnroute pads to 5 but never cuts a longer list', () => {
    expect(padEnroute(['A'])).toEqual(['A', '', '', '', ''])
    expect(padEnroute(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toHaveLength(7)
    expect(padEnroute(undefined)).toEqual(['', '', '', '', ''])
  })
})
