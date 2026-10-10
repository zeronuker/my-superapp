// Saved Briefings storage — IndexedDB, one record per briefing (keyPath 'id').
//
// Saves used to live in a single localStorage key, which browsers cap at ~5 MB
// in total (each save carries the full METAR/TAF/NOTAM/SIGMET text plus a map
// still). Past the cap the write threw, the old code swallowed the error, and
// the briefing looked saved until the app was closed. IndexedDB has a far
// larger quota, and every write here reports success or failure to the caller.

const DB_NAME = 'cb-briefings'
const STORE = 'saves'
// Pre-IndexedDB location — migrated once, then removed (see loadSaves).
const LEGACY_KEY = 'cb-briefing-saves'

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // A failed open is not cached — the next call tries again.
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

// Resolves only once the transaction has committed, so "resolved" means the
// data is really on disk. Quota errors surface here as an abort.
function run(mode, action) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = action(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onabort = () => reject(tx.error || req.error || new Error('IndexedDB transaction aborted'))
  }))
}

export const idbBackend = {
  getAll: () => run('readonly', s => s.getAll()),
  put:    (entry) => run('readwrite', s => s.put(entry)),
  remove: (id) => run('readwrite', s => s.delete(id)),
}

// True when a write failed because the device/browser storage is full.
export function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.code === 22
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

function readLegacy(storage) {
  try {
    const raw = storage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) { return [] }
}

function mergeById(primary, extra) {
  const have = new Set(primary.map(b => b.id))
  return [...primary, ...extra.filter(b => !have.has(b.id))]
}

// Loads every saved briefing. First run after the update: copies the old
// localStorage list into IndexedDB, and removes the old copy only once every
// entry is written — if anything fails the old copy stays and is retried on
// the next launch, and the old entries are still returned so nothing vanishes
// from the list meanwhile.
export async function loadSaves(backend = idbBackend, storage = globalThis.localStorage) {
  const legacy = storage ? readLegacy(storage) : []
  let stored
  try { stored = await backend.getAll() } catch (_) { return legacy }
  if (!legacy.length) return stored

  const have = new Set(stored.map(b => b.id))
  try {
    for (const entry of legacy) {
      if (have.has(entry.id)) continue
      await backend.put(entry)
      stored.push(entry)
    }
    try { storage.removeItem(LEGACY_KEY) } catch (_) {}
    return stored
  } catch (_) {
    return mergeById(stored, legacy)
  }
}
