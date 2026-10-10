import { describe, it, expect } from 'vitest'
import { loadSaves, isQuotaError } from './briefingStorage'

const LEGACY_KEY = 'cb-briefing-saves'

function fakeBackend(initial = [], { failPutAfter = Infinity, failGetAll = false } = {}) {
  const rows = [...initial]
  let puts = 0
  return {
    rows,
    getAll: async () => { if (failGetAll) throw new Error('idb down'); return [...rows] },
    put: async (e) => {
      if (puts++ >= failPutAfter) throw new Error('write failed')
      const i = rows.findIndex(r => r.id === e.id)
      if (i >= 0) rows[i] = e; else rows.push(e)
    },
  }
}
function fakeStorage(value) {
  const data = value === undefined ? {} : { [LEGACY_KEY]: JSON.stringify(value) }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    removeItem: (k) => { delete data[k] },
  }
}

describe('loadSaves', () => {
  it('returns what is already in IndexedDB when there is no legacy list', async () => {
    const backend = fakeBackend([{ id: 'a' }])
    expect(await loadSaves(backend, fakeStorage())).toEqual([{ id: 'a' }])
  })

  it('copies the legacy localStorage list into IndexedDB, then removes the legacy key', async () => {
    const backend = fakeBackend()
    const storage = fakeStorage([{ id: 'a' }, { id: 'b' }])
    const result = await loadSaves(backend, storage)
    expect(result.map(b => b.id)).toEqual(['a', 'b'])
    expect(backend.rows.map(b => b.id)).toEqual(['a', 'b'])
    expect(LEGACY_KEY in storage.data).toBe(false)
  })

  it('does not duplicate entries already migrated', async () => {
    const backend = fakeBackend([{ id: 'a' }])
    const result = await loadSaves(backend, fakeStorage([{ id: 'a' }, { id: 'b' }]))
    expect(result.map(b => b.id)).toEqual(['a', 'b'])
    expect(backend.rows).toHaveLength(2)
  })

  it('keeps the legacy list (and still returns it) when a copy fails part-way', async () => {
    const backend = fakeBackend([], { failPutAfter: 1 })
    const storage = fakeStorage([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const result = await loadSaves(backend, storage)
    expect(result.map(b => b.id).sort()).toEqual(['a', 'b', 'c'])
    expect(LEGACY_KEY in storage.data).toBe(true)
  })

  it('falls back to the legacy list when IndexedDB is unavailable', async () => {
    const backend = fakeBackend([], { failGetAll: true })
    const storage = fakeStorage([{ id: 'a' }])
    expect(await loadSaves(backend, storage)).toEqual([{ id: 'a' }])
    expect(LEGACY_KEY in storage.data).toBe(true)
  })

  it('ignores a corrupt legacy value', async () => {
    const backend = fakeBackend([{ id: 'a' }])
    const storage = { getItem: () => '{not json', removeItem: () => {} }
    expect(await loadSaves(backend, storage)).toEqual([{ id: 'a' }])
  })

  it('works with no localStorage at all', async () => {
    expect(await loadSaves(fakeBackend([{ id: 'a' }]), null)).toEqual([{ id: 'a' }])
  })
})

describe('isQuotaError', () => {
  it('recognises the quota-exceeded error shapes browsers use', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
  })
  it('rejects other errors', () => {
    expect(isQuotaError(new Error('x'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })
})
