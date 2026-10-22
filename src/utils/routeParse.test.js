import { describe, it, expect } from 'vitest'
import { parseRoute, matchResolved, buildRouteLine, MAX_FIXES } from './routeParse'

describe('parseRoute', () => {
  it('OD8684 as pasted from FDPro', () => {
    const r = parseRoute('WMKK KIMAT1A KIMAT Y344 VPK M758 VISAT M771 DAGAG M765 ALDAS L625 ABVAR M646 POTIB Q14 TNN W6 TOROX DCT RCQC')
    expect(r.dep).toBe('WMKK')
    expect(r.arr).toBe('RCQC')
    expect(r.fixes).toEqual(['KIMAT', 'VPK', 'VISAT', 'DAGAG', 'ALDAS', 'ABVAR', 'POTIB', 'TNN', 'TOROX'])
  })

  it('OD184 (SID and STAR names dropped)', () => {
    const r = parseRoute('WMKK BIKDU1D BIKDU Y501 RINBA Y502 DUBAX R325 PUT L515 OBMOG M770 BUBKO M773 CEA R581 ROMEO ROMEO1G VNKT')
    expect(r.dep).toBe('WMKK')
    expect(r.arr).toBe('VNKT')
    expect(r.fixes).toEqual(['BIKDU', 'RINBA', 'DUBAX', 'PUT', 'OBMOG', 'BUBKO', 'CEA', 'ROMEO'])
  })

  it('drops runway tokens', () => {
    const r = parseRoute('RKSI RWY-16R BOPTA3H BOPTA Z51 BEDES Y711 MUGUS Y742 SALMI SAROX1G RWY-14L WMKK')
    expect(r.fixes).toEqual(['BOPTA', 'BEDES', 'MUGUS', 'SALMI'])
    expect(r.dep).toBe('RKSI')
    expect(r.arr).toBe('WMKK')
  })

  it('drops a speed/level suffix on a fix and keeps the fix', () => {
    const r = parseRoute('RKSI N0474F340 BOPTA KANKA/N0468F360 Y711 MUGUS WMKK')
    expect(r.fixes).toEqual(['BOPTA', 'KANKA', 'MUGUS'])
  })

  it('handles lower case, commas, extra spaces and line breaks', () => {
    const r = parseRoute('wmkk  kimat1a,\nkimat y344 vpk\r\nwmsa')
    expect(r.dep).toBe('WMKK')
    expect(r.arr).toBe('WMSA')
    expect(r.fixes).toEqual(['KIMAT', 'VPK'])
  })

  it('collapses a fix that repeats straight away', () => {
    expect(parseRoute('WMKK ABCDE ABCDE FGHIJ WSSS').fixes).toEqual(['ABCDE', 'FGHIJ'])
  })

  it('keeps 2-3 letter navaids', () => {
    expect(parseRoute('YPPH AVNEX Y15 ESDEG Q587 ROM WIII').fixes).toEqual(['AVNEX', 'ESDEG', 'ROM'])
  })

  it('a route with no fixes between the airports is still valid', () => {
    const r = parseRoute('WMKK DCT WSSS')
    expect(r).toMatchObject({ dep: 'WMKK', arr: 'WSSS', fixes: [], ok: true })
  })

  it('is not ok without airports at both ends', () => {
    expect(parseRoute('KIMAT Y344 VPK').ok).toBe(false)
    expect(parseRoute('WMKK KIMAT Y344 VPK').ok).toBe(false)
    expect(parseRoute('KIMAT VPK WSSS').ok).toBe(false)
  })

  it('is not ok for one airport alone, or empty input', () => {
    expect(parseRoute('WMKK').ok).toBe(false)
    expect(parseRoute('').ok).toBe(false)
    expect(parseRoute(null).ok).toBe(false)
  })

  it('reports a route that has too many fixes', () => {
    const many = Array.from({ length: MAX_FIXES + 1 }, (_, i) => 'AB' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26)) + 'X').join(' ')
    const r = parseRoute(`WMKK ${many} WSSS`)
    expect(r.tooLong).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('ignores symbols and junk', () => {
    expect(parseRoute('WMKK <<KIMAT>> (VPK) *** WSSS').fixes).toEqual(['KIMAT', 'VPK'])
  })
})

// A real autorouter reply, trimmed to the fields we use (WMSA to WMKP, GORVU unknown).
const reply = (names, error) => ({
  error,
  fplan: names.map(([name, type, lat, lon]) => ({ name, type, coordlatdeg: lat, coordlondeg: lon })),
})

