# ClaudeBorne SuperApp

An offline-capable PWA of aviation tools for pilots, plus a prayer times module. Runs as a single-page app with tabbed tools, installable on mobile and desktop.

**Current version: v3.4**

---

## Tools

### ✈️ B737 Performance
Digitized Boeing QRH performance references for the 737-8 (MAX) and 737-800 (NG).
- **EDTO** — engine-inoperative drift-down (Long Range Cruise Altitude, 310 KIAS Altitude); anti-ice penalty options; CFM56-7B24/26 and LEAP-1B25/27
- **Go-Around (Engine Inoperative)** — climb gradient calculator
- **Quick Turnaround** — limit weight for rapid successive sectors
- **Brake Cooling Schedule** — advisory brake-energy tables, single-event and chained quick-turnaround modes

### 🌤️ METAR/TAF
Live weather for multiple airports via aviationweather.gov.
- Flight category colour coding: VFR / MVFR / IFR / LIFR
- Wind severity, present weather, CB/TCU highlighting
- Plain-English decode toggle
- Role tagging: dep/arr/dest-alt/enroute with distinct colours
- Runway wind-component calculation (via AeroDataBox runway data)
- Auto-refresh with staleness badge on PWA icon

### 📋 NOTAM Viewer
Live NOTAMs via autorouter.aero OAuth proxy.
- Multi-airport lookup, grouped by location
- Relevance or category sort
- Inputs and results persist offline in localStorage

### ⛈️ SIGMET Viewer
International SIGMETs by FIR, auto-detected from a route or entered manually.

### ⏳ FTL Calculator
CAAM CAD 1901 flight and duty time limitations.
- Lookup tables for max FDP, rest requirements
- Real-time calculation against current roster
- Covers single-pilot, commercial (incl. cabin crew), and helicopter operations

### 🛫 Duty Log
Flight sector logger with offline persistence.
- Per-sector: dep/arr airports, times, fuel, ENG OUT data, crew, remarks
- Add/delete crew rows, edit inline
- Optional cloud sync via a pairing code (Firebase-backed) to carry logs across devices

### 🛬 Malaysia Airports
Live flight/gate status board, via Malaysia Airports' own public API.

### 🧮 Calculator
Basic, scientific, time, and unit-conversion modes in one tab.
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

## ✈ Flight Briefing
An overlay (not its own tab) that combines METAR/TAF + NOTAM + SIGMET for a route into one briefing, with a route map — CARTO dark basemap, plus a Windy live-weather overlay (wind/temp/pressure/rain/clouds, by altitude). Briefings can be saved and resumed from any tab, and work offline once loaded.

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
| Build | Vite 8 |
| State | Zustand |
| Prayer astronomy | adhan |
| Maps | MapLibre GL (route basemap), Leaflet + Windy (live weather overlay) |
| Offline/PWA | vite-plugin-pwa (Workbox) |
| Tests | Vitest |
| Deploy | Vercel (auto-deploy from `master`) |
| Styling | CSS custom properties (`--cp-*`), no CSS framework |

---

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:3000
npm test           # run unit tests once
npm run test:watch # watch mode
npm run build      # production build → dist/
```

---

## Deployment

Push to `master` → Vercel builds and deploys automatically.

The service worker caches aggressively. Users receive an in-app update prompt when a new build is available.

**Vercel environment variables:**

| Variable | Required for |
|---|---|
| `AUTOROUTER_EMAIL`, `AUTOROUTER_PASSWORD` | NOTAM (autorouter.aero login, used as OAuth client_id/secret) |
| `VITE_WINDY_API_KEY` | Briefing's live weather map. Domain-restricted at api.windy.com/keys, not a secret in the traditional sense — bundled into the client build |
| `VITE_CARTO_API_KEY` | Briefing's route map basemap. From carto.com/basemaps/apikey — also bundled client-side |
| `AERODATABOX_API_KEY` | METAR/TAF's runway wind-component calc (RapidAPI AeroDataBox) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Duty Log's optional cloud sync |
| `RAINBOW_API_KEY` | Rain/Clouds layers on Briefing's live weather map |
| `GATEFINDER_API_KEY` | Malaysia Airports gate lookup — optional, has a working default |
| `SKYLINK_API_KEY` | Fallback only for METAR/TAF and NOTAM if the primary sources fail — optional |

---

## Project Structure

```
src/
  App.jsx              # app shell — layout, tab switching, top-level effects
  appConstants.js       # shared constants (app version, accent colours)
  components/          # one file per calculator tab, plus shared UI
  components/settings/  # Settings panel
  modules/prayer/       # self-contained prayer module (own store/services/pages)
  modules/dutylog/      # self-contained duty log module (own store/services/pages)
  utils/                # pure, tested logic — see *.test.js next to each file
  data/                 # airport DB, FTL tables, FIR lookup, currencies, timezones
  store/calculatorStore.js  # global UI state, settings
api/
  weather.js, notam.js, aerodatabox.js, gatefinder.js,  # Vercel serverless
  skylink.js, rainbow.js, isigmet.js, dutylog-sync.js,   # proxies for the
  geocode.js, client-error.js                            # services above
```

See [CLAUDE.md](CLAUDE.md) for the full annotated file-by-file layout and dev conventions.

---

## License

Internal use only.
