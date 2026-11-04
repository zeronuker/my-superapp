import { describe, it, expect } from 'vitest'
import { pickSelected, neighbour, rowText, hasMore, aircraftText } from './sectorNav'

const secs = ['a', 'b', 'c'].map(id => ({ id }))

describe('pickSelected', () => {
  it('finds the picked sector', () => {
    expect(pickSelected(secs, 'b')).toEqual({ index: 1, sector: secs[1] })
  })
  it('falls to the sector now at the old place when the picked one was removed', () => {
    expect(pickSelected([secs[0], secs[2]], 'b', 1).sector.id).toBe('c')
  })
  it('falls to the last sector when the old place is past the end', () => {
    expect(pickSelected([secs[0], secs[1]], 'c', 2).sector.id).toBe('b')
  })
  it('takes the first sector when nothing was picked', () => {
    expect(pickSelected(secs, null).sector.id).toBe('a')
  })
})

describe('neighbour', () => {
  it('steps either way', () => {
    expect(neighbour(secs, 1, -1).id).toBe('a')
    expect(neighbour(secs, 1, 1).id).toBe('c')
  })
  it('is null at both ends', () => {
    expect(neighbour(secs, 0, -1)).toBeNull()
    expect(neighbour(secs, 2, 1)).toBeNull()
  })
})

describe('rowText', () => {
  it('shows the flight and route', () => {
    expect(rowText({ fltNo: 'MH103', from: 'WMKK', dest: 'VHHH' })).toEqual({ flight: 'MH103', route: 'WMKK → VHHH' })
  })
  it('shows a dash for what is empty', () => {
    expect(rowText({ fltNo: '', from: 'WMKK', dest: '' })).toEqual({ flight: '—', route: 'WMKK → —' })
  })
})

describe('hasMore', () => {
  it('is false when ENG OUT and remarks are empty', () => {
    expect(hasMore({ engN1: '', engAlt: '', engIas: '', remark: '  ' })).toBe(false)
  })
  it('is true when any of them holds something', () => {
    expect(hasMore({ engN1: '', engAlt: '', engIas: '250', remark: '' })).toBe(true)
    expect(hasMore({ remark: 'Late pax' })).toBe(true)
  })
})

describe('aircraftText', () => {
  it('joins registration, type and configuration', () => {
    expect(aircraftText({ reg: '9M-LNQ', type: 'B738', config: 'C16Y138' })).toEqual({ main: '9M-LNQ', rest: ' · B738 · C16Y138' })
  })
  it('says NEW AIRCRAFT while empty', () => {
    expect(aircraftText({ reg: '', type: '', config: '' }).main).toBe('NEW AIRCRAFT')
  })
  it('dashes the parts still missing', () => {
    expect(aircraftText({ reg: '9M-LNQ', type: '', config: '' })).toEqual({ main: '9M-LNQ', rest: ' · — · —' })
  })
})
