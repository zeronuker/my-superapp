import { describe, it, expect } from 'vitest'
import { crewItem } from './linkItems'

const log = {
  id: 'l1', date: '2026-11-05',
  sectors: [{ from: 'WMKK', dest: 'OMDB' }, { from: 'OMDB', dest: 'WMKK' }],
  crew: [
    { id: 'a', name: 'ALI', position: 'CPT' },
    { id: 'b', name: '', position: 'FO' },
    { id: 'c', name: '', position: '' },
  ],
}

describe('crewItem', () => {
  it('titles the duty by date and whole route, and lists only filled-in crew', () => {
    const item = crewItem(log)
    expect(item.key).toBe('l1')
    expect(item.title).toBe('2026-11-05 · WMKK → OMDB → WMKK')
    expect(item.sub).toBe('ALI, FO')
    expect(item.tags[0].text).toBe('2 CREW')
  })

  it('finds a duty by crew name, position or route', () => {
    const { search } = crewItem(log)
    expect(search).toContain('ali')
    expect(search).toContain('fo')
    expect(search).toContain('omdb')
  })
})
