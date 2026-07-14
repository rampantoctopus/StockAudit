# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StockAudit is an Electron desktop app that audits an XML export against a
StockSilo download log and produces a licensing-ready xlsx workbook. All
parsing, matching, and workbook generation runs locally in the renderer —
nothing is uploaded, and the app needs no internet connection except for
license activation/validation against Polar.

It's the same tool as the standalone `ClipLog.html` it started as, now
packaged as a real app window instead of a browser page.

## Commands

```
npm install     # install deps
npm start       # launch the app (electron .)
npm run dist    # build installers via electron-builder → dist/
```

There is no test suite, linter, or type checker configured in this repo.

### Building installers

`npm run dist` only builds for the platform it's run on:
- **macOS**: produces `.dmg` + `.zip` (arm64 + x64), and is signed/notarized
  if Apple credentials are present (see `README.md` → "Code signing &
  notarization" for the required env vars). Without them it produces an
  unsigned build.
- **Windows**: NSIS installer + portable `.exe`. This Mac has no Wine
  installed, so Windows builds don't cross-compile locally — they run in CI
  via `.github/workflows/windows-build.yml` on a `windows-latest` runner
  (manual `workflow_dispatch`, or push a `v*` tag to also draft a GitHub
  Release with the `.exe` files attached).
- **Linux**: AppImage.

**Build from `~/Developer`, not `~/Desktop`/`~/Documents`/`~/Downloads`.**
On macOS 26, files touched from those TCC-protected folders get stamped with
a `com.apple.macl`/`com.apple.provenance` extended attribute that `codesign`
refuses to sign over. `scripts/afterPack.js` strips these attributes from
the packaged app as a second line of defense, but the folder location is the
real fix — don't rely on the hook alone.

**Before every build**: bump `"version"` in `package.json` and confirm the
copyright/author fields still read RampantOctopus Softworks.

## Architecture

Two-process Electron app with a narrow, explicit IPC surface:

- **`main.js`** — creates the `BrowserWindow`, owns the native "Save As"
  dialog + file write (`save-workbook` IPC handler), and owns the
  `Licensing` instance (`license-status` / `license-activate` /
  `license-deactivate` handlers). `contextIsolation: true` and
  `nodeIntegration: false` — the renderer has no direct Node/fs access.
- **`preload.js`** — exposes exactly four methods on `window.stockAudit.*` via
  `contextBridge`: `saveWorkbook`, `getLicenseStatus`, `activateLicense`,
  `deactivateLicense`. This is the entire main↔renderer surface; there is no
  broader IPC channel to route through.
- **`app/index.html`** — the actual tool. All XML parsing, stock-name
  matching, tally-building, and xlsx generation happen here, using the
  bundled `app/vendor/xlsx.full.min.js` (reads CSV/XLSX logs) and
  `app/vendor/exceljs.min.js` (writes the colored xlsx export) — both local,
  no CDN calls. **This is the file to edit for any change to the tool's
  actual logic**; `npm start` picks up changes on reload, no rebuild needed.
  Roughly organized (grep for `// ----------` section markers) into: XML
  parsing (`parseXmeml`), CSV/XLSX log loading, name-matching heuristics
  (`detectStock`, `similarity`), tally group building (`buildGroups`), the
  licensing UI panel, and result rendering/export.
- **`lib/licensing.js`** — trial counting (5 free saves, then a license key
  is required) + Polar customer-portal API calls (activate/validate/
  deactivate). Pure Node, no Electron APIs, so it's unit-testable in
  isolation even though nothing currently exercises that. State persists as
  JSON in `app.getPath('userData')` — never bundled, never synced. Concept
  mirrors XML2Excel's licensing, adapted for a no-local-HTTP-server desktop
  app (called directly from `main.js` over IPC rather than via `fetch()` to
  a `/api/license/*` route).
- **`lib/licenseConfig.js`** — Polar org ID (shared account-level ID across
  RampantOctopus products, not product-specific), checkout `BUY_URL`, trial
  limit, sandbox flag. Before shipping a sellable build: a "License Keys"
  benefit must be attached to the Polar product or purchases won't issue a
  key, and `SANDBOX` must be flipped `false` after end-to-end purchase
  testing.
- **`build/`** — icons + `entitlements.mac.plist`/`entitlements.mac.inherit.plist`
  for hardened runtime (JIT, network client for Polar calls, user-selected
  file read/write for the Save dialog).
- **`scripts/afterPack.js`** — macOS-only `afterPack` hook, see above.

## Licensing model

Trial-then-license-key, same pattern as XML2Excel: 5 free workbook saves,
then a Polar license key is required to continue. The renderer calls
`window.stockAudit.saveWorkbook(...)`; `main.js` checks `licensing.canUse()`
before ever opening the native Save dialog, returning
`{ trialExhausted: true, status }` instead if the trial is exhausted and no
license is active.
