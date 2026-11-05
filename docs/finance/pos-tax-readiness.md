# Branch POS tax preparation

This change adds preparation and shadow observation, **not a compliant fiscal invoicing system or a government connection**. It does not activate tax collection or change any menu price/rate. The country is explicitly entered for the registered business at each branch, never inferred from language, currency or location. No country currently supports live submission in this implementation.

## What runs

Finance & Tax shows a separate branch tax form for restaurant/cafe businesses. An approved owner can save the legal country, name, registration status and number. The RPC enforces ownership and branch membership; a browser route is not the authorization boundary. Branch profile versions reject stale concurrent saves. Settings are separate from the organization-wide finance preferences and have their own save button.

Disabled is the default. Opting into shadow observations atomically captures the profile version, existing POS line data and existing totals when a future restaurant order transitions to paid. These records are diagnostic observations, not fiscal documents, and are never sent to an authority. Application users cannot edit/delete them. Existing orders are not backfilled. The existing numeric tax computation remains authoritative for checkout. A zero-rate product is flagged for review, never automatically classified as exempt.

Apply `20261029204621_restaurant_pos_tax_readiness.sql` after the existing restaurant POS migrations, before releasing the frontend. Without it the form reports a load error and offers retry. This migration has been tested on disposable PostgreSQL (PGlite), not applied to a production database. Existing restaurant checkout workflow still requires staging validation against the full production schema before release.

## Verification

- `npx vitest run tests/posTaxReadiness.test.jsx tests/erpSettingsCenter.test.js tests/restaurantPOS.test.jsx`
- `npm run build`
- `npx eslint src/components/settings/POSTaxReadiness.jsx src/pages/FinanceTaxSettings.jsx src/lib/erpSettings.js scripts/test-pos-tax.mjs tests/erpSettingsCenter.test.js tests/posTaxReadiness.test.jsx --quiet`
- Install `@electric-sql/pglite@0.3.14` in a temporary prefix, then set `PGLITE_MODULE` to its absolute `dist/index.js` path and run `node scripts/test-pos-tax.mjs`. This harness creates a disposable PostgreSQL database, runs the real existing membership guard and new migration, and tests permissions, validation, stale saves, snapshot persistence, repeated payment transitions and disabled mode. Its minimal fixture does not replace a full Supabase integration test.

The existing npm lockfile is out of sync with package.json; validation used `npm install --ignore-scripts --package-lock=false` without changing dependency manifests. The local build lacks deployment environment variables; it verifies compilation, not access to the live API.

## Work remaining before any live activation

1. Implement and verify country-specific, effective-dated tax rule packs and product classifications (standard, zero, exempt, out-of-scope), including registration applicability and reasons. Arbitrary two-letter country codes stored here indicate configuration only, not country support.
2. Integrate exact calculation and immutable fiscal documents with checkout, discounts, returns/credit notes and accounting; keep payment status separate from authority status.
3. Implement the Saudi XML/signature/QR, EGS device onboarding and counter/hash chain, secure server-only CSID storage, outbox, idempotent retry/reconciliation, and B2B clearance / B2C reporting flows. No credential entry is exposed by this PR because those server components are not implemented.
4. Validate with official tooling and sandbox; then onboard the actual registered business using its credentials. API credentials alone do not complete these implementation steps. Never put private keys in AppSettings, frontend bundles or source control.
5. Verify full-stack tenant isolation, concurrency, fiscal immutability, failure recovery and operational monitoring before enabling production. Additional countries require their own verified adapter and rules; there is no zero-tax fallback.

Official Saudi references reviewed 2026-10-29:
- https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf
- https://zatca.gov.sa/en/E-Invoicing/Introduction/FAQ/Pages/default.aspx
