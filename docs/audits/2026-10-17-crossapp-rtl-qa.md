# BizCTRL cross-app QA — 17 October 2026

## Evidence and limits
- Production baseline: Vercel commit `2548b70ce3b83b278d4bb1f63edf5a7714ead0f6` (merged PR #128), READY and aliased to `mybizctrl.site`. No grouped runtime errors reported in the examined 24-hour window. **This does not establish that all browser or business workflows pass.**
- PR #128 already isolates the new corporate PNG logo in a fixed LTR mobile header slot and applies iPhone-style Persian/Arabic font rules. The earlier screenshot predates/does not prove a defect in this latest code.
- Current PR targets cross-app issues that are reproducible in source without exposing production customer records.

## Confirmed and addressed
1. Public header/footer navigation text depended on post-render MutationObserver translation. HeaderLink and shared public footer now translate synchronously from LanguageContext. Public marketing product description + metadata and the two hero headline spans translate synchronously, while BizCTRL wordmark remains untouched/LTR.
2. Global ERP search compared only English module labels; users could see a translated sidebar item but not find it with the same Persian/Arabic words. Search now compares translated **and** canonical labels. Route IDs and permissions remain unchanged.
3. Global search popup used `w-full` with horizontal margins, which risks width overflow on small iPhones; now constrained to `calc(100% - 2rem)`, with 16px inputs and wrapped labels.
4. The authenticated mobile drawer was pinned to `left-0` even when `dir=rtl`. Logical `start-0` and direction-appropriate entrance animation ensure it opens from the leading side.
5. Shared unavailable-module display was English-first; it now renders localized module controls and description, preserving all records and permissions.

## Regression evidence
- New static and translation contract tests cover Arabic/Persian public product descriptions, metadata, navigation, RTL logo layout, translated module search, mobile viewport width and the disabled-module shell.
- Review GitHub Actions and Vercel Preview for the final PR head. Code tests are not a substitute for Safari/Chrome screenshots or interactive walkthroughs.

## Still requiring role-specific live validation
- Owner, branch manager, employee and supplier authentication / security and RLS.
- Real Restaurant POS / Retail POS checkout, printing, returns and closing.
- Sales, purchases, expenses, treasury sponsor/owner postings and PDF/P&L reconciliation.
- Inventory transfers, consumption costing, barcode, stock and supplier ledger.
- Payroll attendance using an approved employee PIN and branch GPS.
- Arabic/Persian screenshot coverage at 320/375/390/430px, mobile Safari safe areas and Android Chrome.
- PWA installed-icon cache refresh after app-icon updates and separately rendered PDF font validation.

No SQL migrations, tenant data edits, financial calculations or role-policy changes are part of this PR. Mark any live smoke test as unverified until performed with authorized test accounts.
