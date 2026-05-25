import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const usePrayerStore = create(persist(
  (set) => ({

    // ── Location ──────────────────────────────────────────────────────────
    location: { lat: null, lng: null, city: null, country: null, source: 'gps' },
    setLocation: (loc) => set({ location: loc }),

    // ── Prayer times ──────────────────────────────────────────────────────
    prayerTimes:  null,
    dataSource:   null,   // 'api' | 'local'
    lastFetched:  null,
    setPrayerTimes: (times, source) => set({
      prayerTimes: times,
      dataSource:  source,
      lastFetched: Date.now(),
    }),

    // ── Settings ──────────────────────────────────────────────────────────
    settings: {
      calculationMethod: 'jakim',   // default Malaysia
      madhab:            'shafi',   // 'shafi' | 'hanafi'
      timeFormat:        '24hr',    // '24hr' | '12hr'
    },
    updatePrayerSettings: (patch) => set((s) => ({
      settings: { ...s.settings, ...patch },
    })),

  }),
  { name: 'prayer-module-store' }   // scoped localStorage key — never collides with parent
))

export default usePrayerStore
