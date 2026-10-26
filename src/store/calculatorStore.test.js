import { describe, it, expect, vi, beforeEach } from 'vitest'

const sync = vi.hoisted(() => vi.fn())
vi.mock('../services/briefingSync', () => ({ syncSnapshotCaches: sync }))

import { useCalculatorStore } from './calculatorStore'

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
