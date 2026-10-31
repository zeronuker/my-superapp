// Tap-hit testing on a saved map picture. The picture is a flat image, so a
// SIGMET zone is found by projecting its coordinates into the picture with the
// map view recorded at save time: view = { lng, lat, zoom, w, h } (centre,
// MapLibre zoom, and the map's size in CSS pixels). The map was never rotated
// or tilted. Positions are fractions of the picture (0..1), so the picture can
// be shown at any size.

const worldPx = (zoom) => 512 * 2 ** zoom
const mercY = (lat) => {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

// [lng, lat] → { x, y } as fractions of the picture.
export function projectToPicture(view, lng, lat) {
  const W = worldPx(view.zoom)
  let dx = ((lng - view.lng) / 360) * W
  if (dx > W / 2) dx -= W       // zone ring on the other side of the date line
  if (dx < -W / 2) dx += W
  const dy = (mercY(lat) - mercY(view.lat)) * W
  return { x: (view.w / 2 + dx) / view.w, y: (view.h / 2 + dy) / view.h }
}

function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Features (as sigmetsToGeoJSON returns them) under the tap at fraction (fx, fy).
export function featuresAt(view, features, fx, fy) {
  return features.filter(f =>
    f.geometry.coordinates.some(ring =>
      inRing(fx, fy, ring.map(([lng, lat]) => { const p = projectToPicture(view, lng, lat); return [p.x, p.y] }))))
}

// A tap at (cx, cy) inside a box of bw × bh showing an image of ratio iw:ih
// with object-fit: contain → the tap as a fraction of the image, or null when
// it falls in the empty margin.
export function tapOnContainedImage(cx, cy, bw, bh, iw, ih) {
  const scale = Math.min(bw / iw, bh / ih)
  const w = iw * scale, h = ih * scale
  const fx = (cx - (bw - w) / 2) / w, fy = (cy - (bh - h) / 2) / h
  return fx < 0 || fx > 1 || fy < 0 || fy > 1 ? null : { fx, fy }
}
