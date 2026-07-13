// © 2026 RampantOctopus Softworks
//
// Trial + license-key handling for the main process. Concept mirrors
// XML2Excel's licensing (5 free uses, then require a Polar license key),
// adapted for StockAudit's architecture: no local HTTP server here, so this
// is called directly from main.js and exposed to the renderer over IPC
// instead of via fetch() to /api/license/*.
//
// State is stored as a small JSON file in the app's userData directory —
// never bundled with the app, never synced anywhere.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const config = require('./licenseConfig');

const API_BASE = config.SANDBOX ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';

class Licensing {
  constructor(userDataPath) {
    this.statePath = path.join(userDataPath, 'license.json');
    this.state = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        trialCount: parsed.trialCount || 0,
        key: parsed.key || null,
        activationId: parsed.activationId || null,
        customerEmail: parsed.customerEmail || null,
        lastValidatedAt: parsed.lastValidatedAt || null,
        deviceId: parsed.deviceId || crypto.randomUUID(),
      };
    } catch {
      return {
        trialCount: 0,
        key: null,
        activationId: null,
        customerEmail: null,
        lastValidatedAt: null,
        deviceId: crypto.randomUUID(),
      };
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist license state:', err);
    }
  }

  get licensed() {
    return Boolean(this.state.key && this.state.activationId);
  }

  // Can the user perform one more save right now?
  canUse() {
    return this.licensed || this.state.trialCount < config.TRIAL_LIMIT;
  }

  // Call after a successful workbook save. No-ops once licensed.
  recordSuccessfulUse() {
    if (this.licensed) return;
    this.state.trialCount += 1;
    this._save();
  }

  getStatus() {
    return {
      licensed: this.licensed,
      customerEmail: this.state.customerEmail,
      trialRemaining: Math.max(0, config.TRIAL_LIMIT - this.state.trialCount),
      trialLimit: config.TRIAL_LIMIT,
      buyUrl: config.BUY_URL,
    };
  }

  _label() {
    return `${os.hostname()} (${this.state.deviceId.slice(0, 8)})`;
  }

  async activate(rawKey) {
    const key = (rawKey || '').trim();
    if (!key) return { ok: false, error: 'Enter a license key.' };

    let res;
    try {
      res = await fetch(`${API_BASE}/v1/customer-portal/license-keys/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          organization_id: config.POLAR_ORGANIZATION_ID,
          label: this._label(),
        }),
      });
    } catch {
      return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
    }

    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: 'That license key was not found.' };
      if (res.status === 422) return { ok: false, error: 'That license key looks invalid — check for typos.' };
      return { ok: false, error: `Activation failed (${res.status}).` };
    }

    const data = await res.json();
    this.state.key = key;
    this.state.activationId = data.id;
    this.state.customerEmail = data.license_key?.customer?.email || null;
    this.state.lastValidatedAt = Date.now();
    this._save();

    return { ok: true, status: this.getStatus() };
  }

  async deactivate() {
    if (this.licensed) {
      try {
        await fetch(`${API_BASE}/v1/customer-portal/license-keys/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: this.state.key,
            organization_id: config.POLAR_ORGANIZATION_ID,
            activation_id: this.state.activationId,
          }),
        });
      } catch {
        // Best-effort — clear locally regardless, matching the "network
        // failures are forgiven" posture used elsewhere in this module.
      }
    }
    this.state.key = null;
    this.state.activationId = null;
    this.state.customerEmail = null;
    this.state.lastValidatedAt = null;
    this._save();
    return { ok: true, status: this.getStatus() };
  }

  // Fire-and-forget on launch. A definitive rejection (key revoked/not
  // found) clears the stored license; network failures are forgiven so a
  // offline editor doesn't get locked out of a license they already have.
  async revalidateIfDue() {
    if (!this.licensed) return;
    const due = !this.state.lastValidatedAt ||
      (Date.now() - this.state.lastValidatedAt) > config.REVALIDATE_INTERVAL_MS;
    if (!due) return;

    let res;
    try {
      res = await fetch(`${API_BASE}/v1/customer-portal/license-keys/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: this.state.key,
          organization_id: config.POLAR_ORGANIZATION_ID,
          activation_id: this.state.activationId,
        }),
      });
    } catch {
      return; // offline — forgive, try again next launch
    }

    if (res.status === 404 || res.status === 422) {
      // Key no longer valid for this org/activation — clear it.
      this.state.key = null;
      this.state.activationId = null;
      this.state.customerEmail = null;
      this.state.lastValidatedAt = null;
      this._save();
      return;
    }

    if (res.ok) {
      const data = await res.json();
      if (data.status && data.status !== 'granted') {
        this.state.key = null;
        this.state.activationId = null;
        this.state.customerEmail = null;
        this.state.lastValidatedAt = null;
      } else {
        this.state.lastValidatedAt = Date.now();
      }
      this._save();
    }
    // Other non-ok statuses (5xx): forgive, leave state as-is.
  }
}

module.exports = { Licensing };
