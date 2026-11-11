import { describe, it, expect, beforeAll } from 'vitest'

// public/cvr-send.js runs from a bookmark on the CVR site; with no document it only exposes its
// two bits of logic: reading a flight off a Voyage Reports roster row, and choosing the package to take.
let parseRow, pickOfp
beforeAll(async () => {
  await import('../../public/cvr-send.js')
  parseRow = globalThis.__cbParseRow
  pickOfp = globalThis.__cbPickOfp
})

const TEXT = '\n  OD1703 |\n TWU   BKI | 07-Nov-2026 | PIC AMIR RASHID … 9M-LNQ 140706 Submitted'

describe('cvr-send.js parseRow', () => {
  it('a submitted row: takes everything from its Flight Plan button', () => {
    const attrs = `event.stopPropagation(); viewFlightPlan(156328, 'OD1703TWUBKI', 'OD1703 TWU-BKI 07-Nov-2026') viewReportDetails(156328)`
    expect(parseRow(attrs, TEXT)).toEqual({ reportId: '156328', sector: 'OD1703TWUBKI', label: 'OD1703 TWU-BKI 07-Nov-2026', hasPlan: true })
  })

  it('a row with no Flight Plan button yet: report number from its other buttons, flight from its text', () => {
    const expected = { reportId: '156400', sector: 'OD1703TWUBKI', label: 'OD1703 TWU-BKI 07-Nov-2026', hasPlan: false }
    expect(parseRow('viewReportDetails(156400)', TEXT)).toEqual(expected)
    expect(parseRow('sendReportEmail(156400)', TEXT)).toEqual(expected)
    expect(parseRow('/VoyageReports/ExportReportPdf?reportId=156400', TEXT)).toEqual(expected)
  })

  it('a row it cannot send: says why and what the row\'s buttons call; an empty row is null', () => {
    expect(parseRow('event.stopPropagation(); cvrToggleSidebar()', TEXT))
      .toEqual({ skip: 'no report number yet', label: 'OD1703 TWU-BKI 07-Nov-2026', has: ['cvrToggleSidebar'] })
    expect(parseRow('', TEXT)).toEqual({ skip: 'no report number yet', label: 'OD1703 TWU-BKI 07-Nov-2026', has: [] })
    expect(parseRow('viewReportDetails(156400) /VoyageReports/ExportReportPdf?reportId=156400', 'Flight OD391'))
      .toEqual({ skip: 'its flight text could not be read', label: 'Flight OD391', has: ['viewReportDetails', '/VoyageReports/ExportReportPdf'] })
    expect(parseRow('', '')).toBeNull()
  })
})

describe('cvr-send.js pickOfp', () => {
  const SECTOR = 'OD1703TWUBKI'
  const files = [{ name: 'PFP.pdf', path: 'a/PFP.pdf' }, { name: 'XmlOFP.txt', path: 'a/XmlOFP.txt' }]
  const pack = (ofpNo, extra = {}) => ({ objectKey: `flightplans/20261107T054500${SECTOR}/${ofpNo}.zip`, matchesSector: true, readable: true, files, ...extra })

  it('takes this sector\'s package and its XmlOFP', () => {
    const a = pack(140706)
    expect(pickOfp([a], SECTOR)).toEqual({ archive: a, file: files[1], ofpNo: 140706, unsure: false })
  })

  it('a revised OFP: the highest OFP number wins, whatever the order', () => {
    expect(pickOfp([pack(140706), pack(140911), pack(140800)], SECTOR).ofpNo).toBe(140911)
  })

  it('never takes another sector\'s package when there are several', () => {
    const other = { objectKey: 'flightplans/20261107T080000OD1704BKITWU/140707.zip', matchesSector: false, readable: true, files }
    expect(pickOfp([other, pack(140706)], SECTOR).ofpNo).toBe(140706)
    expect(() => pickOfp([other, { ...other, objectKey: 'flightplans/x/1.zip' }], SECTOR)).toThrow(/2 packages.*none of them for this sector/)
  })

  it('knows its sector from the package name when CVR does not mark it', () => {
    expect(pickOfp([pack(140706, { matchesSector: false })], SECTOR).unsure).toBe(false)
  })

  it('the report\'s only package, not marked as this sector: taken, flagged unsure', () => {
    const only = { objectKey: 'flightplans/x/140706.zip', readable: true, files }
    expect(pickOfp([only], SECTOR)).toMatchObject({ archive: only, unsure: true })
  })

  it('reads the XmlOFP name loosely', () => {
    const f = [{ name: 'xmlofp.XML', path: 'p' }]
    expect(pickOfp([pack(1, { files: f })], SECTOR).file).toBe(f[0])
  })

  it('says which part is missing', () => {
    expect(() => pickOfp([], SECTOR)).toThrow(/no flight plan package/)
    expect(() => pickOfp(undefined, SECTOR)).toThrow(/no flight plan package/)
    expect(() => pickOfp([pack(1, { readable: false })], SECTOR)).toThrow(/cannot be read yet/)
    expect(() => pickOfp([pack(1, { files: [{ name: 'PFP.pdf' }, { name: 'PFB.pdf' }] })], SECTOR)).toThrow(/no XmlOFP. It holds: PFP.pdf, PFB.pdf/)
  })
})
