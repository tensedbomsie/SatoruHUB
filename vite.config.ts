import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri sets TAURI_ENV_PLATFORM during `tauri build`/`tauri dev`. The packaged
// .exe already bundles every asset locally, so the PWA service worker adds no
// offline benefit there and only causes rebuilds to keep serving a stale
// cached UI until it's manually cleared — skip it for that build target.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    !isTauri && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // hub.ppchan.com also serves every other app in the family at the
        // same origin (/FoodDiary/, /WorkoutTracker/, etc., embedded in the
        // wheel's iframe overlay) — without this, this SW's SPA fallback
        // hijacks navigation to those paths too and serves SatoruHUB's own
        // cached shell instead, which then 404s trying to load its own
        // asset paths relative to the wrong subpath.
        navigateFallbackDenylist: [
          /^\/(Storyboard|FoodDiary|WorkoutTracker|MovieHub|MoneyDiary|TechDictionary|BookingDemoLite|BookingSystemDemo|LeadDemos)\//,
        ],
      },
      manifest: {
        name: 'Satoru HUB',
        short_name: 'Satoru HUB',
        description: 'ทางเข้ารวมทุกเว็บส่วนตัว',
        start_url: '/SatoruHUB/',
        scope: '/SatoruHUB/',
        display: 'standalone',
        background_color: '#0a0b0f',
        theme_color: '#0a0b0f',
        icons: [
          { src: 'pwa-icon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
