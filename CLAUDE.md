# CLAUDE.md

Guidance for working in this repository.

## What this is

**ClaudeBorne SuperApp** — an offline-capable PWA of aviation tools for pilots,
plus a prayer-times module. Single-page app, tabbed calculators, deployed to
Vercel (auto-deploys from `master`).

Current version: **v3.7** — driven by `src/changelog.js`'s `current: true`
entry (`currentVersion(CHANGELOG)` in `App.jsx`); also keep `package.json`'s
`version` and `README.md`'s "Current version" line in sync with it.

## Tech stack

- **React 18** + **Vite 8** (do not assume Vite 9+ APIs)
- **Zustand** for state (`src/store/calculatorStore.js`, plus a self-contained
  store inside the prayer module)
- **adhan** for prayer-time / Qibla astronomy
- **vite-plugin-pwa** (Workbox) for offline + install
- **Vitest** for unit tests (node environment, isolated config)
- No TypeScript; plain `.js` / `.jsx`. No CSS framework — styling is inline
  styles + CSS custom properties (`--cp-*`) defined in `src/index.css`.

## Commands

```bash
npm run dev          # local dev server
npm test             # run unit tests once
npm run test:watch   # watch mode
npm run build        # production build (also what Vercel runs)
```

There is no lint script. Match the surrounding code style.

## Layout

```
src/
  App.jsx                     # shell: header, tab bar, settings, theme/zoom.
                              #   CALCULATORS array = the tab registry — add new tabs here.
  components/                 # one file per calculator tab (+ shared UI)
    BriefingModule.jsx        #   Briefing tab, laid out like the Duty Log (ModuleChrome.jsx
                              #   header shared with it): a list page (saved
                              #   briefings shown by month through MonthBrowser.jsx like the Duty Log, 5 per page, "Have a code?" box with shared recent
                              #   codes) and a New page opened by + NEW (import the OFP or type
                              #   it in, GENERATE BRIEFING)
    METARTAFCalculator.jsx    #   METAR/TAF tab.  NotamViewer.jsx = own NOTAM tab
    B737Performance.jsx, FTLCalculator.jsx, InterpolationCalculator.jsx,
    CurrencyCalculator.jsx, CombinedCalculator.jsx (basic+scientific),
    NotamViewer.jsx, SigmetViewer.jsx  #   SIGMET tab (own SigmetCard.jsx,
                              #   services/sigmetAPI.js, utils/sigmet.js, api/isigmet.js)
    Navigation.jsx (launcher/tabs/grouped chrome)
    BriefingView.jsx          #   ✈ Briefing overlay (Flight Details when from an
                              #   OFP + METAR/TAF+NOTAM+SIGMET
                              #   combined) — saved briefings live in
                              #   store/calculatorStore.js's `briefing.saves`,
                              #   persisted to IndexedDB by services/briefingStorage.js
    ErrorBoundary.jsx         #   per-tab crash isolation (wraps the active tab)
                              #   EDTOCalculator.jsx is now a mode nested inside
                              #   B737Performance.jsx, not its own tab (old
                              #   `edto` tab id remaps via App.jsx's LEGACY_ID_MAP)
  utils/                      # PURE, TESTED logic (no React/DOM)
    metarSeverity.js          #   flight category, wind severity, raw/TAF tokenising
    metarDecode.js            #   plain-English METAR/TAF decoder
    interpolation.js          #   1D/2D table interpolation
  data/ftlTables.js           # CAAM FTL lookup tables + helpers (pure, tested)
  data/airports.js + .json    # worldwide ICAO airport DB (shared: Flight tab +
                              #   NOTAM). Regenerate: node scripts/generate-airports.mjs
  store/calculatorStore.js    # global UI state, settings
  modules/prayer/             # self-contained module (own store/hooks/services/pages)
  modules/dutylog/            # self-contained module (own store/components/pages)
api/
  weather.js                  # Vercel serverless proxy → aviationweather.gov
  notam.js                    # Vercel serverless proxy → autorouter.aero (OAuth)
```

