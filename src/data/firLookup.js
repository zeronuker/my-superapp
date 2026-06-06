/**
 * FIR lookup — maps ICAO 2-letter airport prefix → FIR designator + name.
 * Used to auto-detect departure/arrival FIRs and estimate en-route FIRs
 * by sampling great circle waypoints.
 *
 * Sources: ICAO Doc 7910, EUROCONTROL, FAA JO 7400
 */

export const FIR_BY_PREFIX = {
  // ── Southeast Asia ────────────────────────────────────────────────────────
  WM: { fir: 'WMFC', name: 'Kuala Lumpur FIR' },
  WI: { fir: 'WIIF', name: 'Jakarta FIR' },
  WA: { fir: 'WAAF', name: 'Ujung Pandang FIR' },
  WS: { fir: 'WSJC', name: 'Singapore FIR' },
  WB: { fir: 'WBFC', name: 'Kota Kinabalu FIR' },
  VV: { fir: 'VVTS', name: 'Ho Chi Minh FIR' },
  VH: { fir: 'VHHK', name: 'Hong Kong FIR' },
  VT: { fir: 'VTBB', name: 'Bangkok FIR' },
  VY: { fir: 'VYYY', name: 'Yangon FIR' },
  VL: { fir: 'VLVT', name: 'Vientiane FIR' },
  VD: { fir: 'VDPP', name: 'Phnom Penh FIR' },
  RP: { fir: 'RPHI', name: 'Manila FIR' },

  // ── South Asia ────────────────────────────────────────────────────────────
  VE: { fir: 'VECF', name: 'Kolkata FIR' },
  VI: { fir: 'VIDF', name: 'Delhi FIR' },
  VO: { fir: 'VOMF', name: 'Mumbai FIR' },
  VC: { fir: 'VCCF', name: 'Colombo FIR' },
  VN: { fir: 'VNSM', name: 'Kathmandu FIR' },
  VG: { fir: 'VGFR', name: 'Dhaka FIR' },
  OP: { fir: 'OPKR', name: 'Karachi FIR' },
  OA: { fir: 'OAKX', name: 'Kabul FIR' },

  // ── East Asia ─────────────────────────────────────────────────────────────
  RJ: { fir: 'RJJJ', name: 'Fukuoka FIR' },
  RK: { fir: 'RKRR', name: 'Incheon FIR' },
  RC: { fir: 'RCAA', name: 'Taipei FIR' },
  ZB: { fir: 'ZBPE', name: 'Beijing FIR' },
  ZS: { fir: 'ZSHA', name: 'Shanghai FIR' },
  ZG: { fir: 'ZGZU', name: 'Guangzhou FIR' },
  ZU: { fir: 'ZUUU', name: 'Chengdu FIR' },
  ZW: { fir: 'ZWUQ', name: 'Urumqi FIR' },
  ZH: { fir: 'ZHWH', name: 'Wuhan FIR' },
  ZL: { fir: 'ZLHW', name: 'Lanzhou FIR' },
  ZY: { fir: 'ZYSH', name: 'Shenyang FIR' },
  ZK: { fir: 'ZKPY', name: 'Pyongyang FIR' },
  VM: { fir: 'VMMF', name: 'Macau FIR' },

  // ── Middle East ───────────────────────────────────────────────────────────
  OM: { fir: 'OMAE', name: 'Emirates FIR' },
  OO: { fir: 'OOMM', name: 'Muscat FIR' },
  OB: { fir: 'OBBB', name: 'Bahrain FIR' },
  OI: { fir: 'OIIX', name: 'Tehran FIR' },
  OJ: { fir: 'OJAC', name: 'Amman FIR' },
  OS: { fir: 'OSTT', name: 'Damascus FIR' },
  OL: { fir: 'OLBB', name: 'Beirut FIR' },
  OR: { fir: 'ORBB', name: 'Baghdad FIR' },
  OY: { fir: 'OYSC', name: 'Sanaa FIR' },
  OK: { fir: 'OKAC', name: 'Kuwait FIR' },

  // ── Africa ────────────────────────────────────────────────────────────────
  HE: { fir: 'HECC', name: 'Cairo FIR' },
  HA: { fir: 'HAAA', name: 'Addis Ababa FIR' },
  HK: { fir: 'HKNA', name: 'Nairobi FIR' },
  HS: { fir: 'HSSS', name: 'Khartoum FIR' },
  HT: { fir: 'HTDC', name: 'Dar es Salaam FIR' },
  FY: { fir: 'FYEF', name: 'Windhoek FIR' },
  FA: { fir: 'FAJA', name: 'Johannesburg FIR' },
  FZ: { fir: 'FZZA', name: 'Kinshasa FIR' },
  FB: { fir: 'FBGR', name: 'Gaborone FIR' },
  FQ: { fir: 'FQBE', name: 'Beira FIR' },
  GC: { fir: 'GCCC', name: 'Canarias FIR' },
  GO: { fir: 'GOOO', name: 'Dakar Oceanic FIR' },
  DN: { fir: 'DNKK', name: 'Kano FIR' },
  DI: { fir: 'DIAP', name: 'Abidjan FIR' },
  DB: { fir: 'DBBB', name: 'Cotonou FIR' },
  DX: { fir: 'DXXX', name: 'Lomé FIR' },
  GG: { fir: 'GGGG', name: 'Bissau FIR' },
  GF: { fir: 'GFLL', name: 'Freetown FIR' },

  // ── Europe ────────────────────────────────────────────────────────────────
  EG: { fir: 'EGTT', name: 'London FIR' },
  EI: { fir: 'EISN', name: 'Shannon FIR' },
  EB: { fir: 'EBBU', name: 'Brussels FIR' },
  ED: { fir: 'EDGG', name: 'Langen FIR' },
  LF: { fir: 'LFFF', name: 'Paris FIR' },
  LP: { fir: 'LPPC', name: 'Lisbon FIR' },
  LE: { fir: 'LECM', name: 'Madrid FIR' },
  LI: { fir: 'LIMM', name: 'Milan FIR' },
  LR: { fir: 'LRBB', name: 'Bucharest FIR' },
  LB: { fir: 'LBSR', name: 'Sofia FIR' },
  LG: { fir: 'LGGG', name: 'Athens FIR' },
  LT: { fir: 'LTAA', name: 'Ankara FIR' },
  EK: { fir: 'EKDK', name: 'Copenhagen FIR' },
  EN: { fir: 'ENOR', name: 'Oslo FIR' },
  ES: { fir: 'ESAA', name: 'Stockholm FIR' },
  EF: { fir: 'EFIN', name: 'Helsinki FIR' },
  EV: { fir: 'EVRR', name: 'Riga FIR' },
  EY: { fir: 'EYVI', name: 'Vilnius FIR' },
  EE: { fir: 'EETT', name: 'Tallinn FIR' },
  EP: { fir: 'EPWW', name: 'Warsaw FIR' },
  LK: { fir: 'LKAA', name: 'Prague FIR' },
  LZ: { fir: 'LZBB', name: 'Bratislava FIR' },
  LH: { fir: 'LHCC', name: 'Budapest FIR' },
  LA: { fir: 'LAAA', name: 'Tirana FIR' },
  LJ: { fir: 'LJLA', name: 'Ljubljana FIR' },
  LD: { fir: 'LDZO', name: 'Zagreb FIR' },
  LQ: { fir: 'LQSB', name: 'Sarajevo FIR' },
  LY: { fir: 'LYBA', name: 'Belgrade FIR' },
  LW: { fir: 'LWSS', name: 'Skopje FIR' },
  LM: { fir: 'LMMM', name: 'Malta FIR' },
  LO: { fir: 'LOVV', name: 'Vienna FIR' },
  EL: { fir: 'ELLX', name: 'Luxembourg FIR' },
  EH: { fir: 'EHAA', name: 'Amsterdam FIR' },

  // ── Russia / CIS ──────────────────────────────────────────────────────────
  UE: { fir: 'UELL', name: 'Yakutsk FIR' },
  UH: { fir: 'UHPP', name: 'Khabarovsk FIR' },
  UI: { fir: 'UIII', name: 'Irkutsk FIR' },
  UM: { fir: 'UMMV', name: 'Minsk FIR' },
  UN: { fir: 'UNNT', name: 'Novosibirsk FIR' },
  UO: { fir: 'UOOO', name: 'Tyumen FIR' },
  UR: { fir: 'URRV', name: 'Rostov FIR' },
  US: { fir: 'USSS', name: 'Yekaterinburg FIR' },
  UT: { fir: 'UTDD', name: 'Tashkent FIR' },
  UU: { fir: 'UUUU', name: 'Moscow FIR' },
  UW: { fir: 'UWKD', name: 'Kazan FIR' },
  UK: { fir: 'UKBV', name: 'Kyiv FIR' },

  // ── North America ─────────────────────────────────────────────────────────
  K:  { fir: 'KUSA', name: 'USA (FAA domestic)' },  // single-letter prefix
  CY: { fir: 'CZYZ', name: 'Toronto FIR' },
  CZ: { fir: 'CZVR', name: 'Vancouver FIR' },
  CE: { fir: 'CZEG', name: 'Edmonton FIR' },
  CW: { fir: 'CZWG', name: 'Winnipeg FIR' },
  CM: { fir: 'CZMM', name: 'Montreal FIR' },

  // ── Caribbean / Central America ───────────────────────────────────────────
  MK: { fir: 'MKJK', name: 'Kingston FIR' },
  MH: { fir: 'MHCC', name: 'Tegucigalpa FIR' },
  MG: { fir: 'MGGT', name: 'Guatemala FIR' },
  MM: { fir: 'MMEX', name: 'Mexico FIR' },
  MP: { fir: 'MPTO', name: 'Panama FIR' },
  TI: { fir: 'TNCF', name: 'Curaçao FIR' },
  TJ: { fir: 'TJZS', name: 'San Juan FIR' },

  // ── South America ─────────────────────────────────────────────────────────
  SB: { fir: 'SBBS', name: 'Brasília FIR' },
  SA: { fir: 'SAEF', name: 'Buenos Aires FIR' },
  SC: { fir: 'SCEZ', name: 'Santiago FIR' },
  SK: { fir: 'SKBO', name: 'Bogota FIR' },
  SP: { fir: 'SPIM', name: 'Lima FIR' },
  SV: { fir: 'SVZM', name: 'Maiquetía FIR' },
  SE: { fir: 'SEQM', name: 'Quito FIR' },

  // ── Australia / Pacific ───────────────────────────────────────────────────
  YM: { fir: 'YMMM', name: 'Melbourne FIR' },
  YB: { fir: 'YBBB', name: 'Brisbane FIR' },
  NZ: { fir: 'NZZC', name: 'New Zealand FIR' },
  NF: { fir: 'NFFF', name: 'Nadi FIR' },
  NS: { fir: 'NSTU', name: 'Oakland Oceanic FIR' },
  PH: { fir: 'PHZH', name: 'Honolulu FIR' },
  PG: { fir: 'PGUM', name: 'Guam FIR' },
}

