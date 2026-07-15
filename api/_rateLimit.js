/**
 * Minimal in-memory per-IP rate limiter for the serverless API routes, which
 * proxy to paid/metered upstream APIs (RapidAPI, autorouter.aero) and would
 * otherwise let anyone who finds the URL run up usage with no limit.
 *
 * Each warm Lambda instance tracks its own counts (resets on cold start, not
 * shared across instances), so this isn't a hard global cap — but it stops a
 * single client/script from hammering an endpoint, without needing an
 * external store like Vercel KV.
 */
const buckets = new Map() // ip -> { count, resetAt }

export function rateLimited(req, res, { limit = 60, windowMs = 60_000 } = {}) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  const now = Date.now()

  // Bound memory: drop expired entries once the map gets large.
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key)
    }
  }

  const bucket = buckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }

  bucket.count++
  if (bucket.count > limit) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
    res.status(429).json({ error: 'Too many requests — slow down and try again shortly' })
    return true
  }
  return false
}
