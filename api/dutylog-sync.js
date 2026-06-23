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
 * GET  /api/dutylog-sync?code=XXXX-XXXX-XXXX   -> { logs, updatedAt }
 * PUT  /api/dutylog-sync?code=XXXX-XXXX-XXXX   body: { logs: [...] }
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const CODE_RE = /^[A-Z0-9]{4,8}(-[A-Z0-9]{4,8}){1,3}$/
const MAX_PAYLOAD_BYTES = 900_000 // Firestore doc limit is 1 MiB

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

export default async function handler(req, res) {
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
    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs array required' })
    }
    if (Buffer.byteLength(JSON.stringify(logs)) > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'backup too large' })
    }
    try {
      await ref.set({ logs, updatedAt: Date.now() })
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(502).json({ error: String(e) })
    }
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).json({ error: 'method not allowed' })
}
