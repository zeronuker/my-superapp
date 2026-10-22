import { CalculationParameters, CalculationMethod } from 'adhan'

// Calculation methods, keyed by Aladhan's method id (api.aladhan.com/v1/methods).
// With the setting on Auto, Aladhan picks the id from the location and reports it
// back; `params` is the same rule for the offline calculation.
// Angles: fajr, isha. [fajr, isha, minutes after Maghrib for Isha, maghrib minutes added]
const angles = (name, fajr, isha, ishaInterval = 0, maghribMin = 0) => ({
  name,
  params: () => {
    const p = new CalculationParameters('Other', fajr, isha, ishaInterval)
    p.adjustments.maghrib = maghribMin
    return p
  },
})

export const METHODS = {
  0:  { name: 'Jafari (Shia)',         params: () => { const p = new CalculationParameters('Other', 16, 14); p.maghribAngle = 4; return p } },
  1:  angles('Karachi', 18, 18),
  2:  angles('ISNA (North America)', 15, 15),
  3:  angles('Muslim World League', 18, 17),
  4:  angles('Umm Al-Qura (Makkah)', 18.5, 0, 90),
  5:  angles('Egyptian General Authority', 19.5, 17.5),
  7:  { name: 'Tehran',                params: () => CalculationMethod.Tehran() },
  8:  angles('Gulf Region', 19.5, 0, 90),
  9:  angles('Kuwait', 18, 17.5),
  10: angles('Qatar', 18, 0, 90),
  11: angles('MUIS (Singapore)', 20, 18),
  12: angles('UOIF (France)', 12, 12),
  13: angles('Diyanet (Turkey)', 18, 17),
  14: angles('Russia (SAMR)', 16, 15),
  15: { name: 'Moonsighting Committee', params: () => CalculationMethod.MoonsightingCommittee() },
  16: angles('Dubai', 18.2, 18.2),
  17: angles('JAKIM (Malaysia)', 20, 18),
  18: angles('Tunisia', 18, 18),
  19: angles('Algeria', 18, 17),
  20: angles('Kemenag (Indonesia)', 20, 18),
  21: angles('Morocco', 19, 17),
  22: angles('Lisbon (Portugal)', 18, 0, 77, 3),
  23: angles('Jordan', 18, 18, 0, 5),
}

// The manual choices in Settings → Aladhan id.
export const METHOD_ID = { jakim: 17, moonsighting: 15, mwl: 3, isna: 2, egyptian: 5, uaq: 4 }

// What Auto falls back to when the location's own method isn't known yet
// (offline at a place never loaded online) — Aladhan's default for places
// with no specific authority.
export const FALLBACK_METHOD_ID = 3

// Settings value ('auto' | 'jakim' | …) or an id → the id to calculate with.
// `autoId` is what Auto resolved to for the current location, if known.
export function resolveMethodId(method, autoId) {
  if (method === 'auto') return METHODS[autoId] ? autoId : FALLBACK_METHOD_ID
  if (typeof method === 'number') return METHODS[method] ? method : FALLBACK_METHOD_ID
  return METHOD_ID[method] ?? FALLBACK_METHOD_ID
}

export const methodName = (id) => (METHODS[id] ?? METHODS[FALLBACK_METHOD_ID]).name
