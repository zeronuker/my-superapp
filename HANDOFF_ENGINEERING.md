# ClaudeBorne SuperApp — Engineering Handoff Brief
> For use with Claude Code when planning and building new features.

---

## What This App Is

**ClaudeBorne SuperApp** is a Progressive Web App (PWA) built for professional pilots. It bundles multiple aviation and general-purpose calculators in a single offline-capable tool. Think of it as a cockpit-grade iPad/phone utility — clean, dark, monospaced, built for people who trust numbers.

- **Live URL:** deployed on Vercel (project: `my-superapp` under `zeronuker-6074s-projects`)
- **GitHub:** `https://github.com/zeronuker/my-superapp`
- **Deploy command:** `vercel --prod` via CLI (not GitHub auto-deploy)
- **Dev server:** `npm run dev` → `http://localhost:3000`

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| UI framework | React 18 + Vite 5 | JSX, no TypeScript |
| State management | Zustand | Single store, no context |
| Styling | Tailwind CSS + CSS custom properties | Tailwind for utilities, `--cp-*` / `--cb-*` vars for theming |
| PWA | `vite-plugin-pwa` / Workbox | `manifest: false` — custom manifest at `/brand/manifest.webmanifest` |
| API | Vercel Serverless Functions (`/api/*.js`) | One function: `weather.js` |
| Deployment | Vercel CLI | `vercel --prod` |
| Package manager | npm |  |

---

## Repo Structure

```
SuperApp/
├── api/
│   └── weather.js              # Serverless: proxies aviationweather.gov
├── public/
│   ├── brand/
│   │   ├── brand.css           # Design token definitions (--cb-* vars)
│   │   ├── manifest.webmanifest
│   │   ├── logo-mark.svg       # Dark-mode logo (SVG, not used in header — see icon-192.png)
│   │   ├── logo-mark-light.svg # Light-mode logo variant
│   │   └── icons/              # PWA + touch icons; icon-192.png used as header logo (48×48)
│   └── sw.js                   # Custom SW (Workbox-generated on build)
├── src/
│   ├── main.jsx                # Entry point, SW registration
│   ├── App.jsx                 # Shell: header, tabs, settings panel
│   ├── index.css               # Token bridge (--cb-* → --cp-*) + component classes
│   ├── store/
│   │   └── calculatorStore.js  # Single Zustand store for ALL state
│   ├── components/
│   │   ├── NormalCalculator.jsx
│   │   ├── ScientificCalculator.jsx
│   │   ├── TimeCalculator.jsx
│   │   ├── InterpolationCalculator.jsx
│   │   ├── EDTOCalculator.jsx
│   │   ├── CurrencyCalculator.jsx
│   │   └── METARTAFCalculator.jsx
│   ├── utils/
│   │   ├── haptic.js           # navigator.vibrate wrapper (reads settings.haptic)
│   │   └── interpolation.js    # 1D + 2D bilinear interpolation logic (pure functions)
│   └── data/
│       └── lookupTables.json   # EDTO performance tables (Boeing flight manual data)
├── vercel.json                 # Build config + security headers + rewrites
├── vite.config.js
└── tailwind.config.js
```

---

## State Management — Zustand Store

**Single store** at `src/store/calculatorStore.js`. All calculators, settings, and UI state live here. No React context.

### State Shape

```js
{
  // Per-calculator state (persists across tab switches)
  normal:        { display, previousValue, operation, expression, clearNext },
  scientific:    { display },
  time:          { digits, multiplier, prevMinutes, operation, isMultiplierMode,
                   expression, result, justCalculated },
  currency:      { amount, fromCurrency, toCurrency, rate, result },
  interpolation: { zValues, rows, lookupX, lookupZ, result },
  edto: {
    aircraft, variant, weight, isaDeviation, antiIce,
    longRangeCruiseAlt, kias310Alt,
  },

  // UI
  activeCalculator,  // string id — 'normal' | 'scientific' | 'time' | etc.
  darkMode,          // bool — persisted to localStorage 'cb-theme'
  resetCount,        // increments on resetAll — components watch this to self-reset

  // Settings (persisted to localStorage 'cb-settings')
  settings: {
    fontScale,       // 'compact' | 'normal' | 'large'
    reduceMotion,    // bool
    defaultTab,      // calculator id
    haptic,          // bool
    numberFormat,    // 'en' | 'eu'
    altimeterUnit,   // 'hPa' | 'inHg'
    tempUnit,        // 'C' | 'F'
    defaultHistory,  // 1 | 2 | 3 | 6 | 12 | 24
    autoRefresh,     // bool
  },
}
```

