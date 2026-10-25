// Reads a PDF's text as lines, for ofpParse.js's parseOfpPdf. pdfjs-dist is
// loaded only when a PDF is actually chosen, so it stays out of the main bundle.

// pdfjs text items ({ str, transform: [.., .., .., .., x, y], width }) -> one
// string per visual line, top to bottom, items left to right. A gap wider than
// a space between two items becomes a space; runs of spaces collapse to one.
export function itemsToLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str) continue
    const y = it.transform[5]
    const row = rows.find(r => Math.abs(r.y - y) <= 2)
    if (row) row.items.push(it)
    else rows.push({ y, items: [it] })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map(({ items: its }) => {
      its.sort((a, b) => a.transform[4] - b.transform[4])
      let line = ''
      let end = null
      for (const it of its) {
        const x = it.transform[4]
        if (end !== null && x - end > 1 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' '
        line += it.str
        end = x + (it.width || 0)
      }
      return line.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
}

/** @param {ArrayBuffer} buffer  the PDF file */
export async function pdfToLines(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    lines.push(...itemsToLines((await page.getTextContent()).items))
  }
  return lines
}
