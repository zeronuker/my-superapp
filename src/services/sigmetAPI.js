// SIGMET fetch — extracted from SigmetViewer.jsx so BriefingView can fetch
// the same global feed the same way, without duplicating the request.

import { normalizeSigmet } from '../utils/sigmet'

export async function fetchAllSigmets(signal) {
  const res = await fetch('/api/isigmet', { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  // A reply that is not a list is a failure, not "no SIGMETs": let it throw.
  const raw = await res.json()
  if (!Array.isArray(raw)) throw new Error('unexpected SIGMET reply')
  return raw.map(normalizeSigmet)
}
