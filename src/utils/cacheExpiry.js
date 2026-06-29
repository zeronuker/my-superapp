import { useEffect, useRef } from 'react'

const EXPIRY_MS = 12 * 60 * 60 * 1000  // 12 hours

// Returns null (and clears storage) if the cached data is older than 12 h.
export function loadWithExpiry(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.fetchedAt && Date.now() - data.fetchedAt > EXPIRY_MS) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch (_) { return null }
}

// Calls onExpire when fetchedAt crosses the 12-hour mark — both immediately
// on mount (if already past) and via a timer while the app stays open.
export function useExpiry(fetchedAt, onExpire) {
  const cbRef = useRef(onExpire)
  useEffect(() => { cbRef.current = onExpire })

  useEffect(() => {
    if (!fetchedAt) return
    const remaining = fetchedAt + EXPIRY_MS - Date.now()
    if (remaining <= 0) { cbRef.current(); return }
    const t = setTimeout(() => cbRef.current(), remaining)
    return () => clearTimeout(t)
  }, [fetchedAt])
}
