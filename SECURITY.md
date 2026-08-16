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

## `npm audit` findings — accepted (dev-only / server-only)

Last reviewed: 2026-08-16

Remaining findings are unrelated to the Vite toolchain: transitive deps of
`firebase-admin` (`uuid`, `gaxios`, `teeny-request`, `@google-cloud/storage` —
used server-side only, in `api/dutylog-sync.js`, never in the client bundle)
and `sharp` (used only by the brand-kit icon-generation scripts, dev-time).
Run `npm audit` for the current list. None of these ship to the browser
bundle — the shipped production client dependencies are still only:

```
adhan, react, react-dom, zustand
```

Bumping `firebase-admin` or `sharp` are breaking-change upgrades
(`npm audit fix --force` territory) and out of scope here — revisit
separately if warranted.