describe('matchResolved', () => {
  const ok = reply([
    ['SUBANG / SULTAN ABDUL AZIZ SHAH', 'ARPT', 3.13, 101.55],
    ['ATIMU', 'INT', 3.72, 101.02],
    ['TEPUS', 'INT', 4.2, 100.8],
    ['PENANG INTERNATIONAL AIRPORT', 'ARPT', 5.3, 100.28],
  ])

  it('pairs the returned points with the fixes in order', () => {
    expect(matchResolved(['ATIMU', 'TEPUS'], ok)).toEqual([
      { name: 'ATIMU', lat: 3.72, lon: 101.02 },
      { name: 'TEPUS', lat: 4.2, lon: 100.8 },
    ])
  })

  it('marks an unknown fix as missing and keeps the order', () => {
    const r = matchResolved(['ATIMU', 'TEPUS', 'GORVU'], { ...ok, error: ['unknown identifier GORVU'] })
    expect(r.map(x => x.name)).toEqual(['ATIMU', 'TEPUS', 'GORVU'])
    expect(r[2]).toEqual({ name: 'GORVU', missing: true })
  })

  it('accepts a single error as a plain string', () => {
    const r = matchResolved(['ATIMU', 'TEPUS', 'GORVU'], { ...ok, error: 'unknown identifier GORVU' })
    expect(r[2].missing).toBe(true)
  })

  it('accepts several errors in one newline-separated string', () => {
    const r = matchResolved(['ATIMU', 'TEPUS'], { ...ok, error: 'unknown identifier ZZZZZ\nunknown identifier YYYYY' })
    expect(r).toHaveLength(2)
    expect(r.every(x => !x.missing)).toBe(true)
  })

  it('returns null when the point count does not match (never guess)', () => {
    expect(matchResolved(['ATIMU', 'TEPUS', 'EXTRA'], ok)).toBeNull()
    expect(matchResolved(['ATIMU'], ok)).toBeNull()
  })

  it('returns null when the reply does not start and end at airports', () => {
    const bad = reply([['ATIMU', 'INT', 3.7, 101], ['TEPUS', 'INT', 4.2, 100.8]])
    expect(matchResolved(['ATIMU'], bad)).toBeNull()
  })

  it('returns null for a reply with no point list', () => {
    expect(matchResolved(['ATIMU'], {})).toBeNull()
    expect(matchResolved(['ATIMU'], null)).toBeNull()
  })

  it('skips entries with no coordinates (autorouter housekeeping rows)', () => {
    const withBlank = {
      fplan: [
        { name: 'A', type: 'ARPT', coordlatdeg: 1, coordlondeg: 1 },
        { type: 'UNDEF' },
        { name: 'ATIMU', type: 'INT', coordlatdeg: 3.7, coordlondeg: 101 },
        { type: 'UNDEF' },
        { name: 'B', type: 'ARPT', coordlatdeg: 2, coordlondeg: 2 },
      ],
    }
    expect(matchResolved(['ATIMU'], withBlank)).toEqual([{ name: 'ATIMU', lat: 3.7, lon: 101 }])
  })
})

describe('buildRouteLine', () => {
  const dep = { lat: 3.1, lng: 101.5 }
  const arr = { lat: 5.3, lng: 100.3 }

  it('runs airport, fixes in order, airport', () => {
    const { points, missing } = buildRouteLine(dep, arr, [
      { name: 'ATIMU', lat: 3.7, lon: 101 },
      { name: 'TEPUS', lat: 4.2, lon: 100.8 },
    ])
    expect(points.map(p => p.name)).toEqual([undefined, 'ATIMU', 'TEPUS', undefined])
    expect(points[0]).toMatchObject({ lat: 3.1, lng: 101.5 })
    expect(points.at(-1)).toMatchObject({ lat: 5.3, lng: 100.3 })
    expect(missing).toEqual([])
  })

  it('skips a missing fix and lists it', () => {
    const { points, missing } = buildRouteLine(dep, arr, [
      { name: 'ATIMU', lat: 3.7, lon: 101 },
      { name: 'GORVU', missing: true },
    ])
    expect(points).toHaveLength(3)
    expect(missing).toEqual(['GORVU'])
  })

  it('fills a missing fix from the overrides', () => {
    const { points, missing } = buildRouteLine(dep, arr,
      [{ name: 'ATIMU', lat: 3.7, lon: 101 }, { name: 'GORVU', missing: true }],
      { GORVU: [4.9, 100.4] })
    expect(points.map(p => p.name)).toEqual([undefined, 'ATIMU', 'GORVU', undefined])
    expect(points[2]).toMatchObject({ lat: 4.9, lng: 100.4 })
    expect(missing).toEqual([])
  })

  it('an override never replaces a fix autorouter resolved', () => {
    const { points } = buildRouteLine(dep, arr, [{ name: 'ATIMU', lat: 3.7, lon: 101 }], { ATIMU: [0, 0] })
    expect(points[1]).toMatchObject({ lat: 3.7, lng: 101 })
  })
})
