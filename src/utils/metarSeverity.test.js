import { describe, it, expect } from 'vitest'
import {
  getMetarFlightCat,
  getWindSev,
  tokenizeRaw,
  parseTafSegments,
  CAT_COLORS,
  WIND_COLORS,
  WX_COLOR,
} from './metarSeverity'

// Helper: build a structured METAR object like aviationweather.gov returns.
// visib is in statute miles (the API's unit).
// NOTE: the default rawOb deliberately contains NO unlimited-sky token
// (CAVOK/SKC/NSC/etc.), so the structured clouds/visib fields drive the result.
const metar = (over = {}) => ({
  rawOb: 'METAR XXXX 121200Z 12005KT 20/10 Q1015',
  visib: 10,
  clouds: [],
  wxString: '',
  ...over,
})

// Helper: pull only the visible (non-whitespace) tokens out of tokenizeRaw output
const visibleTokens = arr => arr.filter(t => t.text.trim() !== '')

describe('getMetarFlightCat — ceiling driven', () => {
  it('VFR: high ceiling + good vis', () => {
    expect(getMetarFlightCat(metar({
      rawOb: 'METAR XXXX 121200Z 12005KT 9999 FEW050 20/10 Q1015',
      visib: 10, clouds: [{ cover: 'FEW', base: 5000 }],
    }))).toBe('VFR')
  })

  it('MVFR: BKN025 ceiling (2500 ft)', () => {
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'BKN', base: 2500 }],
    }))).toBe('MVFR')
  })

  it('IFR: OVC007 ceiling (700 ft)', () => {
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'OVC', base: 700 }],
    }))).toBe('IFR')
  })

  it('LIFR: OVC003 ceiling (300 ft)', () => {
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'OVC', base: 300 }],
    }))).toBe('LIFR')
  })

  it('FEW/SCT layers are not ceilings — stays VFR', () => {
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'FEW', base: 200 }, { cover: 'SCT', base: 400 }],
    }))).toBe('VFR')
  })

  it('uses the LOWEST BKN/OVC layer as ceiling', () => {
    expect(getMetarFlightCat(metar({
      visib: 10,
      clouds: [{ cover: 'BKN', base: 4000 }, { cover: 'OVC', base: 600 }],
    }))).toBe('IFR') // 600 ft wins
  })
})

describe('getMetarFlightCat — visibility driven (metres)', () => {
  // visib in SM → converted to metres internally (×1609.34)
  it('VFR: 6 SM ≈ 9656 m', () => {
    expect(getMetarFlightCat(metar({ visib: 6, clouds: [] }))).toBe('VFR')
  })
  it('MVFR: 4 SM ≈ 6437 m', () => {
    expect(getMetarFlightCat(metar({ visib: 4, clouds: [] }))).toBe('MVFR')
  })
  it('IFR: 2 SM ≈ 3219 m', () => {
    expect(getMetarFlightCat(metar({ visib: 2, clouds: [] }))).toBe('IFR')
  })
  it('LIFR: 0.5 SM ≈ 805 m', () => {
    expect(getMetarFlightCat(metar({ visib: 0.5, clouds: [] }))).toBe('LIFR')
  })
})

describe('getMetarFlightCat — worst of ceiling OR visibility', () => {
  it('good vis but low ceiling → driven by ceiling', () => {
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'OVC', base: 400 }],
    }))).toBe('LIFR')
  })
  it('high ceiling but low vis → driven by vis', () => {
    expect(getMetarFlightCat(metar({
      visib: 0.5, clouds: [{ cover: 'FEW', base: 9000 }],
    }))).toBe('LIFR')
  })
})

describe('getMetarFlightCat — significant weather floors', () => {
  it('TS bumps to at least IFR', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: 'TS' }))).toBe('IFR')
  })
  it('TSRA (compound) bumps to IFR — regression for the \\bTS bug', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: '-TSRA' }))).toBe('IFR')
  })
  it('+TSRA bumps to LIFR', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: '+TSRA' }))).toBe('LIFR')
  })
  it('FZRA bumps to IFR', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: 'FZRA' }))).toBe('IFR')
  })
  it('FC bumps to LIFR', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: 'FC' }))).toBe('LIFR')
  })
  it('RETSRA (recent) does NOT trigger a floor', () => {
    expect(getMetarFlightCat(metar({ visib: 10, clouds: [], wxString: 'RETSRA' }))).toBe('VFR')
  })
  it('wx floor never lowers an already-worse category', () => {
    // LIFR ceiling + TS (IFR floor) stays LIFR
    expect(getMetarFlightCat(metar({
      visib: 10, clouds: [{ cover: 'OVC', base: 300 }], wxString: 'TS',
    }))).toBe('LIFR')
  })
})

describe('getMetarFlightCat — CAVOK & edge cases', () => {
  it('CAVOK → VFR', () => {
    expect(getMetarFlightCat(metar({
      rawOb: 'METAR XXXX 121200Z 12005KT CAVOK 20/10 Q1015', visib: null, clouds: [],
    }))).toBe('VFR')
  })
  it('null input → null', () => {
    expect(getMetarFlightCat(null)).toBeNull()
  })
  it('no usable vis/ceiling data → null', () => {
    expect(getMetarFlightCat(metar({
      rawOb: 'METAR XXXX', visib: null, clouds: [],
    }))).toBeNull()
  })
})

