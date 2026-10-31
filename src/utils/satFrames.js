// The satellites the Satellite tab can show, and how to find each one's newest image.
// Two free, keyless, browser-readable sources:
//  - NASA GIBS (Himawari, GOES): a frame is not served until about 30 minutes
//    after its time, and the layer list GIBS publishes runs about an hour behind,
//    so the newest frame is found by asking for one (a missing time comes back as a
//    tiny blank picture, see satSnapshot.js).
//  - EUMETSAT EUMETView WMS (Meteosat): asking for a time that does not exist
//    returns the NEAREST image, so the newest time is read from the layer's own
//    small capabilities file instead.
//
// `lon` is the satellite's own longitude (where it hangs over the equator). `box` is the
// region still: [west, south, east, north] degrees.

export const FRAME_STEP_MIN = 10

export const SAT_REGIONS = [
  { id: 'himawari',  label: 'ASIA-PACIFIC',         sat: 'Himawari-9', short: 'HIMAWARI-9', source: 'gibs', layer: 'Himawari_AHI_Band13_Clean_Infrared',  lon: 140.7,  box: [70, -20, 165, 45],   credit: 'NASA GIBS · Himawari-9' },
  { id: 'iodc',      label: 'MIDDLE EAST / INDIA',  sat: 'Meteosat Indian Ocean', short: 'METEOSAT IODC', source: 'eumetsat', layer: 'msg_iodc:ir108', caps: 'msg_iodc/ir108', stepMin: 15, lon: 45.5, box: [20, -10, 95, 45],    credit: '© EUMETSAT · Meteosat' },
  { id: 'mtg',       label: 'EUROPE / AFRICA',      sat: 'Meteosat MTG (0°)',     short: 'METEOSAT MTG',  source: 'eumetsat', layer: 'mtg_fd:ir105_hrfi', caps: 'mtg_fd/ir105_hrfi', stepMin: 10, lon: 0, box: [-25, -15, 45, 62],  credit: '© EUMETSAT · Meteosat' },
  { id: 'goes-east', label: 'AMERICAS',  sat: 'GOES-East',  short: 'GOES-EAST',  source: 'gibs', layer: 'GOES-East_ABI_Band13_Clean_Infrared', lon: -75.2,  box: [-110, -25, -20, 55], credit: 'NASA GIBS · GOES-East' },
  { id: 'goes-west', label: 'E. PACIFIC', sat: 'GOES-West',  short: 'GOES-WEST',  source: 'gibs', layer: 'GOES-West_ABI_Band13_Clean_Infrared', lon: -137,   box: [-170, 0, -100, 55],  credit: 'NASA GIBS · GOES-West' },
]

export const regionStep = r => r.stepMin ?? FRAME_STEP_MIN

const EUM = 'https://view.eumetsat.int/geoserver'

// "2026-10-31T07:40:00Z" — the time format GIBS wants.
export function frameIso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function floorToStep(ms, stepMin = FRAME_STEP_MIN) {
  const step = stepMin * 60000
  return Math.floor(ms / step) * step
}

export function capsUrl(region) {
  return `${EUM}/${region.caps}/wms?service=WMS&version=1.3.0&request=GetCapabilities`
}

// Newest frame time (ms) from a layer's WMS capabilities, or null.
export function latestFromCapabilities(xml) {
  const m = /<Dimension name="time"[^>]*\sdefault="([^"]+)"/.exec(xml)
  const ms = m ? Date.parse(m[1]) : NaN
  return Number.isNaN(ms) ? null : ms
}
