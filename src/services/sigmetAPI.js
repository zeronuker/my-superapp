// SIGMET fetch — extracted from SigmetViewer.jsx so BriefingView can fetch
// the same global feed the same way, without duplicating the request.

import { normalizeSigmet } from '../utils/sigmet'

export async function fetchAllSigmets(signal) {
  const res = await fetch('/api/isigmet', { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  const raw = await res.json().catch(() => [])
  return Array.isArray(raw) ? raw.map(normalizeSigmet) : []
}
