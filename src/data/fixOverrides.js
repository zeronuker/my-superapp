// Fixes the route lookup (autorouter) does not know but pilots use, filled in by
// hand so the drawn route passes through them. Format:  IDENT: [lat, lon]
// in decimal degrees (south and west are negative).
//
// To add one: read its position from FDPro or eWAS (they show lat/lon for a
// waypoint) and add a line below. An override is only used when autorouter
// does NOT know the fix; it never replaces autorouter's own position.
export const FIX_OVERRIDES = {
  // GORVU: [lat, lon],
  // BOGUK: [lat, lon],
  // OPOSA: [lat, lon],
}
