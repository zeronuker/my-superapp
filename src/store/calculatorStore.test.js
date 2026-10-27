import { describe, it, expect, vi, beforeEach } from 'vitest'

const sync = vi.hoisted(() => vi.fn())
vi.mock('../services/briefingSync', () => ({ syncSnapshotCaches: sync }))

import { useCalculatorStore } from './calculatorStore'
import { idbBackend } from '../services/briefingStorage'

const entry = { id: 'c1', name: 'Cloud one', route: { dep: 'WMKK', arr: 'WSSS' }, data: { metars: {} }, savedAt: 1 }

beforeEach(() => { sync.mockClear(); useCalculatorStore.getState().closeBriefing() })

describe('a briefing viewed from the cloud', () => {
  it('opens read-only without touching the METAR/TAF, NOTAM and SIGMET tabs or the saved list', () => {
    useCalculatorStore.getState().openViewedBriefing(entry)
    const { briefing } = useCalculatorStore.getState()
    expect(briefing).toMatchObject({ open: true, savedId: 'c1', viewed: entry })
    expect(briefing.saves.find(b => b.id === 'c1')).toBeUndefined()
    expect(sync).not.toHaveBeenCalled()
  })

  it('fills those tabs only when the NOTAM link pauses it', () => {
    useCalculatorStore.getState().openViewedBriefing(entry)
    useCalculatorStore.getState().pauseBriefing()
    expect(sync).toHaveBeenCalledWith(entry.route, entry.data)
    expect(useCalculatorStore.getState().briefing.open).toBe(false)
  })

  it('an ordinary pause (no cloud copy) fills nothing, and closing forgets the copy', () => {
    useCalculatorStore.getState().pauseBriefing()
    expect(sync).not.toHaveBeenCalled()
    useCalculatorStore.getState().openViewedBriefing(entry)
    useCalculatorStore.getState().closeBriefing()
    expect(useCalculatorStore.getState().briefing.viewed).toBeNull()
  })
})

describe('setSavedBriefingLink', () => {
  const save = { id: 's1', name: 'One', route: {}, data: {}, savedAt: 1 }
  const saved = () => useCalculatorStore.getState().briefing.saves.find(b => b.id === 's1')
  beforeEach(() => {
    vi.spyOn(idbBackend, 'put').mockResolvedValue()
    useCalculatorStore.setState(s => ({ briefing: { ...s.briefing, saves: [save] } }))
  })

  it('keeps the link on the save, in storage too, and drops it again', async () => {
    await useCalculatorStore.getState().setSavedBriefingLink('s1', { logId: 'L', sectorId: 'x' })
    expect(saved().dutyLink).toEqual({ logId: 'L', sectorId: 'x' })
    expect(idbBackend.put).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1', dutyLink: { logId: 'L', sectorId: 'x' } }))
    await useCalculatorStore.getState().setSavedBriefingLink('s1', null)
    expect(saved()).not.toHaveProperty('dutyLink')
  })

  it('changes nothing when storage fails or the save is unknown', async () => {
    idbBackend.put.mockRejectedValue(new Error('full'))
    expect(await useCalculatorStore.getState().setSavedBriefingLink('s1', { logId: 'L', sectorId: 'x' })).toEqual({ ok: false })
    expect(saved()).not.toHaveProperty('dutyLink')
    expect(await useCalculatorStore.getState().setSavedBriefingLink('nope', null)).toEqual({ ok: false })
  })
})
