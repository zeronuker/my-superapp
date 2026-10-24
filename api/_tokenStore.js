/**
 * Durable shared store for the autorouter token, so every serverless instance of
 * every function reuses one token instead of logging in again (each login costs
 * one of autorouter's 20 slots for 3 days). Vercel's Runtime Cache was tried and
 * forgot the token within hours, so this uses Firestore, which the Duty Log
 * sync already uses (same FIREBASE_* variables).
 *
 * One document per environment (appSecrets/autorouter-production, ...-preview),
 * so a preview test can never overwrite production's token. The token is
 * encrypted with a key derived from AUTOROUTER_PASSWORD, so it is not readable
 * from the database alone; if the password changes the old token simply cannot
 * be opened and the caller logs in again.
 *
 * Callers must treat every function here as optional: they may throw or be
 * slow, and _autorouterToken.js wraps them with a time limit.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const APP_NAME = 'autorouter-token'   // its own Firebase app, apart from anything else in the function
const COLLECTION = 'appSecrets'
const EXPIRY_MARGIN_MS = 10 * 60 * 1000   // never hand out a token that is about to expire
const SALT = 'claudeborne-autorouter-token'

let keyCache = { password: null, key: null }
const keyOf = (password) => {
  if (keyCache.password !== password) keyCache = { password, key: scryptSync(password, SALT, 32) }
  return keyCache.key
}

export function seal(token, password) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyOf(password), iv)
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

/** The token, or null if the box is damaged or was sealed with another password. */
export function open(box, password) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(password), Buffer.from(box.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// Firebase is heavy to load, so it is only imported, and connected, when first needed.
let dbPromise = null
async function connect() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars not set')
  }
  const app = getApps().find(a => a.name === APP_NAME)
    ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, APP_NAME)
  const db = getFirestore(app)
  try { db.settings({ preferRest: true }) } catch { /* already configured */ }   // REST starts faster than gRPC on a cold function
  return db
}
const getDb = () => (dbPromise ??= connect().catch((e) => { dbPromise = null; throw e }))

async function docRef() {
  return (await getDb()).collection(COLLECTION).doc(`autorouter-${process.env.VERCEL_ENV || 'local'}`)
}

/** The stored token, or null when there is none, it is about to expire, or it cannot be opened. */
export async function readStoredToken() {
  const password = process.env.AUTOROUTER_PASSWORD
  if (!password) return null
  const snap = await (await docRef()).get()
  if (!snap.exists) return null
  const { box, expiresAt } = snap.data()
  if (!(expiresAt > Date.now() + EXPIRY_MARGIN_MS)) return null
  return open(box, password)
}

export async function writeStoredToken(token, expiresInSeconds) {
  const password = process.env.AUTOROUTER_PASSWORD
  if (!password) return
  await (await docRef()).set({ box: seal(token, password), expiresAt: Date.now() + expiresInSeconds * 1000 })
}

/** Remove the stored token, but only if it is the one that failed: a newer one stays. */
export async function deleteStoredToken(failedToken) {
  const password = process.env.AUTOROUTER_PASSWORD
  if (!password) return
  const ref = await docRef()
  const snap = await ref.get()
  if (!snap.exists) return
  if (open(snap.data().box, password) === failedToken) await ref.delete()
}