/**
 * Resolve an airport ICAO code to its FIR entry.
 * Tries 2-letter prefix first, then 1-letter for K__ (USA).
 */
export function icaoToFir(icao) {
  if (!icao || icao.length < 2) return null
  const two = icao.slice(0, 2).toUpperCase()
  if (FIR_BY_PREFIX[two]) return { icao: FIR_BY_PREFIX[two].fir, name: FIR_BY_PREFIX[two].name }
  const one = icao.slice(0, 1).toUpperCase()
  if (FIR_BY_PREFIX[one]) return { icao: FIR_BY_PREFIX[one].fir, name: FIR_BY_PREFIX[one].name }
  return null
}

/**
 * Given a lat/lng point, find the best matching FIR using ICAO prefix heuristics.
 * We map geographic regions to ICAO prefixes using bounding boxes.
 * Returns null when no match is found (open ocean, etc.)
 */
export function latlngToFir(lat, lng) {
  // Ordered from most specific to least specific
  const regions = [
    // Southeast Asia
    { prefix: 'WM', latMin: 0,   latMax: 8,   lngMin: 98,  lngMax: 107 },
    { prefix: 'WS', latMin: -2,  latMax: 2,   lngMin: 102, lngMax: 107 },
    { prefix: 'WB', latMin: 2,   latMax: 8,   lngMin: 107, lngMax: 120 },
    { prefix: 'WI', latMin: -9,  latMax: 6,   lngMin: 95,  lngMax: 108 },
    { prefix: 'WA', latMin: -9,  latMax: 2,   lngMin: 108, lngMax: 141 },
    { prefix: 'VT', latMin: 5,   latMax: 21,  lngMin: 97,  lngMax: 106 },
    { prefix: 'VV', latMin: 7,   latMax: 24,  lngMin: 102, lngMax: 110 },
    { prefix: 'RP', latMin: 4,   latMax: 22,  lngMin: 114, lngMax: 130 },
    { prefix: 'VH', latMin: 17,  latMax: 26,  lngMin: 107, lngMax: 121 },
    { prefix: 'VD', latMin: 9,   latMax: 15,  lngMin: 102, lngMax: 108 },
    { prefix: 'VL', latMin: 13,  latMax: 23,  lngMin: 100, lngMax: 108 },
    { prefix: 'VY', latMin: 14,  latMax: 28,  lngMin: 92,  lngMax: 102 },

    // East Asia
    { prefix: 'RC', latMin: 20,  latMax: 28,  lngMin: 119, lngMax: 128 },
    { prefix: 'RJ', latMin: 24,  latMax: 46,  lngMin: 122, lngMax: 146 },
    { prefix: 'RK', latMin: 32,  latMax: 42,  lngMin: 122, lngMax: 132 },
    { prefix: 'ZG', latMin: 18,  latMax: 28,  lngMin: 107, lngMax: 120 },
    { prefix: 'ZS', latMin: 28,  latMax: 36,  lngMin: 115, lngMax: 125 },
    { prefix: 'ZB', latMin: 36,  latMax: 46,  lngMin: 105, lngMax: 125 },
    { prefix: 'ZU', latMin: 24,  latMax: 36,  lngMin: 96,  lngMax: 108 },
    { prefix: 'ZW', latMin: 36,  latMax: 50,  lngMin: 73,  lngMax: 100 },
    { prefix: 'ZH', latMin: 28,  latMax: 36,  lngMin: 107, lngMax: 117 },
    { prefix: 'ZY', latMin: 38,  latMax: 54,  lngMin: 118, lngMax: 136 },
    { prefix: 'ZL', latMin: 32,  latMax: 42,  lngMin: 96,  lngMax: 110 },
    { prefix: 'ZK', latMin: 37,  latMax: 43,  lngMin: 124, lngMax: 131 },

    // South Asia
    { prefix: 'VE', latMin: 18,  latMax: 28,  lngMin: 80,  lngMax: 97  },
    { prefix: 'VI', latMin: 24,  latMax: 38,  lngMin: 65,  lngMax: 82  },
    { prefix: 'VO', latMin: 8,   latMax: 28,  lngMin: 62,  lngMax: 80  },
    { prefix: 'VC', latMin: 0,   latMax: 16,  lngMin: 68,  lngMax: 85  },
    { prefix: 'VN', latMin: 26,  latMax: 32,  lngMin: 80,  lngMax: 90  },
    { prefix: 'VG', latMin: 20,  latMax: 27,  lngMin: 88,  lngMax: 95  },
    { prefix: 'OP', latMin: 22,  latMax: 38,  lngMin: 60,  lngMax: 75  },
    { prefix: 'OA', latMin: 29,  latMax: 39,  lngMin: 60,  lngMax: 75  },

    // Middle East
    { prefix: 'OM', latMin: 20,  latMax: 28,  lngMin: 50,  lngMax: 60  },
    { prefix: 'OO', latMin: 16,  latMax: 26,  lngMin: 52,  lngMax: 60  },
    { prefix: 'OB', latMin: 24,  latMax: 28,  lngMin: 47,  lngMax: 55  },
    { prefix: 'OI', latMin: 24,  latMax: 40,  lngMin: 44,  lngMax: 64  },
    { prefix: 'OR', latMin: 28,  latMax: 38,  lngMin: 38,  lngMax: 50  },
    { prefix: 'OY', latMin: 11,  latMax: 20,  lngMin: 42,  lngMax: 54  },
    { prefix: 'OK', latMin: 27,  latMax: 31,  lngMin: 45,  lngMax: 50  },
    { prefix: 'OJ', latMin: 28,  latMax: 34,  lngMin: 34,  lngMax: 40  },
    { prefix: 'OS', latMin: 32,  latMax: 37,  lngMin: 35,  lngMax: 43  },
    { prefix: 'OL', latMin: 32,  latMax: 35,  lngMin: 34,  lngMax: 37  },
    { prefix: 'HE', latMin: 20,  latMax: 32,  lngMin: 24,  lngMax: 38  },

    // Africa
    { prefix: 'HA', latMin: 3,   latMax: 18,  lngMin: 32,  lngMax: 48  },
    { prefix: 'HS', latMin: 10,  latMax: 24,  lngMin: 22,  lngMax: 38  },
    { prefix: 'HK', latMin: -5,  latMax: 6,   lngMin: 33,  lngMax: 42  },
    { prefix: 'HT', latMin: -12, latMax: -2,  lngMin: 28,  lngMax: 42  },
    { prefix: 'FA', latMin: -35, latMax: -20, lngMin: 16,  lngMax: 33  },
    { prefix: 'FY', latMin: -30, latMax: -17, lngMin: 11,  lngMax: 25  },
    { prefix: 'FZ', latMin: -14, latMax: 6,   lngMin: 12,  lngMax: 32  },
    { prefix: 'DN', latMin: 4,   latMax: 14,  lngMin: 2,   lngMax: 15  },

    // Europe
    { prefix: 'EG', latMin: 49,  latMax: 62,  lngMin: -9,  lngMax: 2   },
    { prefix: 'EI', latMin: 51,  latMax: 57,  lngMin: -11, lngMax: -5  },
    { prefix: 'ED', latMin: 46,  latMax: 56,  lngMin: 6,   lngMax: 16  },
    { prefix: 'LF', latMin: 42,  latMax: 52,  lngMin: -5,  lngMax: 8   },
    { prefix: 'LP', latMin: 36,  latMax: 43,  lngMin: -10, lngMax: -6  },
    { prefix: 'LE', latMin: 35,  latMax: 44,  lngMin: -9,  lngMax: 5   },
    { prefix: 'LI', latMin: 36,  latMax: 47,  lngMin: 6,   lngMax: 16  },
    { prefix: 'LT', latMin: 36,  latMax: 43,  lngMin: 26,  lngMax: 45  },
    { prefix: 'LG', latMin: 34,  latMax: 42,  lngMin: 19,  lngMax: 29  },
    { prefix: 'LR', latMin: 43,  latMax: 50,  lngMin: 22,  lngMax: 30  },
    { prefix: 'LB', latMin: 41,  latMax: 44,  lngMin: 22,  lngMax: 28  },
    { prefix: 'LY', latMin: 41,  latMax: 47,  lngMin: 18,  lngMax: 24  },
    { prefix: 'EB', latMin: 49,  latMax: 53,  lngMin: 2,   lngMax: 8   },
    { prefix: 'EH', latMin: 50,  latMax: 56,  lngMin: 3,   lngMax: 8   },
    { prefix: 'EK', latMin: 54,  latMax: 58,  lngMin: 7,   lngMax: 16  },
    { prefix: 'EN', latMin: 57,  latMax: 72,  lngMin: 4,   lngMax: 32  },
    { prefix: 'ES', latMin: 54,  latMax: 70,  lngMin: 10,  lngMax: 26  },
    { prefix: 'EF', latMin: 59,  latMax: 70,  lngMin: 19,  lngMax: 32  },
    { prefix: 'EP', latMin: 49,  latMax: 55,  lngMin: 14,  lngMax: 24  },
    { prefix: 'LK', latMin: 48,  latMax: 52,  lngMin: 12,  lngMax: 19  },
    { prefix: 'LH', latMin: 45,  latMax: 49,  lngMin: 15,  lngMax: 23  },
    { prefix: 'LZ', latMin: 47,  latMax: 50,  lngMin: 16,  lngMax: 23  },
    { prefix: 'LO', latMin: 46,  latMax: 49,  lngMin: 9,   lngMax: 17  },

    // Russia / CIS
    { prefix: 'UU', latMin: 50,  latMax: 66,  lngMin: 28,  lngMax: 50  },
    { prefix: 'UK', latMin: 44,  latMax: 53,  lngMin: 22,  lngMax: 40  },
    { prefix: 'UT', latMin: 36,  latMax: 48,  lngMin: 55,  lngMax: 75  },
    { prefix: 'UN', latMin: 50,  latMax: 68,  lngMin: 60,  lngMax: 90  },
    { prefix: 'UI', latMin: 48,  latMax: 65,  lngMin: 95,  lngMax: 120 },
    { prefix: 'UH', latMin: 42,  latMax: 60,  lngMin: 128, lngMax: 145 },
    { prefix: 'UE', latMin: 56,  latMax: 72,  lngMin: 120, lngMax: 145 },

    // North America
    { prefix: 'CY', latMin: 41,  latMax: 48,  lngMin: -82, lngMax: -74 },
    { prefix: 'CZ', latMin: 48,  latMax: 60,  lngMin: -140,-lngMax: -114},
    { prefix: 'MM', latMin: 14,  latMax: 33,  lngMin: -118,lngMax: -86 },

    // South America
    { prefix: 'SB', latMin: -20, latMax: 6,   lngMin: -74, lngMax: -34 },
    { prefix: 'SA', latMin: -56, latMax: -22, lngMin: -74, lngMax: -52 },
    { prefix: 'SC', latMin: -56, latMax: -17, lngMin: -80, lngMax: -65 },
    { prefix: 'SK', latMin: -5,  latMax: 12,  lngMin: -80, lngMax: -65 },
    { prefix: 'SP', latMin: -20, latMax: 0,   lngMin: -82, lngMax: -68 },

    // Australia / Pacific
    { prefix: 'YM', latMin: -44, latMax: -10, lngMin: 112, lngMax: 160 },
    { prefix: 'NZ', latMin: -52, latMax: -33, lngMin: 160, lngMax: 180 },
    { prefix: 'NF', latMin: -25, latMax: -5,  lngMin: 170, lngMax: 180 },
    { prefix: 'PH', latMin: 15,  latMax: 30,  lngMin: -165,lngMax: -150},
    { prefix: 'PG', latMin: 4,   latMax: 22,  lngMin: 140, lngMax: 160 },

    // USA fallback (broad)
    { prefix: 'K',  latMin: 24,  latMax: 50,  lngMin: -126,lngMax: -66 },
  ]

  for (const r of regions) {
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) {
      return FIR_BY_PREFIX[r.prefix] ? { icao: FIR_BY_PREFIX[r.prefix].fir, name: FIR_BY_PREFIX[r.prefix].name } : null
    }
  }
  return null
}
