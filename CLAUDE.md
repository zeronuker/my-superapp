# CLAUDE.md

Guidance for working in this repository.

## What this is

**ClaudeBorne SuperApp** — an offline-capable PWA of aviation tools for pilots,
plus a prayer-times module. Single-page app, tabbed calculators, deployed to
Vercel (auto-deploys from `master`).

Current version: **v3.0** (kept in `package.json` and shown in `App.jsx` —
update both the footer and the settings-panel version string together).

## Tech stack

- **React 18** + **Vite 5** (do not assume Vite 6+ APIs)
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
    METARTAFCalculator.jsx    #   METAR/TAF tab.  NotamViewer.jsx = own NOTAM tab
    EDTOCalculator.jsx, FTLCalculator.jsx, InterpolationCalculator.jsx,
    CurrencyCalculator.jsx, CombinedCalculator.jsx (basic+scientific),
    NotamViewer.jsx, Navigation.jsx (launcher/tabs/grouped chrome),
    ErrorBoundary.jsx         #   per-tab crash isolation (wraps the active tab)
  utils/                      # PURE, TESTED logic (no React/DOM)
    metarSeverity.js          #   flight category, wind severity, raw/TAF tokenising
    metarDecode.js            #   plain-English METAR/TAF decoder
    interpolation.js          #   1D/2D table interpolation
  data/ftlTables.js           # CAAM FTL lookup tables + helpers (pure, tested)
  data/airports.js + .json    # worldwide ICAO airport DB (shared: Flight tab +
                              #   NOTAM). Regenerate: node scripts/generate-airports.mjs
  store/calculatorStore.js    # global UI state, settings, resetCount
  modules/prayer/             # self-contained module (own store/hooks/services/pages)
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
  React to global "Reset All" via `resetCount` from the store (see
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