## Conventions & gotchas

- **Pure logic lives in `utils/` and `services/`** and is unit-tested. When
  adding or changing calculation behaviour, put the math in a pure function and
  add a `*.test.js` next to it. Tests have already caught two real bugs.
- **METAR/TAF visibility thresholds are in METRES** (ICAO), not statute miles.
  The aviationweather.gov API returns `visib` in SM, so it is converted to
  metres before comparison. Cloud ceilings stay in feet.
- **Severity colours** (in `metarSeverity.js` / the weather legend): green VFR,
  blue MVFR, red IFR, magenta LIFR; amber/red wind; yellow present weather +
  CB/TCU. Token colour priority: wind > weather > category.
- **Role colours** in the weather tab: dep/arr cyan, dest-alt white, enroute
  purple (`getRoleStyle` in `METARTAFCalculator.jsx`).
- **Styling**: use the `cp-*` CSS variables and helper classes (`cp-input`,
  `cp-label`, `cp-section-header`, `cp-divider`). Don't hard-code theme colours.
- **Adding a calculator tab**: create the component, then add an entry to the
  `CALCULATORS` array in `App.jsx`. New tabs auto-append to the saved tab order.
  React to global "Reset All" via a per-module `resetXxx()` store action wired
  to the shared `<ResetButton onReset={...}>` component (see
  `CurrencyCalculator.jsx` for the pattern). Also add the new id to a group in
  `NAV_GROUPS` (Navigation.jsx) so it appears in grouped navigation.
- **Offline**: this is a PWA. Anything that fetches must degrade gracefully when
  offline and avoid triggering network calls that prompt the user. The service
  worker precaches the build output.

## Deploy

Push to `master` → Vercel builds and deploys automatically. Commit/push only
when asked. The service worker caches aggressively; users get an update prompt
(`UpdatePrompt.jsx`) when a new build is available.

## Notes

- **NOTAM (`api/notam.js`)** is live via the autorouter.aero API (OAuth, free).
  Requires `AUTOROUTER_EMAIL` / `AUTOROUTER_PASSWORD` in Vercel env vars — these
  are the account login email/password (autorouter uses them as the OAuth
  client_id/client_secret). Verified working against WMKK.
  autorouter allows only **20 valid tokens per account**; going over answers
  `toomanytokens`. Their docs say a token lasts an hour, but the live reply
  says `expires_in: 259200` (**3 days**), so every login holds a slot for days.
  Both autorouter functions log in through `api/_autorouterToken.js`: it keeps
  the token until a caller gets a 401 (no clock of its own), makes callers that
  arrive during a login wait for it, pauses 30 s after a refused login, and logs
  every login / failure (no secrets) so tokens taken can be counted in the Vercel
  logs (they only keep ~70 min). The token is also kept in a **durable shared
  store** (`api/_tokenStore.js`): Firestore doc `appSecrets/autorouter-<VERCEL_ENV>`
  (the same Firebase project as the Duty Log), AES-256-GCM encrypted with a key
  derived from `AUTOROUTER_PASSWORD`, so a cold start or the other function
  reuses it instead of taking another slot. Vercel's Runtime Cache was tried
  first and forgot the token within hours — do not go back to it. Every store
  call has a 5 s limit and any failure just falls back to logging in. Firestore
  rules deny all client access (`allow read, write: if false`); keep it that way.
  Their Terms say API use needs an "API usage agreement" (never asked about).
  `fetchNotams` sends ONE `/api/notam?icaos=A,B,C` request per briefing (max 12
  locations, paged 100 rows at a time) instead of one per airport, and only
  sends 4-character codes (autorouter rejects the whole batch for one typo).
