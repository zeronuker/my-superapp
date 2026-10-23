/**
 * Shared autorouter.aero login for the serverless functions (notam.js, route.js).
 *
 * autorouter allows only 20 valid tokens per account at once. Their docs say a
 * token lasts an hour, but the live reply says 259200 s (3 days), so every
 * login costs a slot for days. They ask clients to use a token until it stops
 * working (a 401), then log in again, and not to log in while holding a valid
 * one. So:
 *   - the token is cached per warm instance and kept until a caller reports it
 *     failed (invalidateToken); there is no expiry clock of our own;
 *   - it is also kept in Vercel's Runtime Cache, which every instance of every
 *     function in the region can read, so a fresh instance (a cold start, or
 *     the other function) reuses it instead of taking another slot;
 *   - callers that arrive while a login is in progress wait for it;
 *   - after autorouter refuses a login (limit reached, bad credentials) we
 *     answer the same way for a short while instead of retrying every request.
 * The shared cache is only a bonus: if it is missing, slow or failing, we log
 * in exactly as before. Every login and failure is logged, so the number of
 * tokens this app takes can be counted from the Vercel logs (no secrets).
 *
 * Required Vercel environment variables:
 *   AUTOROUTER_EMAIL    – your autorouter.aero login email
 *   AUTOROUTER_PASSWORD – your autorouter.aero login password
 */

import { getCache } from '@vercel/functions'

const OAUTH_URL = 'https://api.autorouter.aero/v1.0/oauth2/token'
const PAUSE_MS = 30_000          // after a refused login, don't ask again for this long
const CACHE_KEY = 'token'
const CACHE_TIMEOUT_MS = 2_000   // a slow shared cache must never hold up a request

let cachedToken = null
let inflight = null          // the token lookup/login in progress, if any
let loggedInBefore = false   // tells a first login from a re-login in the log
let refusal = null           // { error, until } while pausing after a refused login
let rejected = null          // the last token autorouter refused: ignored even if the shared cache still holds it

// Runs one shared-cache operation. Any problem is logged and turned into null,
// never thrown, so the cache can only ever make things better.
async function sharedCall(what, call) {
  let timer
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), CACHE_TIMEOUT_MS) })
    return await Promise.race([call(getCache({ namespace: 'autorouter' })), timeout])   // own namespace: on Hobby the cache is shared by all projects
  } catch (e) {
    console.warn(`[autorouter] shared cache ${what} failed: ${e.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function requestToken() {
  const email = process.env.AUTOROUTER_EMAIL
  const password = process.env.AUTOROUTER_PASSWORD
  if (!email || !password) {
    throw new Error('AUTOROUTER_EMAIL / AUTOROUTER_PASSWORD env vars not set')
  }

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: email,
      client_secret: password,
    }).toString(),
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(/toomanytokens/i.test(text)
      ? 'autorouter login limit reached (too many active tokens) — each token lasts about 3 days'
      : `autorouter OAuth failed ${res.status}: ${text.slice(0, 120)}`)
    err.refused = res.status < 500   // a refusal is worth pausing for; a server error is not
    throw err
  }

  const json = await res.json()
  if (!json.access_token) throw new Error('autorouter OAuth returned no access_token')

  console.log(`[autorouter] new token: ${loggedInBefore ? 'after a 401' : 'cold start'}, valid ${json.expires_in ?? '?'}s`)
  loggedInBefore = true
  cachedToken = json.access_token
  // Shared for just under its lifetime; if it is ever wrong, the 401 path replaces it.
  await sharedCall('write', c => c.set(CACHE_KEY, cachedToken, { ttl: Math.max(60, (json.expires_in ?? 3600) - 600) }))
  return cachedToken
}

async function login() {
  try {
    const token = await requestToken()
    refusal = null
    return token
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    console.warn(`[autorouter] login failed: ${timedOut ? 'timed out (a token may have been issued but lost)' : e.message}`)
    if (e.refused) refusal = { error: e, until: Date.now() + PAUSE_MS }
    throw e
  }
}

async function obtainToken() {
  const stored = await sharedCall('read', c => c.get(CACHE_KEY))
  if (typeof stored === 'string' && stored && stored !== rejected) {
    console.log('[autorouter] token from shared cache')
    loggedInBefore = true
    cachedToken = stored
    return stored
  }
  if (refusal && Date.now() < refusal.until) throw refusal.error
  return login()
}

export async function getToken() {
  if (cachedToken) return cachedToken
  inflight ??= obtainToken().finally(() => { inflight = null })
  return inflight
}

/**
 * Forget a token autorouter answered 401 to, here and in the shared cache. Only
 * that token: if another request or instance has already replaced it, the new
 * one is kept. Await this before calling getToken() again.
 */
export async function invalidateToken(failedToken) {
  rejected = failedToken
  if (cachedToken === failedToken) cachedToken = null
  const stored = await sharedCall('read', c => c.get(CACHE_KEY))
  if (stored === failedToken) await sharedCall('delete', c => c.delete(CACHE_KEY))
}
