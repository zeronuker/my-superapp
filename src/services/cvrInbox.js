// The OFP inbox: XmlOFPs the CVR bookmark (public/cvr-send.js) dropped under this device's sync
// code (/api/dutylog-sync?kind=ofp). They stay until the pilot removes them.

async function call(code, method, id) {
  const params = new URLSearchParams({ code, kind: 'ofp' })
  if (id) params.set('id', id)
  const res = await fetch(`/api/dutylog-sync?${params}`, { method })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `OFP inbox failed (${res.status})`)
  return data
}

export const listInbox = (code) => call(code, 'GET').then(d => d.items)   // [{ id, label, sentAt }]
export const fetchInboxOfp = (code, id) => call(code, 'GET', id).then(d => d.text)
export const removeInboxOfp = (code, id) => call(code, 'DELETE', id)