- **Pasted route (`api/route.js`)** — the optional ROUTE box in the Briefing
  tab's manual form (`RouteInput.jsx`; METAR/TAF, NOTAM and SIGMET no longer
  carry a route, so an old one cannot draw for another flight on the same city
  pair). `utils/routeParse.js` keeps only the
  fixes (airways, SIDs/STARs, runways, DCT dropped: autorouter does not know
  the Asian airways and mixed up duplicate names when they were sent), the
  function asks autorouter's flight-plan parser for each fix's position (parse
  only, never files), and the Dark map draws the line. Fixes autorouter lacks
  go in `src/data/fixOverrides.js`. SIDs/STARs and airway bends are not drawn.
- **OFP import (`BriefingModule.jsx` IMPORT OFP, `utils/ofpParse.js`,
  `utils/pdfText.js`, `services/ofpFile.js`)** — on the Briefing tab. Reads the
  company XmlOFP (ARINC 633 `.txt`/`.xml`) or the PFP
  PDF on the device (nothing is uploaded). Dep/arr, the two destination
  alternates (the filed `(FPL…)` line) and the enroute alternates (the
  `ENROUTE ALT` remark minus dep/arr/dest alts) come from text both formats
  share; route points come from the XML waypoints (arc-seconds, south/west
  negative) or the PFP navlog (two lines per row, stops at the arrival row).
  The loaded flight shows as a boarding-pass summary card (that is the "is this
  right?" check): flight (the filed callsign), tail with the aircraft type
  (XmlOFP's "B737 800WS CFM56-7B24" is rewritten to the PFP's
  "B737-800WS/CFM56-7B24"), OFP number, STD/STA in UTC and in local time with
  offset (zone from `airports.json`, `utils/ofpTimes.js`; each time carries its
  own date, flight date = the UTC date), BLOCK = STA − STD (NOT the XmlOFP's
  `BlockTime`, which is trip + a placeholder taxi time), trip, distance, then
  the alternates in the app's role colours (`ROLE_COLORS`) and the route as
  filed (from the FPL line, shown only while the imported points are present).
  A wrong-OFP warning shows when STD is more than 6 h from now: red "generated X
  ago" (counted from the computed time) once STD is more than 6 h gone, yellow
  "STD is X ahead" when it is more than 6 h away. GENERATE BRIEFING goes on, EDIT OFP
  opens the manual form already filled in. The FIRS line (amber, plain text like
  the route) lists the FIRs flown through, each once, in order: from the
  XmlOFP's per-waypoint airspaces, or for the PFP/PFB from the filed plan's
  `EET/` list (it can run onto a second line) with the departure FIR taken from
  the departure airport (`icaoToFir`, a country-prefix guess). The same list
  fills the manual form's FIR chips (which also has the NOTAM/SIGMET tabs' AUTO-DETECT FIRs
  button for a hand-typed flight; an empty list falls back to the same auto-detect when
  generating) and is passed as `route.firs`, which REPLACES
  the Briefing's own FIR auto-detect (so alternates' own FIRs, e.g. Lahore for
  OPMT/OPIS, are only included if they are on the route or added by hand). A
  long list means more than 12 NOTAM locations, which `fetchNotams` already
  splits into batches of 12.
  Opening a briefing also fills the METAR/TAF, NOTAM and SIGMET tabs
  (`briefingSync.js`). Points ride in the route text as `NAME:lat:lon`
  tokens, so saves and the setup cache carry them with no extra
  state; `parseRoute` returns them as `pts` and `lookupRoute` uses them with no
  autorouter call or fix limit (adding a plain fix to the text drops them).
  The floating Resume Briefing pill shows only for a briefing PAUSED by the
  NOTAM "view all" tab-jump (still live, maybe unsaved); saved briefings are
  reopened from the Briefing tab's Saved Briefings list. On the Briefing tab
  the pill rides above the Generate bar.
  pdfjs-dist is lazy-loaded; its 1.4 MB worker is precached. The pilot gets
  the OFP from cvr.batikair.com.my (flight → Flight Plan → XmlOFP/PFP →
  Download). That site is behind Cloudflare and a login, so the app cannot
  fetch it itself; whether the OFP is there before departure is unconfirmed
  (on 2026-10-25 it listed only flown flights).
