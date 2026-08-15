# Pharmacy Owner Portal Validation Record

## Scope

This record captures the remediation of the Pharmacy Owner portal failure without creating test tenants, retaining user credentials, or modifying customer data. The defect path was traced to an invalid onboarding mode mapping, an absent database enum value, and missing canonical owner memberships for Pharmacy organizations.

| Validation area | Evidence | Result |
|---|---|---|
| Canonical Pharmacy mode | Separate enum migration followed by a committed repair migration | `pharmacy` is a valid `business_mode_type` value. |
| Existing Pharmacy data | Narrow repair query filters only `business_type = 'pharmacy'` | No non-Pharmacy organization can be changed by the repair. |
| Future owner membership | `AFTER INSERT` trigger projects a missing approved owner membership only | New Pharmacy owner organizations resolve through the canonical membership path. |
| Dashboard availability | Safe shell blocks content hooks until auth, tenant, and portal identity are ready | Null tenant and refreshing identity states render loading, retry, or session-expired UI rather than a blank screen. |
| Widget failures | Per-widget error boundary offers a retry action | A failed module is isolated from the rest of the dashboard. |
| Header availability | Header returns no content while identity is missing or loading, and displays an em dash for a null owner name | Incomplete profile data cannot crash the header. |
| Tenant isolation | Active organization changes key identity queries by authenticated user and restaurant; user changes clear cached queries and reset selected tenant ID | Restaurant or Retail identity is not retained into a Pharmacy session. |
| Role and mode matrix | Mounted mocked `TenantProvider` tests exercise Owner and Manager sessions across Restaurant, Pharmacy, and Retail | Each scenario resolves the expected organization, portal type, and role; Pharmacy does not render Restaurant or Retail portal type. |
| Production aggregate audit | Read-only audit of enum, trigger, Pharmacy rows, and approved owner membership count | Enum and trigger are present; the production database currently has zero Pharmacy organizations, so no live authenticated Pharmacy Owner session exists to exercise or alter. |

## Automated validation

The final source suite passes **54 tests across 10 files**, including the added Pharmacy resilience contracts and six Owner/Manager portal-resolution scenarios. The source production build completes successfully with `NODE_ENV=production pnpm build`.

## Non-destructive verification boundary

No production Pharmacy organization, customer account, or browser credential was created for this validation. Consequently, an authenticated end-to-end Pharmacy Owner browser session cannot be executed against the current production data. The remediation is instead verified through live schema and trigger state, mounted controlled tenant tests, source contracts, production build output, and managed-preview runtime-log inspection. A future genuine Pharmacy organization will follow the same committed canonical path without any user-specific hardcoding.
