import { create } from 'zustand'
import { loadWithExpiry } from '../utils/cacheExpiry'

// Same offline-persistence pattern every other module uses (cb-*-cache +
// loadWithExpiry's 12h TTL) — a briefing survives a reload/offline reopen,
// not just an in-session tab switch.
const BRIEFING_CACHE_KEY = 'cb-briefing-cache'

// Rejects anything that isn't a well-formed cached briefing (a stale shape
// from an older build, a partial write, etc.) rather than trusting it and
// letting BriefingView try to render garbage.
function isValidBriefingCache(cached) {
  return !!cached
    && cached.route && typeof cached.route === 'object'
    && (typeof cached.route.dep === 'string' || typeof cached.route.arr === 'string')
    && cached.data && typeof cached.data === 'object'
    && Array.isArray(cached.data.airports)
}
function loadBriefingCache() {
  const cached = loadWithExpiry(BRIEFING_CACHE_KEY)
  if (!isValidBriefingCache(cached)) {
    try { localStorage.removeItem(BRIEFING_CACHE_KEY) } catch (_) {}
    return { open: false, route: null, data: null }
  }
  return { open: false, route: cached.route, data: cached.data }
}
function saveBriefingCache(route, data) {
  try {
    if (!data) { localStorage.removeItem(BRIEFING_CACHE_KEY); return }
    localStorage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ route, data, fetchedAt: data.fetchedAt }))
  } catch (_) {}
}

export const DEFAULT_SETTINGS = {
  fontScale:      'normal',   // 'compact' | 'normal' | 'large' | 'cockpit'
  defaultTab:     'calculator',
  haptic:         true,
  hapticIntensity:'medium',   // 'light' | 'medium' | 'heavy' — global strength
  numberFormat:   'en',       // 'en' (1,000.00) | 'eu' (1.000,00)
  defaultHistory: 3,
  autoRefresh:    true,
  tabOrder:       ['calculator', 'interpolation', 'b737perf', 'currency', 'metartaf', 'notam', 'ftl', 'dutylog', 'worldtime', 'prayer'],
  navStyle:       'launcher', // 'launcher' | 'tabs' | 'grouped'
  tabPosition:    'top',      // 'top' | 'bottom'  (only used when navStyle === 'tabs')
  notamSort:      'relevance',// 'relevance' | 'category'  (NOTAM sort within a location)
  themeMode:      'dark',     // 'dark' | 'light' | 'auto'  (auto follows system)
  accentColor:    'teal',     // 'teal' | 'amber' | 'cyan' | 'violet' | 'green'
  highContrast:   false,      // cockpit / bright-light readability mode
  cardStyle:      'elevated', // 'flat' | 'elevated' | 'glass'
  iconSet:        'classic',  // 'classic' (emoji) | image set id from ICON_SETS
  clockFormat:    '24hr',     // '24hr' | '12hr' — global, applies to all clocks
  rememberLastTab:true,       // reopen last-used tool on app restart
  dashboardWidgets: { utc: true, prayer: true, metar: true },
}

export const DEFAULT_CURRENCY_BASE = 'MYR'
export const DEFAULT_CURRENCY_LIST = ['AUD', 'JPY', 'IDR', 'SGD', 'CNY', 'AED', 'USD', 'INR', 'KRW']

function loadCurrencyPrefs() {
  try {
    const raw = localStorage.getItem('cb-currency-prefs-v2')
    if (!raw) return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST }
    const parsed = JSON.parse(raw)
    return {
      base: parsed.base || DEFAULT_CURRENCY_BASE,
      list: Array.isArray(parsed.list) && parsed.list.length ? parsed.list : DEFAULT_CURRENCY_LIST,
    }
  } catch (_) { return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST } }
}
function saveCurrencyPrefs(base, list) {
  try { localStorage.setItem('cb-currency-prefs-v2', JSON.stringify({ base, list })) } catch (_) {}
}