- **Flight Details tab (`FlightDetailsTab.jsx`, `utils/ofpDetails.js`,
  `utils/flightDetailsCalc.js`)** — the briefing overlay's first tab, only for a
  briefing started from an imported OFP (`route.flightDetails`, built in
  `BriefingModule.jsx` and dropped if dep/arr were edited after the import;
  saved briefings keep it). `ofpDetails.js` reads the same figures from the
  XmlOFP and the PFP/PFB text into one shape: cost index, fuel, weights with
  their operational limits, each destination alternate's routing, remarks, the
  route as the OFP prints it, and FIR entry times (from the filed `EET/`, the
  departure FIR at 0:00). Each section fails soft to null, so an odd OFP still
  imports. Choices to keep: block fuel = T/O fuel + taxi (the PDFs leave it
  blank); arrival fuel = the PDF's "LDW FUEL", which the XmlOFP only gives as
  `ArrivalFuel` with the contingency still in it (so minus contingency);
  anything the named fuel lines don't cover shows as "Extra" so the bar adds up.
  Weight bars: share of the OPERATIONAL limit, green up to 70%, amber to 80%,
  red above. Only one format prints some items: MORA, pax/cargo, take-off
  alternate and EDTO status (PDF); commercial flight number (XmlOFP).
- **Saved Briefings cloud backup (`services/briefingCloud.js`,
  `components/SavedBriefingsCloud.jsx`, `api/dutylog-sync.js` `&kind=briefing`)** —
  works like the Duty Log's backup and shares its sync code, owner device and
  function (Vercel is at the 12-function cap). Settings → Cloud Sync's one SYNC
  button pushes the duty logs, then the saves. Each briefing is its own Firestore
  doc `dutylogs/<code>/briefings/<id>` (entry stored as a JSON string: Firestore
  refuses nested arrays) sent in its own request, since Vercel rejects bodies over
  ~4.5 MB. A sync lists the cloud, pushes saves that are missing or renamed, and
  deletes cloud copies of saves gone from the device (owner device is the source
  of truth, no tombstones). The map picture is never left off: it is cut into
  700 000-character pieces (`parts` subcollection, `mapParts` count on the briefing
  doc) sent BEFORE the briefing, so a briefing in the cloud always has its whole
  map; a rename does not resend it. "Synced" per row = `briefing.cloud.synced[id] ===
  name` (localStorage `cb-briefing-cloud`). The "Have a code?" box on the Saved
  Briefings list VIEWs read-only, as rows in the Saved Briefings style
  (`BriefingRowText`, drawn from a small `row` summary — `briefingRow()` — stored
  beside each cloud briefing so the list needs no download; a briefing uploaded
  without one is re-sent by the next SYNC, map not resent; tapping shows
  `Dots`/`.cp-row-bar` loading; looking a code up shows the Duty Log's
  `ScanViewfinderLoader`; `components/SyncStatus.jsx` is the per-row sync
  status shared with the Duty Log list: spinner + SYNCING, then a SYNCED pop;
  the Settings card shows progress via `syncSaves`' `onProgress`) (tap a row: `openViewedBriefing` opens that one
  briefing as a "Cloud copy · read-only" overlay, `briefing.viewed`, nothing stored
  or claimed, and the METAR/TAF, NOTAM and SIGMET tabs are left alone until its
  "view all NOTAMs" link pauses it), IMPORT replaces the device's saves and makes the
  code this device's code. Tested against a fake Firestore only.