### Key Action Patterns

```js
// Partial updaters — always spread existing state
setNormal(partial)        // { display, previousValue, operation, expression, clearNext }
setTime(partial)          // { digits, multiplier, operation, ... }
setInterpolation(partial) // { zValues, rows, lookupX, lookupZ, result }

// Targeted setters (legacy — prefer setNormal for NormalCalculator)
setNormalDisplay(display)
setNormalOperation(previousValue, op)
setScientificDisplay(display)
setCurrencyValues(amount, fromCurrency, toCurrency)
setCurrencyResult(rate, result)
setEDTOAircraft(key)  // resets variant to null
setEDTOVariant(key)
setEDTOWeight(kgString)
setEDTOIsaDeviation(value)
setEDTOAntiIce('none' | 'engine' | 'engine-wing')
setEDTOResults(lrcAlt, kias310Alt)

// UI
setActiveCalculator(id)
toggleDarkMode()
updateSettings(partial)   // auto-persists to localStorage

// Nuclear reset — clears all calc state, METAR cache, navigates to 'normal'
resetAll()
```

### How to Read State Outside React

```js
import { useCalculatorStore } from '../store/calculatorStore'
const { settings } = useCalculatorStore.getState()  // used in haptic.js
```

---

## Adding a New Calculator — Checklist

1. **Create** `src/components/MyCalculator.jsx`
2. **Add a state slice** to the store initial state and `resetAll` (follow the `normal` or `time` pattern — use a partial updater `setMyCalc`)
3. **Register** the tab in `App.jsx` `CALCULATORS` array:
   ```js
   { id: 'mycalc', icon: '⊙', name: 'My Calc', component: MyCalculator }
   ```
4. **Watch `resetCount`** if the calculator has local state that needs to reset:
   ```js
   const prevReset = useRef(resetCount)
   useEffect(() => {
     if (resetCount === prevReset.current) return
     prevReset.current = resetCount
     // reset local state here
   }, [resetCount])
   ```
5. **Use haptic** for button presses:
   ```js
   import { haptic } from '../utils/haptic'
   // in onPointerDown: haptic('light' | 'medium' | 'heavy')
   ```
6. **Respect `settings.reduceMotion`** — don't add CSS animations without checking.

---

## API Layer

### `/api/weather.js` — Weather Proxy

- **Method:** GET
- **Query params:** `ids` (ICAO codes, comma-separated), `type` (metar|taf), `hours` (1–48)
- **Validates:** ICAO regex, hours clamping, type whitelist
- **Upstream:** `https://aviationweather.gov/api/data/{type}?ids=...&format=json&hours=...`
- **Timeout:** 8 seconds (`AbortSignal.timeout(8000)`)
- **Returns:** raw JSON from aviationweather.gov, or `{ error }` on failure
- **Status codes:** 400 (bad input), 502 (upstream error), 504 (timeout)

To add a new API function, create `/api/newFunction.js` — Vercel auto-discovers it.

---

## PWA Details

