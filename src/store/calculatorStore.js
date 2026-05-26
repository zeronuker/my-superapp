import { create } from 'zustand'

const DEFAULT_SETTINGS = {
  fontScale:      'normal',   // 'compact' | 'normal' | 'large'
  reduceMotion:   false,
  defaultTab:     'calculator',
  haptic:         true,
  numberFormat:   'en',       // 'en' (1,000.00) | 'eu' (1.000,00)
  defaultHistory: 3,
  autoRefresh:    true,
  tabOrder:       ['calculator', 'time', 'interpolation', 'edto', 'currency', 'metartaf', 'ftl', 'prayer'],
}

function loadSettings() {
  try {
    const s = localStorage.getItem('cb-settings')
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS
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
  currency:      { amount: '', fromCurrency: 'USD', toCurrency: 'EUR', rate: 1.0, result: '' },
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

  // resetCount increments on every resetAll so components can react
  resetCount: 0,

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
  setCurrencyValues: (a, f, t)   => set(s => ({ currency: { ...s.currency, amount: a, fromCurrency: f, toCurrency: t } })),
  setCurrencyResult: (r, res)    => set(s => ({ currency: { ...s.currency, rate: r, result: res } })),
  setInterpolation:  (partial)   => set(s => ({ interpolation: { ...s.interpolation, ...partial } })),
  toggleDarkMode:    ()          => set(s => ({ darkMode: !s.darkMode })),
  setActiveCalculator: (id)      => set({ activeCalculator: id }),

  updateSettings: (partial) => set(s => {
    const next = { ...s.settings, ...partial }
    try { localStorage.setItem('cb-settings', JSON.stringify(next)) } catch (_) {}
    return { settings: next }
  }),

  resetAll: () => {
    try { localStorage.removeItem('cb-metar-cache') } catch (_) {}
    set(s => ({
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
      currency:      { amount: '', fromCurrency: 'USD', toCurrency: 'EUR', rate: 1.0, result: '' },
      interpolation: {
        zValues: [''],
        rows: [{ x: '', ys: [''] }, { x: '', ys: [''] }, { x: '', ys: [''] }],
        lookupX: '', lookupZ: '', result: '',
      },
      activeCalculator: 'calculator',
      resetCount: s.resetCount + 1,
    }))
  },
}))
