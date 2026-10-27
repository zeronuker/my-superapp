// Cloud backup of Saved Briefings. Works like the Duty Log's (modules/dutylog/services/sync.js)
// and shares its sync code, owner device and /api/dutylog-sync function (&kind=briefing).
// A briefing carries all its weather text and a map picture, so unlike the duty logs they
// go up one request each, and only the ones whose cloud copy is missing or has another name.
// The map picture (a data URL of any size) goes up first, cut into pieces under the server's
// document limit, then the briefing itself — so a briefing in the cloud always has its map.
// The owner device is the source of truth: a briefing deleted here is deleted in the cloud
// on the next sync.

import { briefingRow } from '../utils/savedBriefings'
import { useCalculatorStore } from '../store/calculatorStore'
import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { pushLogs } from '../modules/dutylog/services/sync'

// The server refuses a document over 900 000 bytes; a data URL is plain ASCII.
export const MAP_PIECE_CHARS = 700_000

const NOT_OWNER = 'This device no longer owns this code — ownership was transferred to another device.'

async function call(code, method, { id, part, deviceId, body } = {}) {
  const params = new URLSearchParams({ code, kind: 'briefing' })
  if (id) params.set('id', id)
  if (part !== undefined) params.set('part', part)
  if (method === 'DELETE') params.set('deviceId', deviceId)
  const res = await fetch(`/api/dutylog-sync?${params}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(res.status === 403 ? NOT_OWNER : data.error || `sync failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const cloudApi = {
  list:   (code) => call(code, 'GET').then(d => d.items),
  get:    (code, id) => call(code, 'GET', { id }),                       // { entry, mapParts }
  getPart: (code, id, part) => call(code, 'GET', { id, part }).then(d => d.data),
  put:    (code, deviceId, entry, mapParts, row) => call(code, 'PUT', { id: entry.id, body: { entry, mapParts, row, deviceId } }),
  putPart: (code, deviceId, id, part, data) => call(code, 'PUT', { id, part, body: { data, deviceId } }),
  remove: (code, deviceId, id) => call(code, 'DELETE', { id, deviceId }),
  claim:  (code, deviceId) => call(code, 'POST', { body: { deviceId } }).then(d => d.items),
}

// What a sync has to do: push saves the cloud lacks, holds under another name (a rename) or holds
// without its row summary (uploaded before the VIEW list drew rows); delete cloud copies of saves
// that are gone from this device.
export function planSync(saves, cloudItems) {
  const cloud = new Map(cloudItems.map(i => [i.id, i]))
  const local = new Set(saves.map(s => s.id))
  return {
    push: saves.filter(s => { const c = cloud.get(s.id); return !c || c.name !== s.name || !c.row }),
    remove: cloudItems.filter(i => !local.has(i.id)).map(i => i.id),
  }
}

export function splitMap(map) {
  const pieces = []
  for (let i = 0; map && i < map.length; i += MAP_PIECE_CHARS) pieces.push(map.slice(i, i + MAP_PIECE_CHARS))
  return pieces
}

const syncedMap = (saves) => Object.fromEntries(saves.map(s => [s.id, s.name]))

// 404 = the code has no backup yet; the first PUT creates it.
const listCloud = (api, code) => api.list(code).catch(e => { if (e.status === 404) return []; throw e })

// One briefing up: its map pieces first (a map never changes after saving, so only when the cloud's
// count differs), then the briefing itself without the map.
async function pushOne(api, code, deviceId, s, cloudItem) {
  const pieces = splitMap(s.mapSnapshot)
  if (cloudItem?.mapParts !== pieces.length) {
    for (let n = 0; n < pieces.length; n++) await api.putPart(code, deviceId, s.id, n, pieces[n])
  }
  await api.put(code, deviceId, { ...s, mapSnapshot: null }, pieces.length, briefingRow(s))
}

// Resolves the { id: name } map of what the cloud now holds. `onProgress(done, total)` is called
// before the first send and after each briefing sent or deleted.
export async function syncSaves(code, deviceId, saves, api = cloudApi, onProgress) {
  const items = await listCloud(api, code)
  const { push, remove } = planSync(saves, items)
  const cloudById = new Map(items.map(i => [i.id, i]))
  const total = push.length + remove.length
  let done = 0
  onProgress?.(done, total)
  for (const s of push) {
    await pushOne(api, code, deviceId, s, cloudById.get(s.id))
    onProgress?.(++done, total)
  }
  for (const id of remove) { await api.remove(code, deviceId, id); onProgress?.(++done, total) }
  return syncedMap(saves)
}

// Sends just these briefings, always (so a changed link goes up too), and deletes nothing in the cloud.
// Resolves the { id: name } map of the ones sent.
export async function pushSaves(code, deviceId, saves, api = cloudApi) {
  if (!saves.length) return {}
  const cloudById = new Map((await listCloud(api, code)).map(i => [i.id, i]))
  for (const s of saves) await pushOne(api, code, deviceId, s, cloudById.get(s.id))
  return syncedMap(saves)
}

// One briefing with its map put back together.
export async function fetchOne(code, id, api = cloudApi) {
  const { entry, mapParts } = await api.get(code, id)
  const pieces = []
  for (let n = 0; n < mapParts; n++) pieces.push(await api.getPart(code, id, n))
  return { ...entry, mapSnapshot: pieces.length ? pieces.join('') : null }
}

// Claims the code for this device (like the Duty Log's import) and downloads every briefing.
export async function fetchAll(code, deviceId, api = cloudApi) {
  const items = await api.claim(code, deviceId)
  const entries = []
  for (const i of items) entries.push(await fetchOne(code, i.id, api))
  return entries
}

// ── Calls from the UI ──────────────────────────────────────────────────────

// SYNC: this device's saves up to the cloud, under the Duty Log's sync code.
export async function syncBriefingsNow(onProgress) {
  const { syncCode, ensureDeviceId } = useDutyLogStore.getState()
  if (!syncCode) throw new Error('Create a cloud sync code in Settings first.')
  const { briefing, setBriefingCloud } = useCalculatorStore.getState()
  const synced = await syncSaves(syncCode, ensureDeviceId(), briefing.saves, cloudApi, onProgress)
  setBriefingCloud({ at: Date.now(), synced })
}

// A saved briefing's SYNC when it is linked to a duty log: the duty logs go up too (they always go as a set).
export async function syncLogsNow() {
  const { syncCode, logs, ensureDeviceId, markSynced } = useDutyLogStore.getState()
  if (!syncCode) throw new Error('Create a cloud sync code in Settings first.')
  await pushLogs(syncCode, logs, ensureDeviceId())
  markSynced(syncCode)
}

// A Duty Log card's SYNC: just the briefings linked to that log go up, the others are left alone.
export async function syncLinkedBriefings(saveIds) {
  const { syncCode, ensureDeviceId } = useDutyLogStore.getState()
  const { briefing, setBriefingCloud } = useCalculatorStore.getState()
  const saves = briefing.saves.filter(b => saveIds.includes(b.id))
  if (!saves.length) return
  const sent = await pushSaves(syncCode, ensureDeviceId(), saves)
  setBriefingCloud({ at: Date.now(), synced: { ...briefing.cloud.synced, ...sent } })
}

// VIEW: read-only list of what the code holds.
export const viewBriefings = (code) => cloudApi.list(code)

// Tap a name in the VIEW list: opens that one briefing read-only, nothing is saved or claimed.
export async function openCloudBriefing(code, id) {
  useCalculatorStore.getState().openViewedBriefing(await fetchOne(code, id))
}

// IMPORT: the saved list here becomes what the cloud holds. The code becomes this device's code.
export async function importBriefings(code) {
  const { ensureDeviceId, setSyncCode } = useDutyLogStore.getState()
  const { replaceSavedBriefings, setBriefingCloud } = useCalculatorStore.getState()
  const entries = await fetchAll(code, ensureDeviceId())
  const r = await replaceSavedBriefings(entries)
  if (!r.ok) throw new Error(r.reason === 'full' ? 'Device storage is full — nothing was imported.' : 'Could not store the briefings on this device.')
  setSyncCode(code)
  setBriefingCloud({ at: Date.now(), synced: syncedMap(entries) })
}