function loadSettings() {
  try {
    const s = localStorage.getItem('cb-settings')
    if (!s) return DEFAULT_SETTINGS
    const parsed = JSON.parse(s)
    const merged = { ...DEFAULT_SETTINGS, ...parsed }
    // Deep-merge nested objects so partial saved values don't drop new keys
    merged.dashboardWidgets = { ...DEFAULT_SETTINGS.dashboardWidgets, ...(parsed.dashboardWidgets || {}) }
    // Migrate: derive themeMode from the old cb-theme flag on first run
    if (!parsed.themeMode) {
      try {
        const t = localStorage.getItem('cb-theme')
        merged.themeMode = t === 'light' ? 'light' : 'dark'
      } catch (_) { merged.themeMode = 'dark' }
    }
    return merged
  } catch (_) { return DEFAULT_SETTINGS }
}

export const useCalculatorStore = create((set) => ({
  // ── Calculator state ────────────────────────────────────────────────────
  edto: {
    aircraft: 'b737-8', variant: 'leap-1b25', weight: '',
    isaDeviation: '', antiIce: 'none',
    longRangeCruiseAlt: null, kias310Alt: null,
  },
  goAround: {
    aircraft: 'b737-8', variant: 'leap-1b25', weight: '',
    oat: '', pressureAltitude: '', speedOffset: '',
    bleedConfig: 'packsOn', antiIce: 'none', icingConditions: false,
    results: null,
  },
  quickTurnaround: {
    aircraft: 'b737-8', brakeType: 'steel',
    oat: '', pressureAltitude: '', slopePercent: '', windComponent: '', landingWeight: '',
    results: null,
  },
  normal:     { display: '0', previousValue: 0, operation: null, expression: '', clearNext: false },
  scientific: { display: '0', expression: '' },
  time: {
    digits: '', multiplier: '', prevMinutes: null, operation: null,
    isMultiplierMode: false, expression: '', result: null, justCalculated: false,
  },
  currency:      { amount: '', ...loadCurrencyPrefs() },
  interpolation: {
    zValues: [''],
    rows: [{ x: '', ys: [''] }, { x: '', ys: [''] }, { x: '', ys: [''] }],
    lookupX: '', lookupZ: '', result: '',
  },

  // ── UI state ────────────────────────────────────────────────────────────
  darkMode: (() => {
    try { const s = localStorage.getItem('cb-theme'); if (s === 'light') return false } catch (_) {}
    return true
  })(),
  activeCalculator: (() => {
    try {
      const s = localStorage.getItem('cb-settings')
      if (s) { const p = JSON.parse(s); if (p.defaultTab) return p.defaultTab }
    } catch (_) {}
    return 'calculator'
  })(),

  // ── Settings ────────────────────────────────────────────────────────────
  settings: loadSettings(),

  // ── Briefing (cross-module overlay) ────────────────────────────────────
  // Lives here (not local component state) so it survives a tab switch —
  // jumping from the overlay to the standalone NOTAM tab must not lose the
  // already-fetched briefing. `route` is the input the 3 modules hand in
  // (dep/arr/destAlts/enrouteCount/enrouteAlts/firs); `data` is the fetched
  // result, filled in once by BriefingView and left alone after that.
  // Seeded from cb-briefing-cache on load (open:false — never auto-pops the
  // overlay open, but the Resume pill is there if a cached briefing exists).
  briefing: loadBriefingCache(),

  // ── Actions ─────────────────────────────────────────────────────────────
  setEDTOAircraft:   (aircraft)  => set(s => ({ edto: { ...s.edto, aircraft, variant: null } })),
  setEDTOVariant:    (variant)   => set(s => ({ edto: { ...s.edto, variant } })),
  setEDTOWeight:     (weight)    => set(s => ({ edto: { ...s.edto, weight } })),
  setEDTOIsaDeviation: (v)       => set(s => ({ edto: { ...s.edto, isaDeviation: v } })),
  setEDTOAntiIce:    (antiIce)   => set(s => ({ edto: { ...s.edto, antiIce } })),
  setEDTOResults:    (l, k)      => set(s => ({ edto: { ...s.edto, longRangeCruiseAlt: l, kias310Alt: k } })),
  setGoAroundAircraft: (aircraft) => set(s => ({ goAround: { ...s.goAround, aircraft, variant: null } })),
  setGoAroundVariant:  (variant)  => set(s => ({ goAround: { ...s.goAround, variant } })),
  setGoAroundField:    (partial)  => set(s => ({ goAround: { ...s.goAround, ...partial } })),
  setGoAroundResults:  (results)  => set(s => ({ goAround: { ...s.goAround, results } })),
  setQuickTurnaroundAircraft: (aircraft) => set(s => ({ quickTurnaround: { ...s.quickTurnaround, aircraft } })),
  setQuickTurnaroundField:    (partial)  => set(s => ({ quickTurnaround: { ...s.quickTurnaround, ...partial } })),
  setQuickTurnaroundResults:  (results)  => set(s => ({ quickTurnaround: { ...s.quickTurnaround, results } })),
  setNormal:         (partial)   => set(s => ({ normal: { ...s.normal, ...partial } })),
  setScientificDisplay: (d)      => set(s => ({ scientific: { ...s.scientific, display: d } })),
  setScientific:     (partial)   => set(s => ({ scientific: { ...s.scientific, ...partial } })),
  setTime:           (partial)   => set(s => ({ time: { ...s.time, ...partial } })),
  setCurrencyAmount: (amount)    => set(s => ({ currency: { ...s.currency, amount } })),
  setCurrencyBase:   (base)      => set(s => {
    const list = s.currency.list.filter(c => c !== base) // base can't also appear in the output list
    saveCurrencyPrefs(base, list)
    return { currency: { ...s.currency, base, list } }
  }),
  setCurrencyList:   (list)      => set(s => {
    saveCurrencyPrefs(s.currency.base, list)
    return { currency: { ...s.currency, list } }
  }),
  resetCurrency:     ()          => set(() => {
    saveCurrencyPrefs(DEFAULT_CURRENCY_BASE, DEFAULT_CURRENCY_LIST)
    return { currency: { amount: '', base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST } }
  }),
  setInterpolation:  (partial)   => set(s => ({ interpolation: { ...s.interpolation, ...partial } })),
  toggleDarkMode:    ()          => set(s => ({ darkMode: !s.darkMode })),
  setDarkMode:       (v)         => set({ darkMode: v }),
  setActiveCalculator: (id)      => set({ activeCalculator: id }),

  // route: { dep, arr, destAlts, enrouteCount, enrouteAlts, firs }. Starts a
  // fresh fetch — data:null tells BriefingView to fetch rather than reuse.
  openBriefing:     (route)      => set({ briefing: { open: true, route, data: null } }),
  setBriefingData:  (data)       => set(s => {
    saveBriefingCache(s.briefing.route, data)
    return { briefing: { ...s.briefing, data } }
  }),
  // Hide without discarding — used when the pilot jumps to the standalone
  // NOTAM tab so the same fetched briefing is still there to come back to.
  pauseBriefing:    ()           => set(s => ({ briefing: { ...s.briefing, open: false } })),
  resumeBriefing:   ()           => set(s => ({ briefing: { ...s.briefing, open: true } })),
  // Full discard — the ✕ button and Escape/backdrop dismiss.
  closeBriefing:    ()           => set(() => {
    saveBriefingCache(null, null)
    return { briefing: { open: false, route: null, data: null } }
  }),

  updateSettings: (partial) => set(s => {
    const next = { ...s.settings, ...partial }
    try { localStorage.setItem('cb-settings', JSON.stringify(next)) } catch (_) {}
    return { settings: next }
  }),
}))
