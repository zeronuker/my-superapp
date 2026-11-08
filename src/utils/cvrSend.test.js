import { describe, it, expect, beforeAll } from 'vitest'

// public/cvr-send.js runs from a bookmark on the CVR site; with no document it only exposes its
// one bit of parsing — reading a flight off a Voyage Reports roster row.
let parseRow
beforeAll(async () => {
  await import('../../public/cvr-send.js')
  parseRow = globalThis.__cbParseRow
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

  it('gives null for a row with no report number, or flight text it cannot read', () => {
    expect(parseRow('cvrToggleSidebar()', TEXT)).toBeNull()
    expect(parseRow('viewReportDetails(156400)', 'Flight OD391')).toBeNull()
    expect(parseRow('', '')).toBeNull()
  })
})
