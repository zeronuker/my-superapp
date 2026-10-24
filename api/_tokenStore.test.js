import { describe, it, expect, vi, beforeEach } from 'vitest'

// A stand-in for Firestore: documents in a Map, and a record of how it was set up.
const fb = vi.hoisted(() => {
  const docs = new Map()
  const calls = { initializeApp: [], settings: [], collections: [] }
  const apps = []
  const doc = (col, id) => ({
    get: async () => { const d = docs.get(`${col}/${id}`); return { exists: d !== undefined, data: () => d } },
    set: async (v) => { docs.set(`${col}/${id}`, v) },
    delete: async () => { docs.delete(`${col}/${id}`) },
  })
  const db = {
    settings: (s) => { calls.settings.push(s) },
    collection: (c) => { calls.collections.push(c); return { doc: (id) => doc(c, id) } },
  }
  return { docs, calls, apps, db }
})
vi.mock('firebase-admin/app', () => ({
  getApps: () => fb.apps,
  initializeApp: (opts, name) => { const app = { name, opts }; fb.apps.push(app); fb.calls.initializeApp.push({ opts, name }); return app },
  cert: (c) => ({ cert: c }),
}))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fb.db }))

let store, now
const DAY = 86_400
const stored = () => [...fb.docs.values()][0]

beforeEach(async () => {
  vi.resetModules()
  fb.docs.clear(); fb.apps.length = 0
  fb.calls.initializeApp.length = 0; fb.calls.settings.length = 0; fb.calls.collections.length = 0
  process.env.FIREBASE_PROJECT_ID = 'proj'
  process.env.FIREBASE_CLIENT_EMAIL = 'svc@proj.iam.gserviceaccount.com'
  process.env.FIREBASE_PRIVATE_KEY = 'KEY\\nLINE'
  process.env.AUTOROUTER_PASSWORD = 'secret-password'
  process.env.VERCEL_ENV = 'production'
  now = 1_000_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  store = await import('./_tokenStore.js')
})

describe('seal / open', () => {
  it('round-trips a token', () => {
    expect(store.open(store.seal('TOKEN-123', 'pw'), 'pw')).toBe('TOKEN-123')
  })
  it('never contains the token in clear text', () => {
    expect(JSON.stringify(store.seal('TOKEN-123', 'pw'))).not.toContain('TOKEN-123')
  })
  it('seals the same token differently each time', () => {
    expect(store.seal('TOKEN-123', 'pw').data).not.toBe(store.seal('TOKEN-123', 'pw').data)
  })
  it('cannot be opened with another password', () => {
    expect(store.open(store.seal('TOKEN-123', 'pw'), 'other')).toBeNull()
  })
  it('cannot be opened once tampered with', () => {
    const box = store.seal('TOKEN-123', 'pw')
    const data = Buffer.from(box.data, 'base64'); data[0] ^= 1
    expect(store.open({ ...box, data: data.toString('base64') }, 'pw')).toBeNull()
  })
  it('returns null for rubbish instead of throwing', () => {
    expect(store.open(undefined, 'pw')).toBeNull()
    expect(store.open({ iv: 1, tag: 2, data: 3 }, 'pw')).toBeNull()
    expect(store.open({}, 'pw')).toBeNull()
  })
})

describe('where the token is kept', () => {
  it('uses one document per environment in appSecrets', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    expect([...fb.docs.keys()]).toEqual(['appSecrets/autorouter-production'])
  })
  it('keeps preview and production apart', async () => {
    process.env.VERCEL_ENV = 'preview'
    await store.writeStoredToken('T1', 3 * DAY)
    expect([...fb.docs.keys()]).toEqual(['appSecrets/autorouter-preview'])
  })
  it('falls back to a local name outside Vercel', async () => {
    delete process.env.VERCEL_ENV
    await store.writeStoredToken('T1', 3 * DAY)
    expect([...fb.docs.keys()]).toEqual(['appSecrets/autorouter-local'])
  })
  it('stores the token encrypted, with its expiry', async () => {
    await store.writeStoredToken('T1-VISIBLE?', 3 * DAY)
    expect(JSON.stringify(stored())).not.toContain('T1-VISIBLE?')
    expect(stored().expiresAt).toBe(now + 3 * DAY * 1000)
  })
})

describe('readStoredToken', () => {
  it('returns what was written', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    expect(await store.readStoredToken()).toBe('T1')
  })
  it('returns null when nothing is stored', async () => {
    expect(await store.readStoredToken()).toBeNull()
  })
  it('returns null once the token has expired', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    now += 3 * DAY * 1000 + 1
    expect(await store.readStoredToken()).toBeNull()
  })
  it('does not hand out a token that is about to expire', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    now += 3 * DAY * 1000 - 5 * 60 * 1000   // 5 minutes left
    expect(await store.readStoredToken()).toBeNull()
  })
  it('returns null (not an error) when the password has changed since', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    process.env.AUTOROUTER_PASSWORD = 'a-new-password'
    expect(await store.readStoredToken()).toBeNull()
  })
  it('returns null for a damaged document', async () => {
    fb.docs.set('appSecrets/autorouter-production', { box: 'garbage', expiresAt: now + 1e9 })
    expect(await store.readStoredToken()).toBeNull()
  })
})

describe('deleteStoredToken', () => {
  it('removes the stored token when it is the one that failed', async () => {
    await store.writeStoredToken('T1', 3 * DAY)
    await store.deleteStoredToken('T1')
    expect(fb.docs.size).toBe(0)
  })
  it('keeps a newer token another worker has stored', async () => {
    await store.writeStoredToken('T2', 3 * DAY)
    await store.deleteStoredToken('T1')
    expect(await store.readStoredToken()).toBe('T2')
  })
  it('does nothing when nothing is stored', async () => {
    await expect(store.deleteStoredToken('T1')).resolves.toBeUndefined()
  })
})

describe('connecting to Firestore', () => {
  it('connects only when first used, once, with its own app name and REST mode', async () => {
    expect(fb.calls.initializeApp).toHaveLength(0)   // importing the module connects to nothing
    await store.writeStoredToken('T1', 3 * DAY)
    await store.readStoredToken()
    await store.deleteStoredToken('T9')
    expect(fb.calls.initializeApp).toHaveLength(1)
    expect(fb.calls.initializeApp[0].name).toBe('autorouter-token')
    expect(fb.calls.initializeApp[0].opts.credential.cert).toEqual({
      projectId: 'proj', clientEmail: 'svc@proj.iam.gserviceaccount.com', privateKey: 'KEY\nLINE',   // \n turned into a real line break
    })
    expect(fb.calls.settings).toEqual([{ preferRest: true }])
  })

  it('explains clearly when the Firebase settings are missing', async () => {
    delete process.env.FIREBASE_PRIVATE_KEY
    await expect(store.readStoredToken()).rejects.toThrow(/FIREBASE_/)
  })

  it('does not remember a failed connection: the next call tries again', async () => {
    delete process.env.FIREBASE_PRIVATE_KEY
    await expect(store.readStoredToken()).rejects.toThrow()
    process.env.FIREBASE_PRIVATE_KEY = 'KEY'
    await expect(store.readStoredToken()).resolves.toBeNull()
  })

  it('does nothing and costs nothing without the autorouter password', async () => {
    delete process.env.AUTOROUTER_PASSWORD
    expect(await store.readStoredToken()).toBeNull()
    await expect(store.writeStoredToken('T1', 3 * DAY)).resolves.toBeUndefined()
    expect(fb.docs.size).toBe(0)
  })
})
