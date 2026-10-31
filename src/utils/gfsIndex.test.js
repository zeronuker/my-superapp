import { describe, it, expect } from 'vitest'
import {
  cycleCandidates, forecastStep, gfsFileUrl, gfsIndexUrl, parseGfsIndex, messageRange, pressureLevelName, WIND_LEVELS,
} from './gfsIndex'

const T = Date.UTC(2026, 9, 31, 10, 42)

// real lines from gfs.t06z.pgrb2.1p00.f003.idx
const IDX = [
  '276:17777427:d=2026103106:UGRD:250 mb:3 hour fcst:',
  '277:17830478:d=2026103106:VGRD:250 mb:3 hour fcst:',
  '278:17884622:d=2026103106:ABSV:250 mb:3 hour fcst:',
  '',
  'garbage line',
].join('\n')

describe('gfsIndex', () => {
  it('lists the runs that should exist, newest first, 6 hours apart', () => {
    const c = cycleCandidates(T, 3)
    expect(c.map(x => `${x.date} ${x.hour}`)).toEqual(['20261031 6', '20261031 0', '20261030 18'])
    expect(c[0].runMs - c[1].runMs).toBe(6 * 3600000)
  })

  it('does not offer a run that has not started publishing yet', () => {
    expect(cycleCandidates(Date.UTC(2026, 9, 31, 12, 5))[0].hour).toBe(6)     // 12Z run not out at 12:05
    expect(cycleCandidates(Date.UTC(2026, 9, 31, 15, 40))[0].hour).toBe(12)
  })

  it('picks the forecast hour (a multiple of 3) closest to the time wanted', () => {
    const run = Date.UTC(2026, 9, 31, 6)
    expect(forecastStep(run, Date.UTC(2026, 9, 31, 10, 42))).toBe(6)           // 4.7 h → 6
    expect(forecastStep(run, Date.UTC(2026, 9, 31, 7, 20))).toBe(0)
    expect(forecastStep(run, run - 5 * 3600000)).toBe(0)                       // already past: analysis
    expect(forecastStep(run, run + 1000 * 3600000)).toBe(384)
  })

  it('builds the file and index addresses', () => {
    const c = { date: '20261031', hour: 6 }
    expect(gfsFileUrl(c, 3)).toBe('https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261031/06/atmos/gfs.t06z.pgrb2.1p00.f003')
    expect(gfsIndexUrl(c, 3)).toMatch(/f003\.idx$/)
  })

  it('reads the index and finds a message range', () => {
    const msgs = parseGfsIndex(IDX)
    expect(msgs).toHaveLength(3)
    expect(messageRange(msgs, 'UGRD', pressureLevelName(250))).toEqual({ start: 17777427, end: 17830477 })
    expect(messageRange(msgs, 'VGRD', '250 mb')).toEqual({ start: 17830478, end: 17884621 })
    expect(messageRange(msgs, 'UGRD', '300 mb')).toBeNull()
    expect(messageRange(msgs, 'ABSV', '250 mb')).toBeNull()                    // last message: no end known
  })

  it('refuses an index that is really an error page', () => {
    expect(() => parseGfsIndex('<html>NoSuchKey</html>')).toThrow(/malformed/)
  })

  it('maps flight levels to pressure levels GFS publishes', () => {
    expect(WIND_LEVELS.find(l => l.fl === 340).hpa).toBe(250)
    expect(WIND_LEVELS.map(l => l.fl)).toEqual([100, 180, 240, 300, 340, 390])
  })
})
