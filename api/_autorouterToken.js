/**
 * Shared autorouter.aero login for the serverless functions (notam.js, route.js).
 *
 * autorouter allows only 20 valid tokens per account at once (each lasts an
 * hour) and asks clients to use a token until it stops working (a 401), then
 * log in again, and not to log in while they hold a valid one. So:
 *   - the token is cached per warm instance and kept until a caller reports
 *     it failed (invalidateToken); there is no expiry clock of our own;
 *   - callers that arrive while a login is in progress wait for it;
 *   - after autorouter refuses a login (limit reached, bad credentials) we
 *     answer the same way for a short while instead of retrying every request.
 * Every login and every failed login is logged, so the number of tokens this
 * app takes can be counted from the Vercel logs (no secrets are logged).
 *
 * Required Vercel environment variables:
 *   AUTOROUTER_EMAIL    – your autorouter.aero login email
 *   AUTOROUTER_PASSWORD – your autorouter.aero login password
 */

const OAUTH_URL = 'https://api.autorouter.aero/v1.0/oauth2/token'
const PAUSE_MS = 30_000   // after a refused login, don't ask again for this long

let cachedToken = null
let inflight = null          // the login in progress, if any
let loggedInBefore = false   // tells a first login from a re-login in the log
let refusal = null           // { error, until } while pausing after a refused login

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
      ? 'autorouter login limit reached (too many active tokens) — tokens expire after an hour'
      : `autorouter OAuth failed ${res.status}: ${text.slice(0, 120)}`)
    err.refused = res.status < 500   // a refusal is worth pausing for; a server error is not
    throw err
  }

  const json = await res.json()
  if (!json.access_token) throw new Error('autorouter OAuth returned no access_token')

  console.log(`[autorouter] new token: ${loggedInBefore ? 'after a 401' : 'cold start'}, valid ${json.expires_in ?? '?'}s`)
  loggedInBefore = true
  cachedToken = json.access_token
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

export async function getToken() {
  if (cachedToken) return cachedToken
  if (refusal && Date.now() < refusal.until) throw refusal.error
  inflight ??= login().finally(() => { inflight = null })
  return inflight
}

/**
 * Forget a token autorouter answered 401 to. Only that token: if another
 * request has already replaced it, the new one is kept.
 */
export function invalidateToken(failedToken) {
  if (cachedToken === failedToken) cachedToken = null
}
