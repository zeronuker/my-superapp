// Curated world timezone list. label + country shown in search results.
// icao: optional — used as a search term so pilots can type airport code.
export const TIMEZONES = [
  // ── Americas ────────────────────────────────────────────────────────────
  { label: 'Anchorage',          country: 'US', tz: 'America/Anchorage',                  icao: 'PANC' },
  { label: 'Honolulu',           country: 'US', tz: 'Pacific/Honolulu',                   icao: 'PHNL' },
  { label: 'Los Angeles',        country: 'US', tz: 'America/Los_Angeles',                icao: 'KLAX' },
  { label: 'Vancouver',          country: 'CA', tz: 'America/Vancouver',                  icao: 'CYVR' },
  { label: 'Denver',             country: 'US', tz: 'America/Denver' },
  { label: 'Mexico City',        country: 'MX', tz: 'America/Mexico_City',               icao: 'MMMX' },
  { label: 'Chicago',            country: 'US', tz: 'America/Chicago',                    icao: 'KORD' },
  { label: 'New York',           country: 'US', tz: 'America/New_York',                   icao: 'KJFK' },
  { label: 'Miami',              country: 'US', tz: 'America/New_York',                   icao: 'KMIA' },
  { label: 'Toronto',            country: 'CA', tz: 'America/Toronto',                    icao: 'CYYZ' },
  { label: 'Bogotá',             country: 'CO', tz: 'America/Bogota' },
  { label: 'Lima',               country: 'PE', tz: 'America/Lima' },
  { label: 'São Paulo',          country: 'BR', tz: 'America/Sao_Paulo',                  icao: 'SBGR' },
  { label: 'Buenos Aires',       country: 'AR', tz: 'America/Argentina/Buenos_Aires',     icao: 'SAEZ' },
  { label: 'Santiago',           country: 'CL', tz: 'America/Santiago' },
  // ── Europe ──────────────────────────────────────────────────────────────
  { label: 'Reykjavik',          country: 'IS', tz: 'Atlantic/Reykjavik',                 icao: 'BIRK' },
  { label: 'London',             country: 'GB', tz: 'Europe/London',                      icao: 'EGLL' },
  { label: 'Lisbon',             country: 'PT', tz: 'Europe/Lisbon',                      icao: 'LPPT' },
  { label: 'Madrid',             country: 'ES', tz: 'Europe/Madrid',                      icao: 'LEMD' },
  { label: 'Barcelona',          country: 'ES', tz: 'Europe/Madrid',                      icao: 'LEBL' },
  { label: 'Paris',              country: 'FR', tz: 'Europe/Paris',                       icao: 'LFPG' },
  { label: 'Amsterdam',          country: 'NL', tz: 'Europe/Amsterdam',                   icao: 'EHAM' },
  { label: 'Frankfurt',          country: 'DE', tz: 'Europe/Berlin',                      icao: 'EDDF' },
  { label: 'Zurich',             country: 'CH', tz: 'Europe/Zurich',                      icao: 'LSZH' },
  { label: 'Rome',               country: 'IT', tz: 'Europe/Rome',                        icao: 'LIRF' },
  { label: 'Vienna',             country: 'AT', tz: 'Europe/Vienna',                      icao: 'LOWW' },
  { label: 'Copenhagen',         country: 'DK', tz: 'Europe/Copenhagen',                  icao: 'EKCH' },
  { label: 'Stockholm',          country: 'SE', tz: 'Europe/Stockholm',                   icao: 'ESSA' },
  { label: 'Oslo',               country: 'NO', tz: 'Europe/Oslo',                        icao: 'ENGM' },
  { label: 'Helsinki',           country: 'FI', tz: 'Europe/Helsinki',                    icao: 'EFHK' },
  { label: 'Warsaw',             country: 'PL', tz: 'Europe/Warsaw',                      icao: 'EPWA' },
  { label: 'Prague',             country: 'CZ', tz: 'Europe/Prague',                      icao: 'LKPR' },
  { label: 'Budapest',           country: 'HU', tz: 'Europe/Budapest',                    icao: 'LHBP' },
  { label: 'Athens',             country: 'GR', tz: 'Europe/Athens',                      icao: 'LGAV' },
  { label: 'Istanbul',           country: 'TR', tz: 'Europe/Istanbul',                    icao: 'LTFM' },
  { label: 'Moscow',             country: 'RU', tz: 'Europe/Moscow',                      icao: 'UUEE' },
  // ── Africa ──────────────────────────────────────────────────────────────
  { label: 'Casablanca',         country: 'MA', tz: 'Africa/Casablanca',                  icao: 'GMMN' },
  { label: 'Cairo',              country: 'EG', tz: 'Africa/Cairo',                       icao: 'HECA' },
  { label: 'Lagos',              country: 'NG', tz: 'Africa/Lagos',                       icao: 'DNMM' },
  { label: 'Addis Ababa',        country: 'ET', tz: 'Africa/Addis_Ababa',                 icao: 'HAAB' },
  { label: 'Nairobi',            country: 'KE', tz: 'Africa/Nairobi',                     icao: 'HKJK' },
  { label: 'Johannesburg',       country: 'ZA', tz: 'Africa/Johannesburg',                icao: 'FAOR' },
  { label: 'Cape Town',          country: 'ZA', tz: 'Africa/Johannesburg',                icao: 'FACT' },
  // ── Middle East ─────────────────────────────────────────────────────────
  { label: 'Tel Aviv',           country: 'IL', tz: 'Asia/Jerusalem',                     icao: 'LLBG' },
  { label: 'Amman',              country: 'JO', tz: 'Asia/Amman',                         icao: 'OJAI' },
  { label: 'Riyadh',             country: 'SA', tz: 'Asia/Riyadh',                        icao: 'OERK' },
  { label: 'Kuwait City',        country: 'KW', tz: 'Asia/Kuwait',                        icao: 'OKBK' },
  { label: 'Bahrain',            country: 'BH', tz: 'Asia/Bahrain',                       icao: 'OBBI' },
  { label: 'Doha',               country: 'QA', tz: 'Asia/Qatar',                         icao: 'OTHH' },
  { label: 'Dubai',              country: 'AE', tz: 'Asia/Dubai',                         icao: 'OMDB' },
  { label: 'Abu Dhabi',          country: 'AE', tz: 'Asia/Dubai',                         icao: 'OMAA' },
  { label: 'Muscat',             country: 'OM', tz: 'Asia/Muscat',                        icao: 'OOMS' },
  { label: 'Tehran',             country: 'IR', tz: 'Asia/Tehran',                        icao: 'OIIE' },
  // ── South / Central Asia ────────────────────────────────────────────────
  { label: 'Kabul',              country: 'AF', tz: 'Asia/Kabul',                         icao: 'OAKB' },
  { label: 'Karachi',            country: 'PK', tz: 'Asia/Karachi',                       icao: 'OPKC' },
  { label: 'Lahore',             country: 'PK', tz: 'Asia/Karachi',                       icao: 'OPLA' },
  { label: 'Delhi',              country: 'IN', tz: 'Asia/Kolkata',                       icao: 'VIDP' },
  { label: 'Mumbai',             country: 'IN', tz: 'Asia/Kolkata',                       icao: 'VABB' },
  { label: 'Kathmandu',          country: 'NP', tz: 'Asia/Kathmandu' },
  { label: 'Dhaka',              country: 'BD', tz: 'Asia/Dhaka',                         icao: 'VGHS' },
  { label: 'Colombo',            country: 'LK', tz: 'Asia/Colombo',                       icao: 'VCBI' },
  { label: 'Almaty',             country: 'KZ', tz: 'Asia/Almaty' },
  // ── Southeast Asia ──────────────────────────────────────────────────────
  { label: 'Yangon',             country: 'MM', tz: 'Asia/Yangon',                        icao: 'VYYY' },
  { label: 'Bangkok',            country: 'TH', tz: 'Asia/Bangkok',                       icao: 'VTBS' },
  { label: 'Phnom Penh',         country: 'KH', tz: 'Asia/Phnom_Penh' },
  { label: 'Hanoi',              country: 'VN', tz: 'Asia/Ho_Chi_Minh',                   icao: 'VVNB' },
  { label: 'Ho Chi Minh City',   country: 'VN', tz: 'Asia/Ho_Chi_Minh',                   icao: 'VVTS' },
  { label: 'Kuala Lumpur',       country: 'MY', tz: 'Asia/Kuala_Lumpur',                  icao: 'WMKK' },
  { label: 'Kota Kinabalu',      country: 'MY', tz: 'Asia/Kuala_Lumpur',                  icao: 'WBKK' },
  { label: 'Singapore',          country: 'SG', tz: 'Asia/Singapore',                     icao: 'WSSS' },
  { label: 'Jakarta',            country: 'ID', tz: 'Asia/Jakarta',                       icao: 'WIII' },
  { label: 'Bali',               country: 'ID', tz: 'Asia/Makassar',                      icao: 'WADD' },
  { label: 'Manila',             country: 'PH', tz: 'Asia/Manila',                        icao: 'RPLL' },
  // ── East Asia ───────────────────────────────────────────────────────────
  { label: 'Beijing',            country: 'CN', tz: 'Asia/Shanghai',                      icao: 'ZBAA' },
  { label: 'Shanghai',           country: 'CN', tz: 'Asia/Shanghai',                      icao: 'ZSPD' },
  { label: 'Guangzhou',          country: 'CN', tz: 'Asia/Shanghai',                      icao: 'ZGGG' },
  { label: 'Chengdu',            country: 'CN', tz: 'Asia/Shanghai',                      icao: 'ZUUU' },
  { label: 'Hong Kong',          country: 'HK', tz: 'Asia/Hong_Kong',                     icao: 'VHHH' },
  { label: 'Taipei',             country: 'TW', tz: 'Asia/Taipei',                        icao: 'RCTP' },
  { label: 'Seoul',              country: 'KR', tz: 'Asia/Seoul',                         icao: 'RKSI' },
  { label: 'Tokyo',              country: 'JP', tz: 'Asia/Tokyo',                         icao: 'RJTT' },
  { label: 'Osaka',              country: 'JP', tz: 'Asia/Tokyo',                         icao: 'RJBB' },
  { label: 'Ulaanbaatar',        country: 'MN', tz: 'Asia/Ulaanbaatar' },
  // ── Pacific / Oceania ───────────────────────────────────────────────────
  { label: 'Guam',               country: 'GU', tz: 'Pacific/Guam',                       icao: 'PGUM' },
  { label: 'Darwin',             country: 'AU', tz: 'Australia/Darwin',                   icao: 'YPDN' },
  { label: 'Perth',              country: 'AU', tz: 'Australia/Perth',                    icao: 'YPPH' },
  { label: 'Brisbane',           country: 'AU', tz: 'Australia/Brisbane',                 icao: 'YBBN' },
  { label: 'Adelaide',           country: 'AU', tz: 'Australia/Adelaide',                 icao: 'YPAD' },
  { label: 'Sydney',             country: 'AU', tz: 'Australia/Sydney',                   icao: 'YSSY' },
  { label: 'Melbourne',          country: 'AU', tz: 'Australia/Melbourne',                icao: 'YMML' },
  { label: 'Nadi',               country: 'FJ', tz: 'Pacific/Fiji',                       icao: 'NFFN' },
  { label: 'Nouméa',             country: 'NC', tz: 'Pacific/Noumea',                     icao: 'NWWW' },
  { label: 'Auckland',           country: 'NZ', tz: 'Pacific/Auckland',                   icao: 'NZAA' },
]

export function searchZones(query) {
  const q = query.trim().toUpperCase()
  if (!q) return []
  return TIMEZONES.filter(z =>
    z.label.toUpperCase().includes(q) ||
    z.country.toUpperCase() === q ||
    (z.icao && z.icao.startsWith(q)) ||
    z.tz.toUpperCase().includes(q.replace(' ', '_'))
  ).slice(0, 8)
}
