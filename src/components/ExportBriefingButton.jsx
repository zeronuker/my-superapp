import { useState } from 'react'
import ExportBriefingModal from './ExportBriefingModal'
import { pdfSections, buildPdfModel } from '../utils/briefingPdf'

// The download icon on a saved briefing's row, and the Export PDF dialog it opens.
// `link` is the saved briefing's duty-log link (links.bySave.get(id)), if any: the
// linked sector goes into the PDF.
export default function ExportBriefingButton({ entry, link, dutyLogs }) {
  const [open, setOpen] = useState(false)
  const log = link ? dutyLogs.find(l => l.id === link.logId) : null
  const sector = log?.sectors.find(s => s.id === link.sectorId)
  const input = {
    route: entry.route, data: entry.data, name: entry.name, savedAt: entry.savedAt,
    mapSnapshot: entry.mapSnapshot ?? null, duty: sector ? { log, sector } : null,
  }
  const sections = pdfSections(input)
  if (!sections.length) return null
  // The span keeps clicks (the dialog's too, React events bubble out of portals) from
  // reaching the row, which opens the briefing when tapped.
  return (
    <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
      <button onClick={() => setOpen(true)} className="cp-btn" aria-label={`Export PDF of ${entry.name}`} title="Export PDF"
        style={{ width: 24, height: 22, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cp-acc)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" />
        </svg>
      </button>
      <ExportBriefingModal open={open} title={entry.name} sections={sections}
        onExport={async (selection, opts) => {
          // jsPDF and the fonts load only now, so the list itself stays light.
          const { exportBriefingPdf } = await import('../services/briefingPdfRender')
          await exportBriefingPdf(buildPdfModel(input, selection), opts)
        }}
        onCancel={() => setOpen(false)} />
    </span>
  )
}
