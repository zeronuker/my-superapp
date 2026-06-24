import { create } from 'zustand'

export const DEFAULT_SETTINGS = {
  fontScale:      'normal',   // 'compact' | 'normal' | 'large' | 'cockpit'
  defaultTab:     'calculator',
  haptic:         true,
  hapticIntensity:'medium',   // 'light' | 'medium' | 'heavy' — global strength
  numberFormat:   'en',       // 'en' (1,000.00) | 'eu' (1.000,00)
  defaultHistory: 3,
  autoRefresh:    true,
  tabOrder:       ['calculator', 'interpolation', 'edto', 'currency', 'metartaf', 'notam', 'ftl', 'dutylog', 'worldtime', 'prayer'],
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
  units: {                    // stored preference for future calculators
    temp:       'c',          // 'c' | 'f'
    wind:       'kt',         // 'kt' | 'kmh' | 'ms'
    visibility: 'm',          // 'm' | 'sm'
    altitude:   'ft',         // 'ft' | 'm'
    pressure:   'hpa',        // 'hpa' | 'inhg'
  },
}

export const DEFAULT_CURRENCY_BASE = 'USD'
export const DEFAULT_CURRENCY_LIST = ['EUR', 'GBP', 'JPY', 'AUD', 'AED', 'SGD', 'INR', 'CHF']

function loadCurrencyPrefs() {
  try {
    const raw = localStorage.getItem('cb-currency-prefs')
    if (!raw) return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST }
    const parsed = JSON.parse(raw)
    return {
      base: parsed.base || DEFAULT_CURRENCY_BASE,
      list: Array.isArray(parsed.list) && parsed.list.length ? parsed.list : DEFAULT_CURRENCY_LIST,
    }
  } catch (_) { return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST } }
}
function saveCurrencyPrefs(base, list) {
  try { localStorage.setItem('cb-currency-prefs', JSON.stringify({ base, list })) } catch (_) {}
}

function loadSettings() {
  try {
    const s = localStorage.getItem('cb-settings')
    if (!s) return DEFAULT_SETTINGS
    const parsed = JSON.parse(s)
    const merged = { ...DEFAULT_SETTINGS, ...parsed }
    // Deep-merge nested objects so partial saved values don't drop new keys
    merged.units = { ...DEFAULT_SETTINGS.units, ...(parsed.units || {}) }
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
  normal:     { display: '0', previousValue: 0, operation: null, expression: '', clearNext: false },
  scientific: { display: '0' },
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

  // ── Actions ─────────────────────────────────────────────────────────────
  setEDTOAircraft:   (aircraft)  => set(s => ({ edto: { ...s.edto, aircraft, variant: null } })),
  setEDTOVariant:    (variant)   => set(s => ({ edto: { ...s.edto, variant } })),
  setEDTOWeight:     (weight)    => set(s => ({ edto: { ...s.edto, weight } })),
  setEDTOIsaDeviation: (v)       => set(s => ({ edto: { ...s.edto, isaDeviation: v } })),
  setEDTOAntiIce:    (antiIce)   => set(s => ({ edto: { ...s.edto, antiIce } })),
  setEDTOResults:    (l, k)      => set(s => ({ edto: { ...s.edto, longRangeCruiseAlt: l, kias310Alt: k } })),
  setNormal:         (partial)   => set(s => ({ normal: { ...s.normal, ...partial } })),
  setScientificDisplay: (d)      => set(s => ({ scientific: { ...s.scientific, display: d } })),
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

  updateSettings: (partial) => set(s => {
    const next = { ...s.settings, ...partial }
    try { localStorage.setItem('cb-settings', JSON.stringify(next)) } catch (_) {}
    return { settings: next }
  }),
}))
