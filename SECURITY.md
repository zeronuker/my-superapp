# Security Notes

## `npm audit` findings — accepted (dev-only)

Last reviewed: 2026-06-07

`npm audit` reports 5 vulnerabilities (4 moderate, 1 critical). **All are in the
build/test toolchain and none ship to users.**

The shipped production dependencies are only:

```
adhan, react, react-dom, zustand
```

These have no outstanding advisories. The flagged packages are all
dev-/build-time:

| Package | Where | Advisory |
|---------|-------|----------|
| esbuild | transitive (via vite) | GHSA-67mh-4wv8-2f99 (dev-server request leak) |
| vite | devDependency | depends on the above esbuild |
| vitest / vite-node / @vitest/mocker | devDependency | depend on the above vite |

### Why we are not "fixing" it

- The critical esbuild advisory only affects the **local dev server**
  (`npm run dev`) on a shared network — it cannot be reached in the deployed
  Vercel build, which serves static assets only.
- `npm audit fix` (non-breaking) clears none of them.
- `npm audit fix --force` pulls **Vite 8** — a major upgrade from our Vite 5,
  with breaking changes to config and the PWA plugin. Patching a dev-only issue
  is not worth risking the production build.

### If/when we revisit

A Vite 5 → 6/7/8 migration should be done deliberately on its own branch:
upgrade `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, and `vitest`
together, then verify `npm run build`, the generated service worker, and the
offline experience before merging.
