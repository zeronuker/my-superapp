import { create } from 'zustand'
import { makeBriefingId, autoBriefingName, sortByNewest, pickNextAfterDelete } from '../utils/savedBriefings'

// Named, manually-managed saves (unlike every cb-*-cache key, which is a
// single slot with a 12h auto-expiry) — never expires, capped, only changed
// by an explicit save/rename/delete.
const BRIEFING_SAVES_KEY = 'cb-briefing-saves'
export const BRIEFING_SAVES_CAP = 30
// Pre-Saved-Briefings single-slot cache (open:false pause/resume) — actively
// discarded, not migrated, the first time this loads post-update.
const LEGACY_BRIEFING_CACHE_KEY = 'cb-briefing-cache'

function loadSavedBriefings() {
  try { localStorage.removeItem(LEGACY_BRIEFING_CACHE_KEY) } catch (_) {}
  try {
    const raw = localStorage.getItem(BRIEFING_SAVES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) { return [] }
}
function persistSavedBriefings(saves) {
  try { localStorage.setItem(BRIEFING_SAVES_KEY, JSON.stringify(saves)) } catch (_) {}
}
// Same route input (dep/arr/destAlts/enrouteAlts) — ignores derived fields
// like firs, which differ by which module opened Briefing.
function routesMatch(a, b) {
  if (!a || !b) return false
  return (a.dep || '') === (b.dep || '') && (a.arr || '') === (b.arr || '')
    && (a.destAlts?.alt1 || '') === (b.destAlts?.alt1 || '')
    && (a.destAlts?.alt2 || '') === (b.destAlts?.alt2 || '')
    && (a.enrouteCount || 0) === (b.enrouteCount || 0)
    && JSON.stringify(a.enrouteAlts || []) === JSON.stringify(b.enrouteAlts || [])
}

export const DEFAULT_SETTINGS = {
  fontScale:      'normal',   // 'compact' | 'normal' | 'large' | 'cockpit'
  defaultTab:     'calculator',
  haptic:         true,
  hapticIntensity:'medium',   // 'light' | 'medium' | 'heavy' — global strength
  numberFormat:   'en',       // 'en' (1,000.00) | 'eu' (1.000,00)
  defaultHistory: 3,
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
export const DEFAULT_QUICK_BASE_CURRENCIES = ['MYR', 'IDR', 'AUD', 'CNY', 'JPY']
export const QUICK_BASE_MAX = 5

function loadCurrencyPrefs() {
  try {
    const raw = localStorage.getItem('cb-currency-prefs-v2')
    if (!raw) return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST, quickBase: DEFAULT_QUICK_BASE_CURRENCIES }
    const parsed = JSON.parse(raw)
    return {
      base: parsed.base || DEFAULT_CURRENCY_BASE,
      list: Array.isArray(parsed.list) && parsed.list.length ? parsed.list : DEFAULT_CURRENCY_LIST,
      quickBase: Array.isArray(parsed.quickBase) && parsed.quickBase.length ? parsed.quickBase : DEFAULT_QUICK_BASE_CURRENCIES,
    }
  } catch (_) { return { base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST, quickBase: DEFAULT_QUICK_BASE_CURRENCIES } }
}
function saveCurrencyPrefs(base, list, quickBase) {
  try { localStorage.setItem('cb-currency-prefs-v2', JSON.stringify({ base, list, quickBase })) } catch (_) {}
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
    // Strip the removed auto-refresh setting rather than leaving it orphaned
    // in storage forever.
    if ('autoRefresh' in merged) {
      delete merged.autoRefresh
      try { localStorage.setItem('cb-settings', JSON.stringify(merged)) } catch (_) {}
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
  brakeCooling: {
    aircraft: 'b737-8', brakeType: 'steel', mode: 'single',
    weight: '', oat: '', pressureAltitude: '', speed: '', windComponent: '',
    event: 'maxMan', reverseThrust: false,
    residualEnergy: '', taxiDistance: '',
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
    zValues: ['', ''],
    rows: [{ x: '', ys: ['', ''] }, { x: '', ys: ['', ''] }, { x: '', ys: ['', ''] }],
    lookupX: '', lookupZ: '', result: '',
  },
  gatefinder: {
    direction: 'D', terminal: 'KLIA', dayKey: 0, criteria: 'flight', query: '',
    results: null,
  },
  ftl: {
    aircraft: 'aeroplane', crewCat: 'flight', crewType: '2crew', acclimatised: true,
    reportTime: '', diffCabinTime: false, cabinReportTime: '',
    sectors: 1, precedingRest: '',
    longRange: false, longestSector: '',
    delayedReporting: false, actualReportTime: '', delayUndisturbed: false,
    positioning: false, positioningReportTime: '',
    standby: false, standbyStart: '', standbyLocation: 'home', homeShortNotice: false,
    ifr: false, ifrType: 'bunk', ifrRest: '',
    reducedRest: false,
    splitDuty: false, splitRest: '', splitPosSector: true,
    picDisc: false, picActualEnd: '', picLastSector: true,
    tzConvert: false, stationOffset: '', hereOffset: '',
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
  // result for the CURRENT session (unsaved unless `savedId` is set).
  // `saves` is the persistent, capped, named list (seeded on load, sorted
  // newest-first) — the only part of this that survives a reload; `open`/
  // `route`/`data`/`savedId` always start closed/empty, same as before.
  briefing: {
    open: false, route: null, data: null, savedId: null,
    saves: sortByNewest(loadSavedBriefings()),
  },

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
  setBrakeCoolingAircraft: (aircraft) => set(s => ({ brakeCooling: { ...s.brakeCooling, aircraft } })),
  setBrakeCoolingField:    (partial)  => set(s => ({ brakeCooling: { ...s.brakeCooling, ...partial } })),
  setBrakeCoolingResults:  (results)  => set(s => ({ brakeCooling: { ...s.brakeCooling, results } })),
  setNormal:         (partial)   => set(s => ({ normal: { ...s.normal, ...partial } })),
  setScientificDisplay: (d)      => set(s => ({ scientific: { ...s.scientific, display: d } })),
  setScientific:     (partial)   => set(s => ({ scientific: { ...s.scientific, ...partial } })),
  setTime:           (partial)   => set(s => ({ time: { ...s.time, ...partial } })),
  setCurrencyAmount: (amount)    => set(s => ({ currency: { ...s.currency, amount } })),
  setCurrencyBase:   (base)      => set(s => {
    const list = s.currency.list.filter(c => c !== base) // base can't also appear in the output list
    saveCurrencyPrefs(base, list, s.currency.quickBase)
    return { currency: { ...s.currency, base, list } }
  }),
  setCurrencyList:   (list)      => set(s => {
    saveCurrencyPrefs(s.currency.base, list, s.currency.quickBase)
    return { currency: { ...s.currency, list } }
  }),
  setQuickBaseCurrencies: (quickBase) => set(s => {
    saveCurrencyPrefs(s.currency.base, s.currency.list, quickBase)
    return { currency: { ...s.currency, quickBase } }
  }),
  resetCurrency:     ()          => set(() => {
    saveCurrencyPrefs(DEFAULT_CURRENCY_BASE, DEFAULT_CURRENCY_LIST, DEFAULT_QUICK_BASE_CURRENCIES)
    return { currency: { amount: '', base: DEFAULT_CURRENCY_BASE, list: DEFAULT_CURRENCY_LIST, quickBase: DEFAULT_QUICK_BASE_CURRENCIES } }
  }),
  setInterpolation:  (partial)   => set(s => ({ interpolation: { ...s.interpolation, ...partial } })),
  setGatefinderField: (partial)  => set(s => ({ gatefinder: { ...s.gatefinder, ...partial } })),
  setFTLField:       (partial)   => set(s => ({ ftl: { ...s.ftl, ...partial } })),
  toggleDarkMode:    ()          => set(s => ({ darkMode: !s.darkMode })),
  setDarkMode:       (v)         => set({ darkMode: v }),
  setActiveCalculator: (id)      => set({ activeCalculator: id }),

  // route: { dep, arr, destAlts, enrouteCount, enrouteAlts, firs }. Starts a
  // fresh, unsaved session — data:null tells BriefingView to fetch — except
  // offline with a SAVED entry for this exact route already on hand, where
  // refetching can only fail: open that save immediately instead.
  openBriefing:     (route)      => set(s => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offline) {
      const match = s.briefing.saves.find(b => routesMatch(b.route, route))
      if (match) return { briefing: { ...s.briefing, open: true, route: match.route, data: match.data, savedId: match.id } }
    }
    return { briefing: { ...s.briefing, open: true, route, data: null, savedId: null } }
  }),
  setBriefingData:  (data)       => set(s => ({ briefing: { ...s.briefing, data } })),
  // Opens an existing save, read-only (Option A — never auto-refreshed).
  openSavedBriefing: (id)        => set(s => {
    const entry = s.briefing.saves.find(b => b.id === id)
    if (!entry) return {}
    return { briefing: { ...s.briefing, open: true, route: entry.route, data: entry.data, savedId: id } }
  }),
  // Instant save, no dialog — `name` optional (defaults to route + date +
  // time). Caller is responsible for the at-cap "delete oldest?" prompt
  // (see deleteSavedBriefing) before calling this past BRIEFING_SAVES_CAP.
  // `mapSnapshot` is a data URL of the Dark map at save time (null if the
  // Dark tab was never opened this session) — the saved offline fallback
  // when the live map can't reload later (see CartoRouteMap.jsx).
  saveBriefing:     (name, mapSnapshot = null) => set(s => {
    const { route, data } = s.briefing
    if (!data) return {}
    const savedAt = Date.now()
    const entry = { id: makeBriefingId(), name: (name || '').trim() || autoBriefingName(route, savedAt), route, data, savedAt, mapSnapshot }
    const saves = sortByNewest([...s.briefing.saves, entry])
    persistSavedBriefings(saves)
    return { briefing: { ...s.briefing, saves, savedId: entry.id } }
  }),
  renameSavedBriefing: (id, name) => set(s => {
    const trimmed = (name || '').trim()
    if (!trimmed) return {}
    const saves = s.briefing.saves.map(b => (b.id === id ? { ...b, name: trimmed } : b))
    persistSavedBriefings(saves)
    return { briefing: { ...s.briefing, saves } }
  }),
  // Manual delete only — saves never auto-expire. Deleting the entry
  // currently open switches the view to the next one in the list, or
  // closes the overlay if none are left.
  deleteSavedBriefing: (id)      => set(s => {
    const sorted = sortByNewest(s.briefing.saves)
    const saves = sorted.filter(b => b.id !== id)
    persistSavedBriefings(saves)
    if (s.briefing.savedId !== id) return { briefing: { ...s.briefing, saves } }
    const nextId = pickNextAfterDelete(sorted, id)
    if (!nextId) return { briefing: { ...s.briefing, saves, open: false, route: null, data: null, savedId: null } }
    const next = saves.find(b => b.id === nextId)
    return { briefing: { ...s.briefing, saves, route: next.route, data: next.data, savedId: nextId } }
  }),
  // Hide without discarding anything — the NOTAM tab-jump link's only
  // caller (useViewAllNotams in BriefingView.jsx). Distinct from
  // closeBriefing: route/data/savedId are left exactly as they were, so
  // resumeBriefing brings back the same in-progress session (saved or not).
  pauseBriefing:    ()           => set(s => ({ briefing: { ...s.briefing, open: false } })),
  resumeBriefing:   ()           => set(s => ({ briefing: { ...s.briefing, open: true } })),
  // Real close — ✕/Escape/tap-outside. BriefingView shows a "save first?"
  // prompt before calling this when the session is a fresh, unsaved fetch;
  // a currently-open saved entry is simply closed, never altered.
  closeBriefing:    ()           => set(s => ({ briefing: { ...s.briefing, open: false, route: null, data: null, savedId: null } })),
  // Reset button path (all 3 modules) — discards an open, unsaved briefing
  // immediately, no prompt. No-ops if the open briefing is already a saved
  // entry, or if nothing has been fetched yet.
  discardUnsavedBriefing: ()     => set(s => {
    if (s.briefing.savedId || !s.briefing.data) return {}
    return { briefing: { ...s.briefing, open: false, route: null, data: null, savedId: null } }
  }),

  updateSettings: (partial) => set(s => {
    const next = { ...s.settings, ...partial }
    try { localStorage.setItem('cb-settings', JSON.stringify(next)) } catch (_) {}
    return { settings: next }
  }),
}))
