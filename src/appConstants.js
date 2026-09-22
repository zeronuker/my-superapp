import { CHANGELOG } from './changelog'
import { currentVersion } from '@brand/Changelog'

// Single source of truth: the displayed version is always the newest
// changelog entry, so it can never drift out of sync with the changelog.
export const APP_VERSION = currentVersion(CHANGELOG)

// Matches elogbook's ACCENT_PRESETS (src/SettingsModal.jsx) — same ids, same hex values.
export const ACCENT_SWATCHES = [
  { value: 'gradient', color: '#3FE0C5', colors: ['#3FE0C5', '#3B8DFF', '#5B6BFF'] },
  { value: 'mint',     color: '#3FE0C5' },
  { value: 'blue',     color: '#3B8DFF' },
  { value: 'violet',   color: '#5B6BFF' },
  { value: 'amber',    color: '#FFB37C' },
  { value: 'emerald',  color: '#10d983' },
  { value: 'rose',     color: '#f43f5e' },
  { value: 'cyan',     color: '#06b6d4' },
  { value: 'gold',     color: '#eab308' },
  { value: 'coral',    color: '#f97316' },
]

// Old swatch ids from before the cross-app palette merge — kept so previously
// saved/exported settings still resolve to a valid accent.
export const ACCENT_MIGRATION = { teal: 'gradient', green: 'emerald' }
export const resolveAccentId = (id) => ACCENT_MIGRATION[id] || id || 'gradient'
