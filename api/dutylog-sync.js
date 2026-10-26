/**
 * Vercel serverless proxy for anonymous duty-log backup/restore via Firestore.
 * No user accounts — the sync code itself is the only credential, so anyone
 * holding it can read or overwrite that document.
 *
 * Required Vercel environment variables:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY  – service-account key, with literal \n line breaks
 *
 * GET  /api/dutylog-sync?code=XXXX-XXXX-XXXX   -> { logs, updatedAt }                  read-only view, no ownership check
 * PUT  /api/dutylog-sync?code=XXXX-XXXX-XXXX   body: { logs: [...], deviceId }         push — owner-only, auto-claims if unowned
 * POST /api/dutylog-sync?code=XXXX-XXXX-XXXX   body: { deviceId }                      claim + restore — transfers ownership
 *
 * Saved briefings share the same code, owner and device id. They are far bigger than a
 * duty log (and Vercel rejects request bodies over ~4.5 MB), so each one is its own
 * document under dutylogs/<code>/briefings/<id>, sent one request at a time (&kind=briefing):
 * GET  ...&kind=briefing            -> { items: [{ id, name, savedAt, mapParts, row }] }  list, no ownership check
 * GET  ...&kind=briefing&id=ID      -> { entry, mapParts }                               one briefing (without its map picture)
 * GET  ...&kind=briefing&id=ID&part=N -> { data }                                        piece N of its map picture
 * PUT  ...&kind=briefing&id=ID      body: { entry, mapParts, row, deviceId }             owner-only
 * PUT  ...&kind=briefing&id=ID&part=N body: { data, deviceId }                           owner-only
 * DELETE ...&kind=briefing&id=ID&deviceId=DEV                                            owner-only, with its map pieces
 * POST ...&kind=briefing            body: { deviceId }                                   claim ownership -> { items }
 *
 * The map picture is a data URL that can be any size, so the client cuts it into pieces
 * (each under the document limit) and sends them BEFORE the entry, which records how many
 * there are: a briefing that exists in the cloud is therefore always complete.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { rateLimited } from './_rateLimit.js'

const CODE_RE = /^[A-Z0-9]{4,8}(-[A-Z0-9]{4,8}){1,3}$/
const MAX_PAYLOAD_BYTES = 900_000 // Firestore doc limit is 1 MiB
const BRIEFING_ID_RE = /^[A-Za-z0-9-]{1,64}$/
const MAX_MAP_PARTS = 50

// Read-only cross-origin access for eLogbook's duty-log link feature.
const CORS_ORIGINS = ['https://www.claudeborne.my', 'http://localhost:5173']

function getDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars not set')
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }
  return getFirestore()
}

// Saved briefings. `entry` is stored as a JSON string: Firestore refuses arrays inside
// arrays, which briefing data (route points) contains.
async function handleBriefing(req, res, ref) {
  const id = req.query.id ? String(req.query.id) : null
  if (id && !BRIEFING_ID_RE.test(id)) return res.status(400).json({ error: 'bad briefing id' })
  const part = req.query.part === undefined ? null : Number(req.query.part)
  if (part !== null && (!id || !Number.isInteger(part) || part < 0 || part >= MAX_MAP_PARTS)) {
    return res.status(400).json({ error: 'bad map part' })
  }
  const briefings = ref.collection('briefings')
  const partDoc = (n) => briefings.doc(id).collection('parts').doc(String(n))
  const listItems = async () => {
    const list = await briefings.select('name', 'savedAt', 'mapParts', 'row').get()
    return list.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  try {
    if (req.method === 'GET') {
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'no backup found for this code' })
      if (!id) return res.status(200).json({ items: await listItems() })
      if (part !== null) {
        const p = await partDoc(part).get()
        if (!p.exists) return res.status(404).json({ error: 'map piece not found' })
        return res.status(200).json({ data: p.data().data })
      }
      const doc = await briefings.doc(id).get()
      if (!doc.exists) return res.status(404).json({ error: 'briefing not found' })
      return res.status(200).json({ entry: JSON.parse(doc.data().json), mapParts: doc.data().mapParts ?? 0 })
    }

    if (req.method === 'POST') {
      const deviceId = req.body?.deviceId
      if (!deviceId) return res.status(400).json({ error: 'deviceId required' })
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'no backup found for this code' })
      await ref.set({ ...snap.data(), ownerDeviceId: deviceId })
      return res.status(200).json({ items: await listItems() })
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const isPut = req.method === 'PUT'
      const deviceId = isPut ? req.body?.deviceId : req.query.deviceId
      if (!id || !deviceId) return res.status(400).json({ error: 'id and deviceId required' })
      // What is stored, as one string: a piece of the map picture, or the entry as JSON.
      const entry = isPut && part === null ? req.body?.entry : null
      let payload = null
      if (isPut && part !== null) {
        payload = req.body?.data
        if (typeof payload !== 'string') return res.status(400).json({ error: 'data string required' })
      } else if (isPut) {
        if (!entry || entry.id !== id) return res.status(400).json({ error: 'entry with a matching id required' })
        payload = JSON.stringify(entry)
      }
      if (payload !== null && Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
        return res.status(413).json({ error: 'briefing too large' })
      }
      const snap = await ref.get()
      const existingOwner = snap.exists ? snap.data().ownerDeviceId : null
      if (existingOwner && existingOwner !== deviceId) {
        return res.status(403).json({ error: 'this code is owned by another device' })
      }
      if (!isPut) {
        const doc = await briefings.doc(id).get()
        const pieces = doc.exists ? doc.data().mapParts ?? 0 : 0
        for (let n = 0; n < pieces; n++) await partDoc(n).delete()
        await briefings.doc(id).delete()
        return res.status(200).json({ ok: true })
      }
      // Briefings can be the first thing synced to a new code; give it an owner (and no logs yet).
      if (!snap.exists) await ref.set({ logs: [], updatedAt: Date.now(), ownerDeviceId: deviceId })
      if (part !== null) {
        await partDoc(part).set({ data: payload })
      } else {
        const mapParts = Number(req.body.mapParts) || 0
        if (mapParts < 0 || mapParts > MAX_MAP_PARTS) return res.status(400).json({ error: 'bad mapParts' })
        // `row`: the few plain values the VIEW list draws a row from, so the list needs no download.
        const row = req.body.row ?? null
        if (row !== null && (typeof row !== 'object' || Array.isArray(row) || JSON.stringify(row).length > 2000)) {
          return res.status(400).json({ error: 'bad row' })
        }
        await briefings.doc(id).set({ name: String(entry.name ?? ''), savedAt: Number(entry.savedAt) || 0, json: payload, mapParts, row })
      }
      return res.status(200).json({ ok: true })
    }
  } catch (e) {
    return res.status(502).json({ error: String(e) })
  }

  res.setHeader('Allow', 'GET, PUT, POST, DELETE')
  return res.status(405).json({ error: 'method not allowed' })
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  if (CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()

  // A briefing sync sends one request per changed briefing, so it gets a bigger allowance.
  const isBriefing = req.query.kind === 'briefing'
  if (rateLimited(req, res, { limit: isBriefing ? 150 : 20, windowMs: 60_000 })) return

  const code = String(req.query.code || '').toUpperCase()
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ error: 'code must look like XXXX-XXXX-XXXX' })
  }

  let db
  try {
    db = getDb()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  const ref = db.collection('dutylogs').doc(code)

  if (isBriefing) return handleBriefing(req, res, ref)

  if (req.method === 'GET') {
    try {
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'no backup found for this code' })
      return res.status(200).json(snap.data())
    } catch (e) {
      return res.status(502).json({ error: String(e) })
    }
  }

  if (req.method === 'PUT') {
    const logs = req.body?.logs
    const deviceId = req.body?.deviceId
    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs array required' })
    }
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' })
    }
    if (Buffer.byteLength(JSON.stringify(logs)) > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'backup too large' })
    }
    try {
      const snap = await ref.get()
      const existingOwner = snap.exists ? snap.data().ownerDeviceId : null
      if (existingOwner && existingOwner !== deviceId) {
        return res.status(403).json({ error: 'this code is owned by another device' })
      }
      await ref.set({ logs, updatedAt: Date.now(), ownerDeviceId: existingOwner || deviceId })
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(502).json({ error: String(e) })
    }
  }

  if (req.method === 'POST') {
    const deviceId = req.body?.deviceId
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' })
    }
    try {
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'no backup found for this code' })
      const data = snap.data()
      await ref.set({ ...data, ownerDeviceId: deviceId })
      return res.status(200).json({ logs: data.logs ?? [], updatedAt: data.updatedAt })
    } catch (e) {
      return res.status(502).json({ error: String(e) })
    }
  }

  res.setHeader('Allow', 'GET, PUT, POST')
  return res.status(405).json({ error: 'method not allowed' })
}
