/**
 * Curated ICAO airport database.
 * Covers major commercial airports worldwide with focus on
 * Malaysian, Middle East, Southeast Asian, and key global routes.
 * Format: ICAO → { name, city, country, lat, lng }
 */
const AIRPORTS = {
  // ── Malaysia ────────────────────────────────────────────────────────────────
  WMKK: { name: 'Kuala Lumpur Intl (KLIA)',    city: 'Kuala Lumpur', country: 'Malaysia',     lat:  2.7456,  lng: 101.7099 },
  WMKC: { name: 'Sultan Ismail Petra',          city: 'Kota Bharu',   country: 'Malaysia',     lat:  6.1669,  lng: 102.2932 },
  WMKD: { name: 'Sultan Ahmad Shah',            city: 'Kuantan',      country: 'Malaysia',     lat:  3.7754,  lng: 103.2090 },
  WMKJ: { name: 'Senai Intl',                   city: 'Johor Bahru',  country: 'Malaysia',     lat:  1.6413,  lng: 103.6698 },
  WMKA: { name: 'Sultan Abdul Halim',           city: 'Alor Setar',   country: 'Malaysia',     lat:  6.1896,  lng: 100.3980 },
  WMKL: { name: 'Langkawi Intl',                city: 'Langkawi',     country: 'Malaysia',     lat:  6.3297,  lng:  99.7286 },
  WMKP: { name: 'Penang Intl',                  city: 'Penang',       country: 'Malaysia',     lat:  5.2972,  lng: 100.2769 },
  WMKN: { name: 'Sultan Mahmud',                city: 'Kuala Terengganu', country: 'Malaysia', lat:  5.3826,  lng: 103.1033 },
  WBKK: { name: 'Kota Kinabalu Intl',           city: 'Kota Kinabalu', country: 'Malaysia',    lat:  5.9372,  lng: 116.0514 },
  WBKS: { name: 'Sandakan',                     city: 'Sandakan',     country: 'Malaysia',     lat:  5.9009,  lng: 118.0599 },
  WBKU: { name: 'Lahad Datu',                   city: 'Lahad Datu',   country: 'Malaysia',     lat:  5.0323,  lng: 118.3240 },
  WBKW: { name: 'Tawau',                        city: 'Tawau',        country: 'Malaysia',     lat:  4.3158,  lng: 118.1228 },
  WBGG: { name: 'Kuching Intl',                 city: 'Kuching',      country: 'Malaysia',     lat:  1.4847,  lng: 110.3469 },
  WBGR: { name: 'Miri',                         city: 'Miri',         country: 'Malaysia',     lat:  4.3222,  lng: 113.9869 },
  WBGS: { name: 'Sibu',                         city: 'Sibu',         country: 'Malaysia',     lat:  2.2616,  lng: 111.9853 },

  // ── Singapore ────────────────────────────────────────────────────────────────
  WSSS: { name: 'Singapore Changi',             city: 'Singapore',    country: 'Singapore',    lat:  1.3644,  lng: 103.9915 },

  // ── Indonesia ───────────────────────────────────────────────────────────────
  WIII: { name: 'Soekarno-Hatta Intl',          city: 'Jakarta',      country: 'Indonesia',    lat: -6.1256,  lng: 106.6559 },
  WADD: { name: 'Ngurah Rai Intl (Bali)',        city: 'Denpasar',     country: 'Indonesia',    lat: -8.7482,  lng: 115.1672 },
  WBSB: { name: 'Brunei Intl',                  city: 'Bandar Seri Begawan', country: 'Brunei', lat: 4.9442,  lng: 114.9283 },

  // ── Thailand ─────────────────────────────────────────────────────────────────
  VTBS: { name: 'Suvarnabhumi Intl',            city: 'Bangkok',      country: 'Thailand',     lat: 13.6811,  lng: 100.7475 },
  VTBD: { name: 'Don Mueang Intl',              city: 'Bangkok',      country: 'Thailand',     lat: 13.9126,  lng: 100.6067 },
  VTCC: { name: 'Chiang Mai Intl',              city: 'Chiang Mai',   country: 'Thailand',     lat: 18.7668,  lng:  98.9628 },
  VTSB: { name: 'Hat Yai Intl',                 city: 'Hat Yai',      country: 'Thailand',     lat:  6.9332,  lng: 100.3930 },

  // ── Philippines ──────────────────────────────────────────────────────────────
  RPLL: { name: 'Ninoy Aquino Intl',            city: 'Manila',       country: 'Philippines',  lat: 14.5086,  lng: 121.0197 },

  // ── Vietnam ──────────────────────────────────────────────────────────────────
  VVTS: { name: 'Tan Son Nhat Intl',            city: 'Ho Chi Minh City', country: 'Vietnam',  lat: 10.8188,  lng: 106.6520 },
  VVNB: { name: 'Noi Bai Intl',                 city: 'Hanoi',        country: 'Vietnam',      lat: 21.2212,  lng: 105.8072 },

  // ── Cambodia / Myanmar ────────────────────────────────────────────────────────
  VDPP: { name: 'Phnom Penh Intl',              city: 'Phnom Penh',   country: 'Cambodia',     lat: 11.5466,  lng: 104.8442 },
  VYYY: { name: 'Yangon Intl',                  city: 'Yangon',       country: 'Myanmar',      lat: 16.9073,  lng:  96.1332 },

  // ── Middle East ──────────────────────────────────────────────────────────────
  OMDB: { name: 'Dubai Intl',                   city: 'Dubai',        country: 'UAE',          lat: 25.2528,  lng:  55.3644 },
  OMDW: { name: 'Al Maktoum Intl (DWC)',         city: 'Dubai',        country: 'UAE',          lat: 24.8963,  lng:  55.1614 },
  OMAA: { name: 'Abu Dhabi Intl',               city: 'Abu Dhabi',    country: 'UAE',          lat: 24.4330,  lng:  54.6511 },
  OMSJ: { name: 'Sharjah Intl',                 city: 'Sharjah',      country: 'UAE',          lat: 25.3286,  lng:  55.5172 },
  OTHH: { name: 'Hamad Intl',                   city: 'Doha',         country: 'Qatar',        lat: 25.2731,  lng:  51.6082 },
  OEJN: { name: 'King Abdulaziz Intl',          city: 'Jeddah',       country: 'Saudi Arabia', lat: 21.6796,  lng:  39.1565 },
  OERK: { name: 'King Khalid Intl',             city: 'Riyadh',       country: 'Saudi Arabia', lat: 24.9576,  lng:  46.6988 },
  OEMM: { name: 'Prince Mohammad bin Abdulaziz', city: 'Madinah',     country: 'Saudi Arabia', lat: 24.5534,  lng:  39.7051 },
  OETF: { name: 'Taif Regional',                city: 'Taif',         country: 'Saudi Arabia', lat: 21.4834,  lng:  40.5444 },
  OBBI: { name: 'Bahrain Intl',                 city: 'Manama',       country: 'Bahrain',      lat: 26.2708,  lng:  50.6336 },
  OKBK: { name: 'Kuwait Intl',                  city: 'Kuwait City',  country: 'Kuwait',       lat: 29.2266,  lng:  47.9689 },
  OOMS: { name: 'Muscat Intl',                  city: 'Muscat',       country: 'Oman',         lat: 23.5933,  lng:  58.2844 },
  OJAI: { name: 'Queen Alia Intl',              city: 'Amman',        country: 'Jordan',       lat: 31.7226,  lng:  35.9932 },
  OLBA: { name: 'Rafic Hariri Intl',            city: 'Beirut',       country: 'Lebanon',      lat: 33.8209,  lng:  35.4884 },

  // ── Turkey ───────────────────────────────────────────────────────────────────
  LTFM: { name: 'Istanbul Airport',             city: 'Istanbul',     country: 'Turkey',       lat: 41.2753,  lng:  28.7519 },
  LTAI: { name: 'Antalya',                      city: 'Antalya',      country: 'Turkey',       lat: 36.8987,  lng:  30.7992 },

  // ── Egypt ────────────────────────────────────────────────────────────────────
  HECA: { name: 'Cairo Intl',                   city: 'Cairo',        country: 'Egypt',        lat: 30.1219,  lng:  31.4056 },

  // ── South Asia ───────────────────────────────────────────────────────────────
  VIDP: { name: 'Indira Gandhi Intl',           city: 'Delhi',        country: 'India',        lat: 28.5665,  lng:  77.1031 },
  VABB: { name: 'Chhatrapati Shivaji Intl',     city: 'Mumbai',       country: 'India',        lat: 19.0896,  lng:  72.8656 },
  VOMM: { name: 'Chennai Intl',                 city: 'Chennai',      country: 'India',        lat: 12.9900,  lng:  80.1693 },
  VOBL: { name: 'Kempegowda Intl',              city: 'Bengaluru',    country: 'India',        lat: 13.1986,  lng:  77.7066 },
  VOCL: { name: 'Calicut Intl',                 city: 'Kozhikode',    country: 'India',        lat: 11.1368,  lng:  75.9553 },
  VOHY: { name: 'Rajiv Gandhi Intl',            city: 'Hyderabad',    country: 'India',        lat: 17.2313,  lng:  78.4298 },
  OPKC: { name: 'Jinnah Intl',                  city: 'Karachi',      country: 'Pakistan',     lat: 24.9065,  lng:  67.1608 },
  OPLA: { name: 'Allama Iqbal Intl',            city: 'Lahore',       country: 'Pakistan',     lat: 31.5216,  lng:  74.4036 },
  OPIS: { name: 'Islamabad Intl',               city: 'Islamabad',    country: 'Pakistan',     lat: 33.5167,  lng:  72.8416 },
  VCBI: { name: 'Bandaranaike Intl',            city: 'Colombo',      country: 'Sri Lanka',    lat:  7.1808,  lng:  79.8842 },
  VGZR: { name: 'Hazrat Shahjalal Intl',        city: 'Dhaka',        country: 'Bangladesh',   lat: 23.8433,  lng:  90.3978 },
  VRMM: { name: 'Velana Intl',                  city: 'Malé',         country: 'Maldives',     lat:  4.1918,  lng:  73.5291 },

  // ── East Asia ────────────────────────────────────────────────────────────────
  RJTT: { name: 'Tokyo Haneda',                 city: 'Tokyo',        country: 'Japan',        lat: 35.5494,  lng: 139.7798 },
  RJAA: { name: 'Narita Intl',                  city: 'Tokyo',        country: 'Japan',        lat: 35.7653,  lng: 140.3864 },
  RJOO: { name: 'Kansai Intl',                  city: 'Osaka',        country: 'Japan',        lat: 34.4272,  lng: 135.2440 },
  RKSI: { name: 'Incheon Intl',                 city: 'Seoul',        country: 'South Korea',  lat: 37.4691,  lng: 126.4510 },
  ZBAA: { name: 'Beijing Capital Intl',         city: 'Beijing',      country: 'China',        lat: 40.0799,  lng: 116.6031 },
  ZSPD: { name: 'Shanghai Pudong Intl',         city: 'Shanghai',     country: 'China',        lat: 31.1434,  lng: 121.8052 },
  ZGGG: { name: 'Guangzhou Baiyun Intl',        city: 'Guangzhou',    country: 'China',        lat: 23.3924,  lng: 113.2988 },
  VHHH: { name: 'Hong Kong Intl',               city: 'Hong Kong',    country: 'Hong Kong',    lat: 22.3080,  lng: 113.9185 },
  RCTP: { name: 'Taiwan Taoyuan Intl',          city: 'Taipei',       country: 'Taiwan',       lat: 25.0777,  lng: 121.2326 },

  // ── Australia / New Zealand ───────────────────────────────────────────────────
  YSSY: { name: 'Sydney Kingsford Smith',       city: 'Sydney',       country: 'Australia',    lat: -33.9461, lng: 151.1772 },
  YMML: { name: 'Melbourne Tullamarine',        city: 'Melbourne',    country: 'Australia',    lat: -37.6733, lng: 144.8430 },
  YBBN: { name: 'Brisbane',                     city: 'Brisbane',     country: 'Australia',    lat: -27.3842, lng: 153.1175 },
  YPPH: { name: 'Perth',                        city: 'Perth',        country: 'Australia',    lat: -31.9403, lng: 115.9669 },
  YPAD: { name: 'Adelaide',                     city: 'Adelaide',     country: 'Australia',    lat: -34.9450, lng: 138.5306 },
  NZAA: { name: 'Auckland',                     city: 'Auckland',     country: 'New Zealand',  lat: -37.0082, lng: 174.7917 },

  // ── Europe ───────────────────────────────────────────────────────────────────
  EGLL: { name: 'London Heathrow',              city: 'London',       country: 'UK',           lat: 51.4775,  lng:  -0.4614 },
  EGKK: { name: 'London Gatwick',              city: 'London',       country: 'UK',           lat: 51.1481,  lng:  -0.1903 },
  EGCC: { name: 'Manchester',                   city: 'Manchester',   country: 'UK',           lat: 53.3537,  lng:  -2.2750 },
  EHAM: { name: 'Amsterdam Schiphol',           city: 'Amsterdam',    country: 'Netherlands',  lat: 52.3086,  lng:   4.7639 },
  EDDF: { name: 'Frankfurt',                    city: 'Frankfurt',    country: 'Germany',      lat: 50.0333,  lng:   8.5706 },
  EDDM: { name: 'Munich',                       city: 'Munich',       country: 'Germany',      lat: 48.3538,  lng:  11.7861 },
  LFPG: { name: 'Paris Charles de Gaulle',      city: 'Paris',        country: 'France',       lat: 49.0097,  lng:   2.5479 },
  LEMD: { name: 'Madrid Barajas',               city: 'Madrid',       country: 'Spain',        lat: 40.4719,  lng:  -3.5626 },
  LIRF: { name: 'Rome Fiumicino',               city: 'Rome',         country: 'Italy',        lat: 41.8003,  lng:  12.2389 },
  LSZH: { name: 'Zurich',                       city: 'Zurich',       country: 'Switzerland',  lat: 47.4582,  lng:   8.5482 },
  LOWW: { name: 'Vienna Intl',                  city: 'Vienna',       country: 'Austria',      lat: 48.1103,  lng:  16.5697 },
  EKCH: { name: 'Copenhagen',                   city: 'Copenhagen',   country: 'Denmark',      lat: 55.6179,  lng:  12.6560 },
  ESSA: { name: 'Stockholm Arlanda',            city: 'Stockholm',    country: 'Sweden',       lat: 59.6519,  lng:  17.9186 },
  ENGM: { name: 'Oslo Gardermoen',              city: 'Oslo',         country: 'Norway',       lat: 60.1939,  lng:  11.1004 },
  EFHK: { name: 'Helsinki Vantaa',              city: 'Helsinki',     country: 'Finland',      lat: 60.3172,  lng:  24.9633 },

  // ── Africa ───────────────────────────────────────────────────────────────────
  HECA: { name: 'Cairo Intl',                   city: 'Cairo',        country: 'Egypt',        lat: 30.1219,  lng:  31.4056 },
  GMMN: { name: 'Casablanca Mohammed V',        city: 'Casablanca',   country: 'Morocco',      lat: 33.3675,  lng:  -7.5900 },
  HAAB: { name: 'Addis Ababa Bole',             city: 'Addis Ababa',  country: 'Ethiopia',     lat:  8.9779,  lng:  38.7993 },
  HKJK: { name: 'Jomo Kenyatta Intl',           city: 'Nairobi',      country: 'Kenya',        lat: -1.3192,  lng:  36.9275 },
  FAOR: { name: 'O.R. Tambo Intl',              city: 'Johannesburg', country: 'South Africa', lat: -26.1392, lng:  28.2460 },
  FACT: { name: 'Cape Town Intl',               city: 'Cape Town',    country: 'South Africa', lat: -33.9648, lng:  18.6017 },

  // ── North America ─────────────────────────────────────────────────────────────
  KJFK: { name: 'John F. Kennedy Intl',         city: 'New York',     country: 'USA',          lat: 40.6413,  lng: -73.7781 },
  KLAX: { name: 'Los Angeles Intl',             city: 'Los Angeles',  country: 'USA',          lat: 33.9425,  lng: -118.4081 },
  KORD: { name: "Chicago O'Hare Intl",          city: 'Chicago',      country: 'USA',          lat: 41.9742,  lng: -87.9073 },
  KATL: { name: 'Hartsfield-Jackson Atlanta',   city: 'Atlanta',      country: 'USA',          lat: 33.6367,  lng: -84.4281 },
  KSFO: { name: 'San Francisco Intl',           city: 'San Francisco', country: 'USA',         lat: 37.6213,  lng: -122.3790 },
  CYYZ: { name: 'Toronto Pearson Intl',         city: 'Toronto',      country: 'Canada',       lat: 43.6772,  lng: -79.6306 },
  CYVR: { name: 'Vancouver Intl',               city: 'Vancouver',    country: 'Canada',       lat: 49.1967,  lng: -123.1815 },
}

/**
 * Look up an airport by ICAO code (case-insensitive).
 * Returns the airport object or null if not found.
 */
export function lookupAirport(icao) {
  if (!icao || icao.length < 3) return null
  return AIRPORTS[icao.trim().toUpperCase()] ?? null
}

export default AIRPORTS
