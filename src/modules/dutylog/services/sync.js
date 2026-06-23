// Anonymous backup/restore for duty logs via /api/dutylog-sync (Firestore-backed).
// The sync code is the only credential — no accounts involved.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L — avoids visual ambiguity

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

export async function pushLogs(code, logs) {
  const res = await fetch(`/api/dutylog-sync?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `sync failed (${res.status})`)
  }
}

export async function pullLogs(code) {
  const res = await fetch(`/api/dutylog-sync?code=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `restore failed (${res.status})`)
  }
  const data = await res.json()
  return data.logs ?? []
}
