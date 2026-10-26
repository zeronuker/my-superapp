// Pure helpers for the Flight Details tab (no React/DOM — vitest runs in node).

/** Share of a limit used, in percent to one decimal: 60700, 61000 -> 99.5. null when either is missing. */
export const pctOfLimit = (kg, max) => (Number.isFinite(kg) && Number.isFinite(max) && max > 0 ? Math.round((kg / max) * 1000) / 10 : null)

/** Weight bar colour by share of the operational limit: up to 70% green, to 80% amber, above that red. */
export function weightLevel(pct) {
  if (pct == null) return null
  return pct <= 70 ? 'green' : pct <= 80 ? 'amber' : 'red'
}

/** The fuel parts that make up the block fuel, in the order the bar and the legend draw them. */
export function fuelParts(fuel) {
  const parts = [
    { key: 'trip', label: 'Trip', ...fuel.trip },
    { key: 'contingency', label: 'Contingency', ...fuel.contingency },
    { key: 'alternate', label: `Alternate ${fuel.alternate.icao ?? ''}`.trim(), ...fuel.alternate },
    { key: 'finalReserve', label: 'Final reserve', ...fuel.finalReserve },
    fuel.tankering && { key: 'tankering', label: 'Eco tankering', ...fuel.tankering },
    fuel.extra && { key: 'extra', label: 'Extra', ...fuel.extra },
    { key: 'taxi', label: 'Taxi', ...fuel.taxi },
  ]
  return parts.filter(Boolean)
}

/** Signed wind component for display: 29 -> '+29', -26 -> '−26'. */
export const fmtWc = wc => (wc == null ? null : wc < 0 ? `−${-wc}` : `+${wc}`)
