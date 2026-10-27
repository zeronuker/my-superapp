import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./briefingSync', () => ({ syncSnapshotCaches: vi.fn() }))

import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { useCalculatorStore } from '../store/calculatorStore'
import { idbBackend } from './briefingStorage'
import { writeLink, clearLink, takeSnapshot, restoreSnapshot } from './linkSave'

const save = (id) => ({ id, name: id, savedAt: 1, data: {}, route: { dep: 'WMKK', arr: 'WSSS' } })
const log = (id, sectors) => ({ id, date: '2026-10-27', aircraft: [{ id: 'a1', reg: '9M-A' }], sectors, notes: '', crew: [], updatedAt: 1 })
const sector = (id, over = {}) => ({ id, aircraftId: 'a1', fltNo: '', from: '', dest: '', ...over })

const flush = () => new Promise(r => setTimeout(r, 0))
const sectorOf = (id) => useDutyLogStore.getState().logs.flatMap(l => l.sectors).find(s => s.id === id)
const saveOf = (id) => useCalculatorStore.getState().briefing.saves.find(b => b.id === id)

beforeEach(() => {
  vi.spyOn(idbBackend, 'put').mockResolvedValue()
  useCalculatorStore.setState(s => ({ briefing: { ...s.briefing, saves: [save('b1'), save('b2')] } }))
  useDutyLogStore.setState({ logs: [log('L1', [sector('s1'), sector('s2')]), log('L2', [sector('s3')])] })
})

describe('writeLink and clearLink', () => {
  it('saves a link on the sector and on the briefing', async () => {
    writeLink('L1', 's1', 'b1')
    await flush()
    expect(sectorOf('s1').briefingLink).toBe('b1')
    expect(saveOf('b1').dutyLink).toEqual({ logId: 'L1', sectorId: 's1' })
  })
  it('a new briefing for a sector frees the old one', async () => {
    writeLink('L1', 's1', 'b1')
    await flush()
    writeLink('L1', 's1', 'b2')
    await flush()
    expect(saveOf('b1')).not.toHaveProperty('dutyLink')
    expect(saveOf('b2').dutyLink).toEqual({ logId: 'L1', sectorId: 's1' })
  })
  it('a briefing moved to another sector leaves the first one', async () => {
    writeLink('L1', 's1', 'b1')
    await flush()
    writeLink('L2', 's3', 'b1')
    await flush()
    expect(sectorOf('s1').briefingLink).toBe('')
    expect(saveOf('b1').dutyLink).toEqual({ logId: 'L2', sectorId: 's3' })
  })
  it('unlinking clears both sides', async () => {
    writeLink('L1', 's1', 'b1')
    await flush()
    clearLink('L1', 's1')
    await flush()
    expect(sectorOf('s1').briefingLink).toBe('')
    expect(saveOf('b1')).not.toHaveProperty('dutyLink')
  })
})

describe('takeSnapshot and restoreSnapshot', () => {
  it("puts back the log, the other logs' links and the briefings' copies", async () => {
    writeLink('L2', 's3', 'b1')
    await flush()
    const snap = takeSnapshot('L1')
    useDutyLogStore.getState().updateSector('L1', 's1', { fltNo: 'MH9' })
    writeLink('L1', 's1', 'b1')
    await flush()
    restoreSnapshot(snap)
    await flush()
    expect(sectorOf('s1')).toMatchObject({ fltNo: '' })
    expect(sectorOf('s1').briefingLink).toBeUndefined()
    expect(sectorOf('s3').briefingLink).toBe('b1')
    expect(saveOf('b1').dutyLink).toEqual({ logId: 'L2', sectorId: 's3' })
  })
})
