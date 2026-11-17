# OFP / EFF app investigation — findings (2026-11-17)

Investigation into getting the OFP out of the in-house iPad **EFF** app
(Electronic Flight Folder, no longer on the App Store) using on-device HTTPS
capture (Proxyman). Goal: understand how the app fetches OFPs, and whether that
could feed the SuperApp *before* departure (the SuperApp's current CVR method
only works *after* the report is submitted).

## What the app does (confirmed by traffic capture)

The EFF app downloads the whole flight folder as ONE request:

```
GET https://cvr.batikair.com.my/api/api/eff/download-zip
      ?user=<staffid>@BATIKAIR.COM.MY
      &forDayUtc=YYYY-MM-DD
      &FltDsc=<flightno>        e.g. OD193
```

- Response: `200 OK`, `application/zip`, ~2.9 MB.
- **Works BEFORE the flight** (captured while flight status = "Not yet departed").
- Auth: `Authorization: Bearer <JWT>` (handed out after the Microsoft/Azure AD
  company login; short-lived, auto-refreshed by the app).
- Also carries a Cloudflare `__cf_bm` cookie (the site is behind Cloudflare).
- App User-Agent: `EFF/185 CFNetwork/... Darwin/...` (native iOS app).

This is the **same `download-zip` endpoint the SuperApp already knows about and
deliberately avoids** (see root CLAUDE.md note) — because the zip is encrypted.

## What's inside the zip (confirmed)

Full flight folder. Key entries:
- `Flight plan/XmlOFP.txt` (~645 KB) — the OFP the SuperApp reads
- `Flight plan/XmlOFP-JSON.txt`, `Waypoints-JSON.txt`, `Fuel_And_Weights-JSON.txt`, `UpperAir*.txt`
- `Paper Flight Briefing/PFB.pdf`, `PFP.pdf`
- `Route Profiles/*.png`, `Satellite/*.png`, `Weather/**`, `NOTAMs/**`, `Flight information/Airspace.txt`

## The blocker

**Every entry is encrypted** (ZipCrypto / traditional PKWARE — flag bit 0 set,
compression still method 8/deflate, i.e. NOT AES). The decryption password lives
inside the EFF app. This matches the CLAUDE.md note: "download-zip gives a
ZipCrypto-ENCRYPTED zip a browser can't open, so it is NOT used."

So: the OFP is downloadable pre-flight, but sealed. To read it outside the app
you'd need the password, which means either cracking ZipCrypto or pulling the
key out of the app binary. **Attempting to guess the password was blocked by a
safety guardrail (unauthorized access) — not pursued.** Decision: do NOT crack
company encryption (ToS / account-flag risk). Stopped here.

## Two capture methods, two states

- **Pre-flight:** only `download-zip` works → encrypted. (dead end without key)
- **Post-flight:** CVR website endpoints (`FlightPlanFiles` + `FlightPlanFile`)
  return the XmlOFP **already decrypted as plain text** — this is what the
  SuperApp's existing "From CVR" sync uses.

## Recommended next steps (legitimate only)

1. Keep using the EFF app directly for pre-flight OFPs (it decrypts + shows them).
2. SuperApp keeps its post-flight CVR plaintext sync.
3. If pre-flight OFP in the SuperApp is really wanted: ask ops/dispatch/IT for a
   sanctioned way to receive the OFP file (and, if ever provided officially, the
   zip password — then the SuperApp could decrypt `download-zip` directly).

## Reference (how to re-capture)

iPad: Proxyman (free, App Store id1551292695) → install + trust its root cert
(Settings → General → About → Certificate Trust Settings) → enable SSL proxying
for `cvr.batikair.com.my` → record → download OFP in the EFF app → find the
`download-zip` request → long-press → Share This Request → HAR.
The HAR embeds the zip (base64 in `response.content.text`).
