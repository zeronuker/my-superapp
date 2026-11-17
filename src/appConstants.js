import { CHANGELOG } from './changelog'
import { currentVersion } from '@brand/Changelog'

// Single source of truth: the displayed version is always the newest
// changelog entry, so it can never drift out of sync with the changelog.
export const APP_VERSION = currentVersion(CHANGELOG)

// Matches elogbook's ACCENT_PRESETS (src/SettingsModal.jsx) — same ids, same hex values.
export const ACCENT_SWATCHES = [
  { value: 'gradient', color: '#3FE0C5', colors: ['#3FE0C5', '#3B8DFF', '#5B6BFF'] },
  { value: 'emerald',  color: '#10d983' },
  { value: 'gold',     color: '#eab308' },
  { value: 'rose',     color: '#f43f5e' },
  { value: 'violet',   color: '#a855f7' },
]

// Old swatch ids from before the palette was cut to elogbook's five — kept so previously
// saved/exported settings still resolve to a valid accent.
export const ACCENT_MIGRATION = {
  teal: 'gradient', green: 'emerald',
  mint: 'gradient', blue: 'gradient', cyan: 'gradient', amber: 'gold', coral: 'gold',
}
export const resolveAccentId = (id) => ACCENT_MIGRATION[id] || id || 'gradient'
