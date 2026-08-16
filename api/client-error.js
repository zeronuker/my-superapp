import { rateLimited } from './_rateLimit.js'

// Receives crash reports from ErrorBoundary so tab crashes on real users'
// devices are visible in Vercel's function logs instead of vanishing into
// their console. No storage — console.error is enough, Vercel captures it.
export default async function handler(req, res) {
  if (rateLimited(req, res, { limit: 20, windowMs: 60_000 })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

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
