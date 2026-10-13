# Persian interface review — 2026-10-13

## Changes

Added 2,224 reviewed Persian interface phrases across navigation, public pages, owner/manager/employee/supplier portals, products, purchasing, inventory, cash register, treasury, sales closing, settings and feedback messages. Existing Arabic and English catalogs remain available. The literal resolver handles whitespace, HTML entities, case variants, count suffixes and date-shaped English labels without substring replacement of arbitrary descriptions.

The existing document localization bridge now includes native select labels while preserving their original submitted values, including React updates to implicit option values. Editable content, inputs, code and explicit translation exclusions are protected. Language selection normalizes regional language codes and synchronizes open tabs. Radix selects, dropdown menus and tabs receive the selected direction for keyboard navigation as well as layout.

The shared notification hook now implements localized success/error/info/warning methods. Cash register callers previously invoked missing success/error methods, which could throw after a successful operation.

## Verification

The TypeScript AST audit scans static JSX text, textual/description props, string-array items, labelled object properties and literal toast messages. The report lists technical exceptions explicitly. It does not claim coverage of every dynamic/server message, user-entered value or generated report. Run `node scripts/audit-persian-interface.mjs` to regenerate `reports/persian-interface-audit.json`; unreviewed candidates fail the check.

Component tests exercise Persian on initial load, FA/AR/EN switching, portalled content, reactive counts, native option labels and values, editable-content exclusions, cross-tab changes and actual notification-hook callbacks. The full suite passes 921 tests. Production compilation and explicit ESLint checks on changed runtime files pass.

Existing specialized PDF exporters were inspected; they receive the selected language and use the existing embedded script font. This change does not replace all PDF exporters or claim a visual review of every report.

## Font and remaining validation

The user has not supplied a font name or font file. Existing Persian/Arabic fonts are preserved; a typed chat message does not identify a transferable font. A requested replacement must be selected after receiving its name or file.

The catalog check is source coverage, not proof that every authenticated workflow has been manually visited. Runtime data and backend diagnostic messages can require additional language-specific handling. No financial data, schema, role permissions or accounting rules are changed by this patch.

## Production smoke follow-up

Live browsing confirmed Persian persisted after refresh, then exposed untranslated public-page description props, arrays and dynamic plan copy. The coverage scanner was expanded to include those source forms (4,000 candidates; 3,883 translated and 117 explicit technical exceptions). Public pages now expose the shared language switcher; capacities, recurring periods, discounts and trial disclosures localize at their formatter source while preserving USD prices and billing periods. Thirteen focused localization/pricing contract tests pass for this follow-up.
