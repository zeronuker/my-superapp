# Security Notes

## Vite 5 → 8 migration — done (2026-08-16)

Upgraded `vite` (5→8), `@vitejs/plugin-react` (4→6), `vitest` (2→4), and
`vite-plugin-static-copy` (3→4) together; `vite-plugin-pwa` stayed at 1.3.0
(already compatible with Vite 8). Fixed the resulting `__dirname` deprecation
warning in `vite.config.js` (native config loader wants `import.meta.dirname`).
Verified: all 298 tests pass, `npm run build` is clean, service worker still
precaches correctly, dev server serves the app with no console errors.

This resolved the esbuild dev-server-leak advisory (GHSA-67mh-4wv8-2f99) that
motivated the migration — `esbuild`/`vite`/`vitest` no longer appear in
`npm audit` at all.

## `npm audit` findings

Last reviewed: 2026-11-21

`npm audit --omit=dev` reports **0** after a plain `npm audit fix` (firebase-admin
14.0.0 → 14.5.1 and its helpers; Vite 8.2.1 → 8.3.8; lockfile only, `package.json`
unchanged). Never `--force`.

Still reported by plain `npm audit`: 4 moderate, all dev-time only (`glob` and
`minimatch` under `workbox-build`, reached through `vite-plugin-pwa`). They run during
`npm run build` on your machine and never ship. The only "fix" is
`npm audit fix --force`, which installs an older `vite-plugin-pwa`: not worth it.

What ships to the browser (the client dependencies): `adhan`, `country-flag-icons`,
`jspdf`, `jsqr`, `leaflet`, `maplibre-gl`, `pdfjs-dist`, `qrcode`, `react`,
`react-dom`, `zustand`. `firebase-admin` is used only by the serverless functions in
`api/`.

## Server notes (kept here so they are not rediscovered)

- **The sync code is the only lock.** `api/dutylog-sync.js` has no accounts: anyone with
  the 12-character code can read that code's duty logs, briefings and OFP inbox, and
  can claim it (the claim call is how a new phone restores) and then overwrite or delete.
  Sharing a code to let someone *view* therefore also hands over control. A separate
  read-only view code would fix it, but eLogbook reads the same endpoint, so that is a
  redesign, not done.
- **Anyone can create a code** by writing to it. Limits: 20 requests a minute per kind per
  IP and instance (in memory, not global); 100 saved briefings and 200 OFP inbox items per
  code; every document under 900 kB. These limit one code, not the number of codes: set a
  budget alert on the Firebase project.
- **The proxies** (`api/*.js`) log the raw error and send the browser a short generic one.
  `api/skylink.js` only accepts its own listed resources (before 2026-11-21 a request for
  `constructor` made the server call an attacker-chosen host with the SkyLink key).
- **Content-Security-Policy** is sent as `Content-Security-Policy-Report-Only` in
  `vercel.json`, with violation reports POSTed to `/api/client-error` (logged as
  `[csp-report]`). Read those logs for a while, loosen what real use needs (Windy loads
  more hosts than listed), then rename the header to `Content-Security-Policy`.
  Do not enforce it blind: maps, workers and fonts could stop working.
