// Shared with METARTAFCalculator for wind heading display.

export function fmtTrack(deg) { return `${String(Math.round(deg)).padStart(3, '0')}°` }
