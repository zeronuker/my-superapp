// Anonymous backup/restore for duty logs via /api/dutylog-sync (Firestore-backed).
// The sync code is the only credential — no accounts involved.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L — avoids visual ambiguity

// Matches the XXXX-XXXX-XXXX shape generateSyncCode() produces — used to tell
// a genuine scanned sync code apart from an unrelated QR code's contents.
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`)

export function generateSyncCode() {
  const groups = []
  for (let g = 0; g < 3; g++) {
    let group = ''
    for (let i = 0; i < 4; i++) {
      group += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    groups.push(group)
  }
  return groups.join('-')
}

export async function pushLogs(code, logs, deviceId) {
  const res = await fetch(`/api/dutylog-sync?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs, deviceId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `sync failed (${res.status})`)
    err.status = res.status
    throw err
  }
}

// Read-only — no ownership check, no side effects on either device.
export async function viewLogs(code) {
  const res = await fetch(`/api/dutylog-sync?code=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `view failed (${res.status})`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.logs ?? []
}

// Force-claims ownership of the code for this device, then returns its logs.
export async function claimAndRestore(code, deviceId) {
  const res = await fetch(`/api/dutylog-sync?code=${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `restore failed (${res.status})`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.logs ?? []
}