describe('getWindSev', () => {
  it('NORMAL below 20 kt with no significant gust', () => {
    expect(getWindSev(5, 0)).toBe('NORMAL')
    expect(getWindSev(15)).toBe('NORMAL')
    expect(getWindSev(19, 24)).toBe('NORMAL')
  })
  it('STRONG at 20 kt or gust 25 kt', () => {
    expect(getWindSev(20, 0)).toBe('STRONG')
    expect(getWindSev(34)).toBe('STRONG')
    expect(getWindSev(0, 25)).toBe('STRONG')
  })
  it('SEVERE at 35 kt or gust 45 kt', () => {
    expect(getWindSev(35)).toBe('SEVERE')
    expect(getWindSev(0, 45)).toBe('SEVERE')
    expect(getWindSev(50, 60)).toBe('SEVERE')
  })
  it('accepts numeric strings', () => {
    expect(getWindSev('22', '34')).toBe('STRONG')
    expect(getWindSev('40', '0')).toBe('SEVERE')
  })
  it('handles null/undefined → NORMAL', () => {
    expect(getWindSev(null, null)).toBe('NORMAL')
    expect(getWindSev(undefined, undefined)).toBe('NORMAL')
  })
})

describe('tokenizeRaw', () => {
  it('empty input → single em-dash token in category colour', () => {
    expect(tokenizeRaw('', 'cat', null)).toEqual([{ text: '—', color: 'cat' }])
  })
  it('wind token gets the wind colour', () => {
    const out = visibleTokens(tokenizeRaw('XXXX 24022G34KT 9999', CAT_COLORS.IFR, WIND_COLORS.STRONG))
    const wind = out.find(t => t.text === '24022G34KT')
    expect(wind.color).toBe(WIND_COLORS.STRONG)
  })
  it('weather token gets the WX colour', () => {
    const out = visibleTokens(tokenizeRaw('XXXX -TSRA OVC005', CAT_COLORS.IFR, null))
    expect(out.find(t => t.text === '-TSRA').color).toBe(WX_COLOR)
  })
  it('ordinary tokens get the category colour', () => {
    const out = visibleTokens(tokenizeRaw('METAR XXXX 20/10 Q1015', CAT_COLORS.VFR, null))
    expect(out.find(t => t.text === 'Q1015').color).toBe(CAT_COLORS.VFR)
  })
  it('wind colour takes priority over wx (independent severity)', () => {
    const out = visibleTokens(tokenizeRaw('24022G34KT -RA', CAT_COLORS.IFR, WIND_COLORS.SEVERE))
    expect(out.find(t => t.text === '24022G34KT').color).toBe(WIND_COLORS.SEVERE)
    expect(out.find(t => t.text === '-RA').color).toBe(WX_COLOR)
  })

  it('splits a CB cloud group — base in category colour, CB in WX colour', () => {
    const out = visibleTokens(tokenizeRaw('XXXX FEW017CB SCT030', CAT_COLORS.MVFR, null))
    expect(out.find(t => t.text === 'FEW017').color).toBe(CAT_COLORS.MVFR)
    expect(out.find(t => t.text === 'CB').color).toBe(WX_COLOR)
    // a plain cloud group stays whole, in category colour
    expect(out.find(t => t.text === 'SCT030').color).toBe(CAT_COLORS.MVFR)
  })

  it('splits a TCU cloud group', () => {
    const out = visibleTokens(tokenizeRaw('XXXX BKN025TCU', CAT_COLORS.IFR, null))
    expect(out.find(t => t.text === 'BKN025').color).toBe(CAT_COLORS.IFR)
    expect(out.find(t => t.text === 'TCU').color).toBe(WX_COLOR)
  })
})

describe('parseTafSegments', () => {
  it('null input → null', () => {
    expect(parseTafSegments(null)).toBeNull()
  })

  it('splits multi-period TAF and categorises each independently', () => {
    const raw =
      'TAF WMKK 121130Z 1212/1318 24015KT 9999 BKN025\n' +
      'FM121800 28025G38KT 6000 -RA BKN010\n' +
      'TEMPO 1218/1222 2000 TSRA BKN006CB'
    const segs = parseTafSegments(raw)

    expect(segs).toHaveLength(3)
    expect(segs.map(s => s.type)).toEqual(['BASE', 'FM', 'TEMPO'])
    expect(segs.map(s => s.cat)).toEqual(['MVFR', 'MVFR', 'IFR'])
    expect(segs.map(s => s.isTemporal)).toEqual([false, false, true])
  })

  it('splits an inline FM marker onto its own segment', () => {
    const raw = 'TAF XXXX 121130Z 1212/1318 24015KT 9999 SCT030 FM121800 30010KT CAVOK'
    const segs = parseTafSegments(raw)
    expect(segs).toHaveLength(2)
    expect(segs[0].type).toBe('BASE')
    expect(segs[1].type).toBe('FM')
  })

  it('PROB period is temporal and low-vis FG → LIFR', () => {
    const raw =
      'TAF XXXX 121130Z 1212/1318 09008KT CAVOK\n' +
      'PROB30 1214/1216 0500 FG'
    const segs = parseTafSegments(raw)
    const prob = segs.find(s => s.type === 'PROB')
    expect(prob).toBeTruthy()
    expect(prob.isTemporal).toBe(true)
    expect(prob.cat).toBe('LIFR')
  })

  it('colours wind tokens by severity within a segment', () => {
    const raw = 'TAF XXXX 121130Z 1212/1318 28025G38KT 9999 SCT030'
    const segs = parseTafSegments(raw)
    const windTok = segs[0].tokens.find(t => t.text === '28025G38KT')
    expect(windTok.color).toBe(WIND_COLORS.STRONG)
  })

  it('colours weather tokens with the WX colour within a segment', () => {
    const raw = 'TAF XXXX 121130Z 1212/1318 24010KT 3000 -RA OVC008'
    const segs = parseTafSegments(raw)
    const wxTok = segs[0].tokens.find(t => t.text === '-RA')
    expect(wxTok.color).toBe(WX_COLOR)
  })
})
