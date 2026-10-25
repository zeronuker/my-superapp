// Reads a chosen OFP file (the XmlOFP text or the PFP PDF) and parses it.
// Never throws: resolves to ofpParse's { ok, ... } or { ok: false, error }.
// The file stays on the device — nothing is uploaded.

import { parseOfpXml, parseOfpPdf } from '../utils/ofpParse'
import { pdfToLines } from '../utils/pdfText'

export async function readOfpFile(file) {
  try {
    const buf = await file.arrayBuffer()
    const text = new TextDecoder()
    if (text.decode(buf.slice(0, 5)) === '%PDF-') return parseOfpPdf(await pdfToLines(buf))
    return parseOfpXml(text.decode(buf))
  } catch (_) {
    return { ok: false, error: "Couldn't read that file." }
  }
}
