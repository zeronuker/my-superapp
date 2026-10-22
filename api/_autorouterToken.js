/**
 * Shared autorouter.aero login for the serverless functions (notam.js, route.js).
 *
 * autorouter allows only 20 valid tokens per account at once (each lasts an
 * hour) and asks clients not to log in again while they hold a valid one. So:
 * the token is cached per warm instance, and callers that arrive while a login
 * is already in progress wait for it instead of each starting their own.
 *
 * Required Vercel environment variables:
 *   AUTOROUTER_EMAIL    – your autorouter.aero login email
 *   AUTOROUTER_PASSWORD – your autorouter.aero login password
 */

const OAUTH_URL = 'https://api.autorouter.aero/v1.0/oauth2/token'

let cachedToken = null
let tokenExpiresAt = 0   // Unix ms
let inflight = null      // the login in progress, if any

async function login() {
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
    if (/toomanytokens/i.test(text)) {
      throw new Error('autorouter login limit reached (too many active tokens) — tokens expire after an hour')
    }
    throw new Error(`autorouter OAuth failed ${res.status}: ${text.slice(0, 120)}`)
  }

  const json = await res.json()
  if (!json.access_token) throw new Error('autorouter OAuth returned no access_token')

  cachedToken = json.access_token
  tokenExpiresAt = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000   // refresh 60 s early
  return cachedToken
}

export async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken
  inflight ??= login().finally(() => { inflight = null })
  return inflight
}

/** Forget the cached token, e.g. after autorouter answered 401. */
export function invalidateToken() {
  cachedToken = null
  tokenExpiresAt = 0
}
