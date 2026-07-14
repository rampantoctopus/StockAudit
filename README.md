# StockAudit — Desktop App

Audit your XML against your StockSilo download log and export a
licensing-ready workbook. Everything — parsing, matching, and the export
itself — runs locally in the app; nothing uploads anywhere, and once
installed it needs no internet connection.

This is the same tool as the standalone `ClipLog.html` file it started as,
just packaged as a real app window instead of something you open in a
browser (and renamed along the way — same tool under the hood).

## Run it (development mode)

You'll need [Node.js](https://nodejs.org) installed (18+ is fine).

```
cd StockAudit-App
npm install
npm start
```

That opens StockAudit in its own window.

## Build a real installer (.dmg / .exe / AppImage)

```
npm run dist
```

This uses `electron-builder` to produce a distributable in `dist/`:
- **macOS** (Mac Mini M4 → arm64): a `.dmg` and a `.zip`.
- **Windows**: an NSIS installer and a portable `.exe`.
- **Linux**: an `AppImage`.

You only need to build for the platform(s) you'll actually use.

### Windows builds run in CI, not locally on this Mac

`npm run dist` only builds for the platform it's run on, and this Mac has no
Wine installed, so it can't cross-compile the Windows NSIS/portable targets.
Instead, `.github/workflows/windows-build.yml` builds them natively on a
`windows-latest` GitHub Actions runner:
- Trigger manually from the Actions tab (`workflow_dispatch`), or push a
  version tag (`git tag v1.1.2 && git push --tags`) to also draft a GitHub
  Release with the `.exe` files attached.
- Output lands as a downloadable workflow artifact either way.

### First launch on macOS (unsigned builds only)

If you build without signing env vars set (see **Code signing & notarization**
below), Gatekeeper will block the first launch since the app is unsigned:
- Right-click the app → **Open** → confirm, or
- `xattr -cr "/Applications/StockAudit.app"` in Terminal once, after copying
  it to Applications.

Signed + notarized builds don't need this — they open normally immediately.

## Building on macOS 26 — use ~/Developer, not ~/Desktop or ~/Documents

On macOS 26, files touched from a TCC-protected folder (`~/Documents`,
`~/Desktop`, `~/Downloads`) get silently stamped with a `com.apple.macl` /
`com.apple.provenance` extended attribute that `codesign` refuses to sign
over — you'll see an error like *"resource fork, Finder information, or
similar detritus not allowed"*. This is a proven issue (confirmed via an
A/B/C test: an identical binary signs fine in `/tmp`, fails in
`~/Documents`), not specific to this project.

**Keep the project in `~/Developer` (or anywhere outside those protected
folders) before running `npm run dist`.** As a second line of defense, an
`afterPack` hook (`scripts/afterPack.js`) also strips extended attributes
from every file in the packaged app before signing — same fix used in
XML2Excel and TC-100 — but the folder location is the real fix; don't rely
on the hook alone.

## Code signing & notarization

`package.json` is wired for signing and notarization (`hardenedRuntime`,
`entitlements`, `notarize: true`), but no credentials are stored in the
repo — they're picked up from environment variables at build time, or from
your login Keychain.

**Signing** — electron-builder auto-discovers a "Developer ID Application"
certificate from Keychain. If it's already installed (Xcode → Settings →
Accounts → Manage Certificates, or exported from your Apple Developer
account), you don't need to set anything — just run `npm run dist` without
`CSC_IDENTITY_AUTO_DISCOVERY=false` this time.

**Notarization** — requires ONE of these env var sets at build time:

```
# Option A — App Store Connect API key (recommended, doesn't expire, no 2FA prompts)
export APPLE_API_KEY=/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=your-issuer-uuid

# Option B — Apple ID + app-specific password
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=YOURTEAMID
```

Generate an API key at App Store Connect → Users and Access → Keys, or an
app-specific password at appleid.apple.com → Security. Once one of those
sets is exported in your shell, just run:

```
npm run dist
```

electron-builder signs, then notarizes (uploads to Apple, waits for approval,
staples the ticket) automatically — no extra flags, no `afterSign` hooks.
This adds a few minutes to the build for the Apple round-trip.

## Licensing (trial + Polar)

StockAudit uses the same trial-then-license-key pattern as XML2Excel: 5 free
workbook saves, then a Polar license key is required. Config lives in
`lib/licenseConfig.js`.

**Before shipping a sellable build**, you need to:
1. In the Polar dashboard, create a one-time-purchase product —
   "StockAudit License", **$19.00**.
2. On that product, attach a **License Keys** benefit (Benefits tab → Add →
   License Keys). Without this, purchases won't issue a key.
3. Copy the checkout link into `BUY_URL` in `lib/licenseConfig.js` —
   it currently has a placeholder (`REPLACE_ME...`) that will not work.
4. Test a real purchase against `SANDBOX: true` first, then flip to `false`.

The trial counter and stored license live in a small `license.json` file
under the OS's app-data directory (via `app.getPath('userData')`) — not
bundled with the app, never synced anywhere.

## Project layout

```
StockAudit-App/
├── main.js              # Electron main process — creates the app window,
│                         # handles the native Save As dialog + file write,
│                         # and the license IPC handlers
├── preload.js            # Exposes window.stockAudit.* bridge methods
│                         # (saveWorkbook, getLicenseStatus, activateLicense,
│                         # deactivateLicense) via contextBridge
├── lib/
│   ├── licenseConfig.js   # Polar org ID, checkout URL, trial limit, sandbox flag
│   └── licensing.js       # Trial counting + Polar customer-portal API calls
│                          # (activate/validate/deactivate) — pure Node, no
│                          # Electron APIs, so it's unit-testable standalone
├── package.json          # Scripts + electron-builder config (incl. signing)
├── scripts/
│   └── afterPack.js       # Strips macOS provenance/TCC extended attributes
│                          # from the packaged app before signing
├── build/                # App icons + entitlements.mac.plist for hardened
│                         # runtime, read at build time and at runtime for
│                         # the Dock icon
└── app/
    ├── index.html         # The actual tool (UI + parsing + export logic +
    │                       # license strip/activation panel)
    └── vendor/            # Bundled xlsx.js (reads CSV/XLSX logs) and
                            # exceljs.js (writes the colored xlsx export) —
                            # both local, so no CDN/internet needed at runtime.
```

## Updating the tool itself

All the actual logic (XML parsing, stock-site name matching, cue sheet
generation) lives in `app/index.html`. Edit that one file and `npm start`
again to see changes; no rebuild needed until you're ready to cut a new
installer.

## Before every build

Bump the version number (`package.json` → `"version"`) and confirm the
copyright/author fields still read RampantOctopus Softworks before running
`npm run dist`.
