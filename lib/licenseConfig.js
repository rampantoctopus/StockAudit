// Licensing / trial configuration.
//
// StockAudit uses the same Polar organization as XML2Excel — the org ID is
// account-level, not product-specific.
//
// Remaining setup, if not already done:
//   1. On the "StockAudit License" ($19) product in Polar, make sure a
//      "License Keys" benefit is attached (Benefits tab → Add → License
//      Keys). Without this, purchases won't issue a key.
//   2. Test a real purchase end-to-end against SANDBOX: true /
//      https://sandbox-api.polar.sh before relying on this in production.
//
// The Organization ID is NOT a secret — Polar's customer-portal license
// endpoints are designed to be called from desktop apps without any API token.

module.exports = {
  // Polar organization ID (same org as XML2Excel — required for activate/validate calls)
  POLAR_ORGANIZATION_ID: '729e6795-efcc-4904-ac4d-40369cebc2e2',

  // StockAudit's Polar checkout link — $19 one-time purchase
  BUY_URL: 'https://buy.polar.sh/polar_cl_qWuVYZrf05X0wPpPHqT4SB0zrrF2JCCaE1MFJ0NUsJS',

  // Use Polar's sandbox while testing purchases end-to-end, then set false
  SANDBOX: false,

  // Trial: number of successful workbook saves before a license is required
  TRIAL_LIMIT: 5,

  // Re-validate the stored license against Polar this often (ms). 7 days.
  REVALIDATE_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000,
};
