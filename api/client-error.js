import { rateLimited } from './_rateLimit.js'

// Receives crash reports from ErrorBoundary so tab crashes on real users'
// devices are visible in Vercel's function logs instead of vanishing into
// their console. No storage — console.error is enough, Vercel captures it.
// It also takes the browser's own Content-Security-Policy violation reports (vercel.json's
// report-only policy points here), so a policy can be tuned from the logs before it is enforced.
export default async function handler(req, res) {
  if (rateLimited(req, res, { limit: 20, windowMs: 60_000 })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  if (/csp-report|reports\+json/i.test(String(req.headers['content-type'] || ''))) {
    const b = req.body
    const raw = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : JSON.stringify(b ?? null)
    console.error('[csp-report]', raw.slice(0, 1500))
    return res.status(204).end()
  }

  const { tab, message, stack, componentStack, url } = req.body || {}
  console.error('[client-error]', JSON.stringify({
    tab: String(tab || '').slice(0, 100),
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').slice(0, 2000),
    componentStack: String(componentStack || '').slice(0, 2000),
    url: String(url || '').slice(0, 300),
    ts: new Date().toISOString(),
  }))
  res.status(204).end()
}
