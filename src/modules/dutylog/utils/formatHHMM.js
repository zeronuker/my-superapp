// Formats a raw digit string (or an already-formatted one) as HH:MM,
// e.g. "1234" -> "12:34". Used both to format input as a pilot types and to
// display older entries that were saved before this formatting existed.
export function formatHHMM(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
}
