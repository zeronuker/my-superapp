import { describe, it, expect, vi, afterEach } from 'vitest'
import { setLeaveGuard, guardLeave } from './leaveGuard'

afterEach(() => setLeaveGuard(null))

describe('guardLeave', () => {
  it('goes straight away when nothing is registered', () => {
    const go = vi.fn()
    guardLeave(go)
    expect(go).toHaveBeenCalledTimes(1)
  })
  it('hands the move to the guard, which decides whether to carry on', () => {
    const go = vi.fn(), guard = vi.fn()
    setLeaveGuard(guard)
    guardLeave(go)
    expect(guard).toHaveBeenCalledWith(go)
    expect(go).not.toHaveBeenCalled()
  })
  it('goes straight away again once the guard is removed', () => {
    const go = vi.fn()
    setLeaveGuard(vi.fn())
    setLeaveGuard(null)
    guardLeave(go)
    expect(go).toHaveBeenCalledTimes(1)
  })
})
