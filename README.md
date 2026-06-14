# ClaudeBorne SuperApp

An offline-capable PWA of aviation tools for pilots, plus a prayer times module. Runs as a single-page app with tabbed tools, installable on mobile and desktop.

**Current version: v3.6**

---

## Tools

### ✈️ EDTO Calculator
Engine inoperative drift-down performance for B737 operators.
- Supports B737-8 (LEAP-1B25, LEAP-1B27) and B737-800 (CFM56-7B24, CFM56-7B26)
- Outputs: Long Range Cruise Altitude and 310 KIAS Altitude
- Anti-ice penalty options (engine only / engine + wing)
- Real-time interpolation from embedded Boeing performance tables

### 🌤️ METAR/TAF
Live weather for multiple airports via aviationweather.gov.
- Flight category colour coding: VFR / MVFR / IFR / LIFR
- Wind severity, present weather, CB/TCU highlighting
- Plain-English decode toggle
- Role tagging: dep/arr/dest-alt/enroute with distinct colours
- Auto-refresh with staleness badge on PWA icon

### 📋 NOTAM Viewer
Live NOTAMs via autorouter.aero OAuth proxy.
- Multi-airport lookup, grouped by location
- Relevance or category sort
- Inputs and results persist offline in localStorage

### ⏳ FTL Calculator
CAAM flight and duty time limitations.
- Lookup tables for max FDP, rest requirements
- Real-time calculation against current roster

### 🛫 Duty Log
Flight sector logger with offline persistence.
- Per-sector: dep/arr airports, times, fuel, ENG OUT data, crew, remarks
- Add/delete crew rows, edit inline

### 🧮 Calculator
Combined basic + scientific calculator.
- Arithmetic, trig (sin/cos/tan), log, √, x², π, e
- 10 significant figure precision

### 📐 Interpolation
Linear 1D/2D table interpolation.
- y = y₁ + (x − x₁) × (y₂ − y₁) / (x₂ − x₁)
- Useful for performance table lookups

### 💱 Currency Exchange
Real-time exchange rates with offline fallback.
- Calculates as you type

### 🌐 World Time
Multi-timezone clock with airport/city search.
- 12h/24h toggle

### 🕌 Qiblat & Solat
Prayer times and Qibla direction.
- Powered by [adhan](https://github.com/batoulapps/adhan-js)
- Qibla compass with device orientation
- Dhuha, Imsak, Sunrise as reference times
- Auto-refresh after midnight

---

## Dashboard
Launcher home screen shows live widgets:
- UTC/Zulu clock (links to World Time)
- Next prayer countdown (links to Qiblat & Solat)
- METAR staleness indicator (links to METAR/TAF)

---

## Tech Stack

| | |
|---|---|
| Frontend | React 18, plain JS/JSX |
| Build | Vite 5 |
| State | Zustand |
| Prayer astronomy | adhan |
| Offline/PWA | vite-plugin-pwa (Workbox) |
| Tests | Vitest |
| Deploy | Vercel (auto-deploy from `master`) |
| Styling | CSS custom properties (`--cp-*`), no CSS framework |

---

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # run unit tests once
npm run test:watch # watch mode
npm run build      # production build → dist/
```

---

## Deployment

Push to `master` → Vercel builds and deploys automatically.

The service worker caches aggressively. Users receive an in-app update prompt when a new build is available.

**Required Vercel environment variables for NOTAM:**
```
AUTOROUTER_EMAIL=<your autorouter.aero login>
AUTOROUTER_PASSWORD=<your autorouter.aero password>
```

---

## Project Structure

```
src/
  App.jsx                   # shell, tab registry, settings, theme
  components/               # one file per calculator tab
    METARTAFCalculator.jsx
    NotamViewer.jsx
    EDTOCalculator.jsx
    FTLCalculator.jsx
    InterpolationCalculator.jsx
    CurrencyCalculator.jsx
    CombinedCalculator.jsx
    WorldTimeCalculator.jsx
    Navigation.jsx
    ErrorBoundary.jsx
    UpdatePrompt.jsx
  utils/                    # pure, tested logic
    metarSeverity.js
    metarDecode.js
    interpolation.js
  data/
    ftlTables.js
    airports.js / .json
  store/
    calculatorStore.js
  modules/
    prayer/                 # self-contained prayer module
    dutylog/                # self-contained duty log module
api/
  weather.js                # Vercel proxy → aviationweather.gov
  notam.js                  # Vercel proxy → autorouter.aero (OAuth)
```

---

## License

Internal use only.
