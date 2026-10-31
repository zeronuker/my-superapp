// The NOTAM's own wording: its E) item, from the raw text (autorouter sends the
// items on separate lines, SkyLink may send them inline in one string). Falls
// back to the Q-code summary ("Runway", "Taxiway/apron closed") when there is none.
export function notamText(n) {
  const m = /(?:^|[\s(])E\)\s*([\s\S]*?)(?=\s[FG]\)|\s*\)?\s*$)/.exec(n.raw || '')
  const text = m && m[1].replace(/\s+/g, ' ').trim()
  return text || n.summary
}
