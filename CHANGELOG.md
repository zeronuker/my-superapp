# Changelog

## v3.14 — 2026-06-25

### FTL Calculator (CAD 1901 Compliance Audit)

#### New Features
- **Delayed Reporting (Ch. 2.7)** — models planned vs. actual report time. Delay <4h: Max FDP based on the original report-time band, clock starts at the actual report time. Delay ≥4h: Max FDP based on the more limiting of planned/actual bands, clock starts exactly 4h after the original report time.
- **Positioning (Ch. 2.8)** — FDP now correctly commences at the positioning report time instead of the flight's own report time; no longer requires a separate report time at all. Counts as a sector when combined with Split Duty, per Ch. 2.8.2.
- **Standby location (Ch. 2.9.1 / 2.9.2)** — new Home/Airport selector. Airport standby always uses the standby-start band; home standby keeps the general comparison logic, plus a ≤2h-notice exception. Airport standby now shows Max FDP immediately from standby start, with FDP Expires marked pending until the actual call-out time is entered.
- **Reduced Preceding Rest toggle** — gates three previously-untracked rules: blocks Split Duty outright (Ch. 2.13.4), restricts PIC discretion to immediately-before-the-last-sector (Ch. 2.15.3), and forces mandatory CAAM reporting regardless of extension size (Ch. 2.15.4).
- **Cabin crew separate report time (Ch. 2.21.2a)** — the table band uses flight crew's report time, but the FDP clock (start/end, standby duration) uses cabin crew's own report time when they differ.
- **Result panel color coding** — pending/incomplete inputs now shown in amber; mandatory CAAM reporting and rule violations shown in red, distinct from purely explanatory notes.

#### Bug Fixes
- Standby Max FDP was using only the report-time band, ignoring the standby-start band entirely. Now correctly compares both and uses whichever is more limiting (Ch. 2.9.1).
- PIC discretion's 2h/3h sector-position cap was reading the long-range-modified sector count instead of the real sector count.
- Long range sector modifier was triggering at exactly 7h instead of strictly above 7h (Ch. 2.11).
- Single-pilot operations no longer allow "Not Acclimatised" to be selected — CAD 1901 defines no such table for single-pilot ops.

---

## v3.12 — 2026-06-24

### Duty Log Module

#### Backup & Sync Redesign
- Each device now has a persistent ownership claim on a sync code: only the owning device can push backups, and restoring/importing from a code transfers ownership to the device that did it
- Per-entry sync status shown right on each log card — a green SYNCED dot, or a one-tap ○ SYNC button for anything pushed since the last backup
- Creating a new log now prompts to sync it immediately (or jump to Settings to set up sync first if none exists yet)
- Sync code and QR are now always visible in Settings once created, instead of being hidden behind a tab
- New "Have a code? Enter here to view it" panel directly in the Duty Log screen — view another device's backed-up logs read-only with no effect on this device, with an optional, confirm-gated "Import to this device" action that overwrites local logs and transfers ownership (clearly warned as not reversible)
- Restoring from Settings now requires an explicit two-tap confirmation (replacing the old browser confirm dialog) and carries the same ownership-transfer warning

---

## v3.11 — 2026-06-24

### Duty Log Module

#### Backup & Sync
- Back up your duty logs to the cloud and restore them on another device using a short anonymous code — no account required, the code is the only credential
- Backup & Sync moved into Settings, with a status card showing last-synced time (relative, e.g. "2 MIN AGO") and a BACKUP / RESTORE tab switcher
- Generate a QR code for your backup code, or scan one with the camera to restore — manual code entry still works as a fallback if the camera is unavailable

#### Settings Cleanup
- Removed the JSON export/import and reset-to-defaults section, superseded by Duty Log Backup & Sync

---

## v3.9 — 2026-06-19

### Flight Module (Prayer Tab)

#### In-Flight Prayer Timeline
- Replaces the single frozen "current position" snapshot with a vertical timeline plotting every Imsak, Fajr, Sunrise, Dhuhr, Asr, Maghrib, and Isha that falls during the flight
- Each prayer is solved self-consistently against the aircraft's moving position (dead reckoning) rather than estimated once at a single point in time
- Long-haul flights spanning more than one calendar day correctly show repeated occurrences (e.g. two Fajrs on an 18h+ flight), each tagged "DAY 2" etc.
- Timeline rows are spaced proportionally to elapsed time (not row count), so the connecting progress line lines up exactly with the live current-position marker
- A dashed "current position" card sits inline at its correct chronological slot, showing live coordinates, NM flown/remaining, % complete, and a manual refresh button
- Auto-refreshes when returning to the Flight tab or when the app is foregrounded (screen unlock, switching back from another app) — no longer goes stale or disappears on tab switch

#### Departure / Arrival Clock Toggle
- New DEP TIME / ARR TIME toggle on the prayer list — the same in-flight prayer moment can now be read on either the departure-zone or arrival-zone watch
- Resolves confusion over which timezone the displayed prayer times were in

#### Bug Fix — Local-Time Progress Calculation
- Clock-mode local-time elapsed/total calculation anchored dep/arr time conversion to the device's UTC calendar date instead of each airport's own local date
- Could inflate elapsed time by a full day and show the flight as 100% complete shortly after a departure during UTC+8 morning hours (e.g. Malaysia-based flights)

---

## v3.8 — 2026-06-18

### Prayer Module

#### 5-Day Prayer Times
- Day selector strip added at the top of the Solat tab (Today · +1 · +2 · +3 · +4)
- Today is always the active default
- Future days computed instantly using local adhan calculation — no network, no delay
- "Next prayer" countdown and done/next row highlights are shown only for Today

#### Next Prayer Widget (Perpetual Countdown)
- After Isha passes, the launcher dashboard widget now counts down to the next day's Fajr instead of disappearing
- Widget is permanently visible as long as prayer times are loaded

#### Launcher Default Behaviour
- Selecting launcher nav style in Settings now always opens the dashboard home
- Previously, "remember last tab" could bypass the dashboard on first load
- Switching to launcher mid-session also immediately returns to the dashboard

---

### Flight Module (Prayer Tab)

#### Timezone-Aware Clock Mode
- In clock mode with LOCAL selected, departure time is interpreted in the departure airport's timezone and arrival time in the destination airport's timezone
- Eliminates the need to manually convert times — input your STD/STA in local time directly
- Covers 4,345 airports with IANA timezone data (OpenFlights cross-reference)
- Gracefully falls back to device local time when airport timezone data is unavailable

#### Flight Time Info Banner
- A live info banner appears beneath the dep/arr time fields in clock mode as you type (no CALCULATE press needed)
- Shows total flight duration (e.g. 8h 50m), detected timezone offsets per airport (e.g. UTC+8 → UTC+10), and flags when timezone data is missing

#### Airport Database
- Regenerated: 4,906 airports total, 4,345 with IANA timezone strings
- Source: OurAirports (names/coords) cross-referenced with OpenFlights (timezones)

#### UX Improvements
- Departure time label changed to **DEP TIME (ETD)**
- Swap button (⇄) added between the dep/dest ICAO fields — tap to reverse route for return leg
- Disclaimer updated to **ESTIMATED TIME AND POSITION ONLY**
- Cabin direction dial now shows a narrow-body airliner silhouette with swept wings

---

## v3.7 — 2026-06-13

- 20-issue reliability, offline, and ToS compliance audit pass
- Next prayer widget live countdown with seconds
- Flight inputs persist across tab switches
