import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

export default defineConfig({
  // Emit JSON imports as JSON.parse('…') rather than an object literal with a
  // named export per key — far smaller/faster for the large airports.json.
  json: { namedExports: false, stringify: true },
  resolve: {
    alias: {
      '@brand/BrandBanner': resolve(__dirname, 'brand-kit/component/BrandBanner.jsx'),
      '@brand/SplashScreen': resolve(__dirname, 'brand-kit/component/SplashScreen.jsx'),
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'brand-kit/static/css/brand.css',  dest: 'brand' },
        { src: 'brand-kit/static/logo/logo-mark.svg',       dest: 'brand' },
        { src: 'brand-kit/static/logo/logo-mark-light.svg', dest: 'brand' },
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
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    fs: { allow: ['.'] },
  },
})