- **Manifest:** `/public/brand/manifest.webmanifest` — custom, not generated by vite-plugin-pwa
- **Service Worker:** Workbox, `skipWaiting: true`, `clientsClaim: true` (auto-updates)
- **Precache:** all JS, CSS, HTML, PNG, SVG, WOFF2, webmanifest
- **Runtime cache:** ExchangeRate-API (NetworkFirst, 24h TTL), Google Fonts (CacheFirst, 1yr)
- **METAR cache:** manual localStorage under key `'cb-metar-cache'` (cleared on Reset All)
- **iOS icon:** `public/brand/icons/apple-touch-icon-180.png` (referenced in `index.html`)
- **Android icons:** `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (in manifest)

---

## Styling System

### Two-layer token bridge

```
brand.css (--cb-*)  →  index.css bridge (--cp-*)  →  component inline styles
```

- `--cb-*` = design tokens (surfaces, accents, typography). Defined in `public/brand/brand.css`, auto-switched for light mode via `[data-theme="light"]`.
- `--cp-*` = legacy component palette. Mapped to `--cb-*` in `index.css`. Components use `--cp-*`.

### Component CSS classes (in `index.css`)

| Class | Usage |
|-------|-------|
| `.cp-btn` | Ghost button with border |
| `.cp-btn-danger` | Red hover variant |
| `.cp-input` | Text/number input field |
| `.cp-label` | Section label (monospace, uppercase, dimmed) |
| `.cp-section-header` | Flex row: title + divider line |
| `.cp-section-title` | Accent-coloured section title |
| `.cp-divider` | Flex-grow hairline |
| `.cp-tab` | Navigation tab button |
| `.cp-table` | Borderless data table |
| `.cp-card` / `.cp-card-accent` | Info card containers |
| `.cp-calc-fade` | 0.18s fade-in animation on tab switch |

### Font scale / zoom

`settings.fontScale` → `zoom` CSS property on the app root div.
- compact = 0.88, normal = 1.0, large = 1.13
- Firefox fallback: `transform: scale()` with adjusted `width` / `minHeight`

---

## Settings System

Settings are stored in `localStorage` under key `'cb-settings'` as JSON. The store merges persisted settings with `DEFAULT_SETTINGS` on load (so new settings added in code are safe — they fall back to defaults for existing users).

`updateSettings(partial)` → merges into store + writes to localStorage in one call.
`darkMode` is stored separately under `'cb-theme'` ('dark' | 'light').

---

## Existing Calculators — Quick Reference

| ID | Component | State slice | Notes |
|----|-----------|-------------|-------|
| `normal` | NormalCalculator | `normal` | Standard 4-op, keyboard support |
| `scientific` | ScientificCalculator | `scientific` | Expression-string eval via `Function()`, keyboard support |
| `time` | TimeCalculator | `time` | HH:MM arithmetic, right-to-left digit entry |
| `interpolation` | InterpolationCalculator | `interpolation` | Bilinear interpolation, dynamic table (add/remove rows+cols) |
| `edto` | EDTOCalculator | `edto` | Boeing 737 MAX performance tables, 2D ISA interpolation |
| `currency` | CurrencyCalculator | `currency` | ExchangeRate-API live rates, offline fallback, debounced |
| `metartaf` | METARTAFCalculator | local state + localStorage | ICAO input, auto-refresh at :00/:30, cache in localStorage |

---

## Known Constraints & Gotchas

- **No TypeScript** — plain JSX throughout.
- **Zustand partial updaters** — always spread existing slice: `set(s => ({ slice: { ...s.slice, ...partial } }))`. Never replace the whole slice.
- **METAR is local state** — METARTAFCalculator is the only calculator that does NOT persist its form state in Zustand (it uses localStorage cache instead). Route/ICAO input is local React state.
- **EDTOCalculator weight** — stored in Zustand as a string of kg (e.g. `"72500"`), but computations use `parseFloat(edto.weight) / 1000` for tonnes. The display formatting is handled locally in the component.
- **lookupTables.json** — EDTO data currently only has Boeing 737-8 MAX (LEAP-1B25 and LEAP-1B27). Adding more aircraft types only requires extending this JSON file and no code changes.
- **`Function()` eval in ScientificCalculator** — intentional for expression evaluation. Input is fully controlled via button clicks; no free-text injection path.
- **Vercel deploy** — done via CLI, not GitHub actions. The `.vercel/project.json` file links the local folder to the Vercel project.
- **SW registration** — uses a custom `/public/sw.js` stub; the real SW is generated into `/dist/sw.js` at build time by Workbox. The public stub is only for browsers that cache the SW path.
