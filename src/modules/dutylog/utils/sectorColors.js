// The 8 sector colours, used everywhere a duty's sectors are coloured: the editor's rows and open-sector frame, the
// coloured strip on each duty in the Duty Log list, and the read-only view of a cloud log. In this order neighbours
// never look alike (teal/green/sky, peach/yellow and rose/pink/violet are each kept apart).
export const sectorRowColors = ['var(--cp-acc)', '#f43f5e', 'var(--cp-yellow)', '#a78bfa', 'var(--cp-orange)', '#38bdf8', 'var(--cp-green)', '#e879f9']
// The two aircraft colours: deliberately unlike every sector colour above (a dark ochre-brown and a deep ultramarine,
// where all the sector colours are bright), so an aircraft frame or chip is never mistaken for a sector.
export const aircraftStripeColors = ['#825717', '#3b00eb']
// An aircraft's chip: solid, with white text (the colours are too dark to read as text on the dark card).
export const aircraftChip = (color) => ({ border: `1px solid ${color}`, background: color, color: '#fff', fontWeight: 700 })
