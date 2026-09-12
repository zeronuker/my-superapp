import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'
import { commitSha } from './brand-kit/scripts/commit-sha.mjs'

export default defineConfig({
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
  // Emit JSON imports as JSON.parse('…') rather than an object literal with a
  // named export per key — far smaller/faster for the large airports.json.
  json: { namedExports: false, stringify: true },
  resolve: {
    alias: {
      '@brand/BrandBanner': resolve(import.meta.dirname, 'brand-kit/component/BrandBanner.jsx'),
      '@brand/SplashScreen': resolve(import.meta.dirname, 'brand-kit/component/SplashScreen.jsx'),
      '@brand/UpdatePrompt': resolve(import.meta.dirname, 'brand-kit/component/UpdatePrompt.jsx'),
      '@brand/useUpdate': resolve(import.meta.dirname, 'brand-kit/component/useUpdate.js'),
      '@brand/Changelog': resolve(import.meta.dirname, 'brand-kit/component/Changelog.jsx'),
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'brand-kit/static/css/brand.css',  dest: 'brand', rename: { stripBase: true } },
        { src: 'brand-kit/static/logo/logo-mark.svg',       dest: 'brand', rename: { stripBase: true } },
        { src: 'brand-kit/static/logo/logo-mark-light.svg', dest: 'brand', rename: { stripBase: true } },
        // maplibre-gl-worker.mjs has a plain `import ... from './maplibre-gl-shared.mjs'`
        // — a real relative import, not the dynamic self-URL guess this app already
        // works around elsewhere. Copying just the worker file (e.g. via a Vite `?url`
        // import) drops that sibling, so the browser 404s on it — Vercel's SPA rewrite
        // then serves index.html for the missing path, which fails as a non-JS module.
        // Copying both files, unhashed, into the same folder keeps that relative import
        // resolving exactly as it does inside the package itself.
        {
          src: 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
          dest: 'maplibre-gl',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs',
          dest: 'maplibre-gl',
          rename: { stripBase: true },
        },
      ],
    }),
    VitePWA({
      registerType: 'prompt',
      // Brand manifest lives at /brand/manifest.webmanifest — disable plugin generation
      manifest: false,
      workbox: {
        clientsClaim: true,
        // Include brand assets in the precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.exchangerate-api\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'exchange-rates',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5,
            },
          },
          // METAR / TAF — Vercel serverless proxy
          {
            urlPattern:  /\/api\/weather\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 30 },
              networkTimeoutSeconds: 8,
            },
          },
          // NOTAM — autorouter.aero proxy
          {
            urlPattern:  /\/api\/notam\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'notam-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 30 },
              networkTimeoutSeconds: 8,
            },
          },
          // SkyLink — shared proxy (METAR/TAF/NOTAM fallback source, ADS-B,
          // aircraft lookup, schedules boards)
          {
            urlPattern:  /\/api\/skylink\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'skylink-data',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 30 },
              networkTimeoutSeconds: 8,
            },
          },
          // SIGMET — aviationweather.gov international SIGMET feed
          {
            urlPattern:  /\/api\/isigmet\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sigmet-data',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 30 },
              networkTimeoutSeconds: 8,
            },
          },
          // Aladhan prayer times API — network-first, 30-min TTL, 7-day cache window
          {
            urlPattern: /^https:\/\/api\.aladhan\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'prayer-api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              networkTimeoutSeconds: 10,
            },
          },
          // Geocoding proxy (Nominatim via /api/geocode)
          {
            urlPattern: /\/api\/geocode\b/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'geocode-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              networkTimeoutSeconds: 8,
            },
          },
          // CARTO basemap style/sprites/fonts/tiles — static-ish, so
          // CacheFirst lets the Route map's Dark/Vector tabs work offline
          // once a route has loaded them at least once this install.
          {
            urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-basemap-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  // maplibre-gl loads its tile-parsing code as a separate worker file via
  // `new Worker(new URL(...))` — Vite's dev dep pre-bundler flattens that
  // into a broken reference (404s), so tiles never parse and the map never
  // finishes loading. Excluding it from pre-bundling makes Vite serve it
  // natively instead, where that worker reference resolves correctly.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 3000,
    fs: { allow: ['.'] },
  },
})