- **Offline briefings** — all four briefing buttons (Briefing, METAR/TAF,
  NOTAM, SIGMET tabs) are disabled offline; there is no offline reuse of a saved
  briefing in `openBriefing` (reopen saves from the Saved Briefings list).
- **AeroDataBox (`api/aerodatabox.js`)** only does one thing now — airport
  runway data (`/airports/{icao}/runways`), used by METAR/TAF's wind-component
  calc. Requires `AERODATABOX_API_KEY` in Vercel env vars (X-RapidAPI-Key from
  rapidapi.com/aedbx-aedbx/api/aerodatabox). There is no flight-status/gate
  lookup here or anywhere else in the app — Malaysia Airports' gate finder
  (`api/gatefinder.js`) uses Malaysia Airports' own public API directly, not
  AeroDataBox or SkyLink.
- **Melbourne and Sydney in the Aerodromes tab** (`api/_airports.js`,
  answered by the same `api/gatefinder.js`, because the project is at Vercel's
  12-function cap) — read from the airports' own website endpoints, keyless and
  undocumented, so they can change or block us: Melbourne
  `/api/data/search` (gate in the list), Sydney `/_a/flights` (list only; the gate
  is in one `/_a/flights/<no>/<id>/departing|picking-up` call per flight, made
  only for the up-to-25 flights returned and skipped for finished ones). Both are
  translated into the Malaysia flight shape. Codeshare names: from that day's
  flights, then the Malaysia airline list in `Aerodromes.jsx`, else the
  bare flight number. Times are airport-local; today starts an hour ago.
  `vercel dev` cannot serve the Vite app here; verify the UI with `npm run dev`
  plus the handler run directly in node.
- **Perth and Brisbane (aviationstack)** — their own sites sit behind bot checks
  (Cloudflare / "Client Challenge") that block server requests, and getting past
  those is not on, so they use aviationstack's FREE plan (`/v1/flights`, needs
  `AVIATIONSTACK_API_KEY` in Vercel env vars; without it the tab says "not set
  up"). The plan is ~100 requests a month and non-commercial, today only (any
  other date is `function_access_restricted`), so the UI limits these two to
  flight-number search, today, and `fetchAviationstack` does one
  `flight_iata` + `dep_iata`/`arr_iata` request per search (identical searches
  within 10 min reuse the answer, in memory only). Limit errors come back as 429
  `usage_limit_reached` / `daily_usage_limit_reached` / `fair_use_limit_reached`
  (allowance used up) or `rate_limit_reached` (short throttle); the quota's reset
  date is not documented anywhere reachable, so read it off the dashboard. Each codeshare partner comes
  back as its own record beside the operating flight; `fromAviationstack` folds
  them. Times are airport-local labelled "+00:00". Gates matched the airports'
  own sites on 9 of 10 checked flights (small regional flights can lack one, e.g.
  WO342); there is no gate-open/boarding status, so the gate box stays grey.
- **CARTO basemaps (`CartoRouteMap.jsx`)** — the briefing's Dark/Vector map
  tabs load vector styles directly from `basemaps.cartocdn.com` (client-side,
  no proxy). CARTO now requires an API key on every basemap request (this
  used to be optional); get a free one at carto.com/basemaps/apikey and set
  it as `VITE_CARTO_API_KEY` in Vercel env vars. Their query param is `key`,
  not `api_key`. Without a key, the map tab shows "Map unavailable".
- **SkyLink (`api/skylink.js`)** is fallback-only for METAR/TAF and NOTAM —
  aviationweather.gov and autorouter.aero are always primary (see
  `weatherAPI.js` / `notamAPI.js`), SkyLink only gets called if those fail.
  Its `aircraft` / `aircraft-performance` resources exist in the proxy but
  have no frontend caller currently.
- **Dev-only `npm audit` findings** (esbuild/vite/vitest) — not shipped to
  production; do not `npm audit fix --force` (it pulls a breaking Vite major).
  See SECURITY.md.

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

