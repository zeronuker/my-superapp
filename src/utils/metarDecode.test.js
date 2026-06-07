import { describe, it, expect } from 'vitest'
import {
  decodeWeather,
  decodeWind,
  decodeWindToken,
  decodeVisToken,
  decodeCloudToken,
  decodeMetar,
  decodeTaf,
} from './metarDecode'

describe('decodeWeather', () => {
  it('intensity + descriptor + phenomenon', () => {
    expect(decodeWeather('+TSRA')).toBe('Heavy thunderstorm with rain')
    expect(decodeWeather('-RA')).toBe('Light rain')
    expect(decodeWeather('TSRA')).toBe('Thunderstorm with rain')
  })
  it('descriptor alone', () => {
    expect(decodeWeather('TS')).toBe('Thunderstorm')
  })
  it('freezing / showers / vicinity / recent', () => {
    expect(decodeWeather('FZFG')).toBe('Freezing fog')
    expect(decodeWeather('SHRA')).toBe('Showers of rain')
    expect(decodeWeather('VCSH')).toBe('Showers in the vicinity')
    expect(decodeWeather('RETSRA')).toBe('Recent thunderstorm with rain')
  })
  it('simple phenomena', () => {
    expect(decodeWeather('BR')).toBe('Mist')
    expect(decodeWeather('FG')).toBe('Fog')
  })
  it('multiple phenomena joined', () => {
    expect(decodeWeather('RASN')).toBe('Rain and snow')
  })
  it('returns the raw token when unrecognised', () => {
    expect(decodeWeather('Q1010')).toBe('Q1010')
  })
})

describe('decodeWind', () => {
  it('direction, speed and gust', () => {
    expect(decodeWind(240, 22, 34)).toBe('240° at 22 kt, gusting 34 kt')
  })
  it('variable wind', () => {
    expect(decodeWind('VRB', 3, null)).toBe('Variable at 3 kt')
  })
  it('calm', () => {
    expect(decodeWind(0, 0, null)).toBe('Calm')
  })
})

describe('decodeWindToken', () => {
  it('parses a gusting wind token', () => {
    expect(decodeWindToken('24022G34KT')).toBe('240° at 22 kt, gusting 34 kt')
  })
  it('parses variable', () => {
    expect(decodeWindToken('VRB03KT')).toBe('Variable at 3 kt')
  })
  it('parses calm', () => {
    expect(decodeWindToken('00000KT')).toBe('Calm')
  })
  it('returns null for a non-wind token', () => {
    expect(decodeWindToken('9999')).toBeNull()
  })
})

describe('decodeVisToken', () => {
  it('9999 → 10 km or more', () => {
    expect(decodeVisToken('9999')).toBe('10 km or more')
  })
  it('4-digit metres', () => {
    expect(decodeVisToken('0800')).toBe('800 m')
    expect(decodeVisToken('6000')).toBe('6,000 m')
  })
  it('CAVOK', () => {
    expect(decodeVisToken('CAVOK')).toBe('Ceiling and visibility OK')
  })
  it('statute miles with P/M prefixes', () => {
    expect(decodeVisToken('P6SM')).toBe('More than 6 SM')
    expect(decodeVisToken('M1/4SM')).toBe('Less than 1/4 SM')
  })
  it('returns null for non-visibility tokens', () => {
    expect(decodeVisToken('BKN025')).toBeNull()
  })
})

describe('decodeCloudToken', () => {
  it('decodes cover + base', () => {
    expect(decodeCloudToken('BKN025')).toBe('Broken at 2,500 ft')
    expect(decodeCloudToken('FEW018')).toBe('Few at 1,800 ft')
  })
  it('notes convective type', () => {
    expect(decodeCloudToken('OVC010CB')).toBe('Overcast at 1,000 ft (cumulonimbus)')
    expect(decodeCloudToken('SCT030TCU')).toBe('Scattered at 3,000 ft (towering cumulus)')
  })
  it('special codes', () => {
    expect(decodeCloudToken('NSC')).toBe('No significant cloud')
    expect(decodeCloudToken('SKC')).toBe('Sky clear')
  })
  it('returns null for non-cloud tokens', () => {
    expect(decodeCloudToken('24015KT')).toBeNull()
  })
})

describe('decodeMetar', () => {
  const m = {
    rawOb: 'METAR WMKK 070630Z 24015G28KT 6000 -TSRA FEW018 BKN025CB 31/24 Q1010 NOSIG',
    wdir: 240, wspd: 15, wgst: 28, temp: 31, dewp: 24, altim: 1010,
  }
  it('produces ordered rows', () => {
    const rows = decodeMetar(m)
    const get = label => rows.find(r => r.label === label)?.value

    expect(get('Wind')).toBe('240° at 15 kt, gusting 28 kt')
    expect(get('Visibility')).toBe('6,000 m')
    expect(get('Weather')).toBe('Light thunderstorm with rain')
    expect(get('Cloud')).toBe('Few at 1,800 ft, Broken at 2,500 ft (cumulonimbus)')
    expect(get('Temp / Dew')).toBe('31°C / 24°C  (spread 7°C)')
    expect(get('QNH')).toBe('1010 hPa')
    expect(get('Trend')).toBe('No significant change')
  })
  it('returns [] for null input', () => {
    expect(decodeMetar(null)).toEqual([])
  })
})

describe('decodeTaf', () => {
  const raw =
    'TAF WMKK 121130Z 1212/1318 24015KT 9999 BKN025\n' +
    'FM121800 28025G38KT 6000 -RA BKN010\n' +
    'TEMPO 1218/1222 2000 TSRA BKN006CB'

  it('decodes each period with a header and items', () => {
    const out = decodeTaf(raw)
    expect(out).toHaveLength(3)

    expect(out[0].type).toBe('BASE')
    expect(out[0].header).toContain('valid')
    expect(out[0].items).toContain('Wind: 240° at 15 kt')
    expect(out[0].items).toContain('Visibility: 10 km or more')

    expect(out[1].type).toBe('FM')
    expect(out[1].header).toBe('From 12 18:00Z')
    expect(out[1].items).toContain('Wind: 280° at 25 kt, gusting 38 kt')

    expect(out[2].type).toBe('TEMPO')
    expect(out[2].isTemporal).toBe(true)
    expect(out[2].items.some(i => i.includes('Thunderstorm with rain'))).toBe(true)
  })

  it('returns null for empty input', () => {
    expect(decodeTaf(null)).toBeNull()
  })
})
