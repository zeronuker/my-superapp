// Uses adhan's built-in Qibla function (great-circle bearing to Mecca)
import { Qibla, Coordinates } from 'adhan'

/**
 * Returns bearing in degrees (0–360) from the given coordinates toward Mecca.
 */
export function qiblaBearing(lat, lng) {
  const coords = new Coordinates(lat, lng)
  return Qibla(coords)
}
