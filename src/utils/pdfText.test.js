import { describe, it, expect } from 'vitest'
import { itemsToLines } from './pdfText'

const item = (str, x, y, width = str.length * 5) => ({ str, width, transform: [1, 0, 0, 1, x, y] })

describe('itemsToLines', () => {
  it('groups items by height, top line first, left to right', () => {
    const lines = itemsToLines([
      item('44.6', 40, 700), item('WMKK', 10, 700), item('E101 41.9', 40, 690),
    ])
    expect(lines).toEqual(['WMKK 44.6', 'E101 41.9'])
  })

  it('joins items with no gap and splits items with a gap', () => {
    expect(itemsToLines([item('N02', 10, 700), item(' 44.6', 25, 700)])).toEqual(['N02 44.6'])
    expect(itemsToLines([item('N02', 10, 700), item('44.6', 40, 700)])).toEqual(['N02 44.6'])
    expect(itemsToLines([item('WM', 10, 700), item('KK', 20, 700)])).toEqual(['WMKK'])
  })

  it('treats a tiny height difference as the same line', () => {
    expect(itemsToLines([item('A', 10, 700), item('B', 30, 699.2)])).toEqual(['A B'])
  })

  it('skips empty items and collapses runs of spaces', () => {
    expect(itemsToLines([item('', 5, 700), item('A   B', 10, 700)])).toEqual(['A B'])
  })
})
