# Daily Sales Manager Attribution Validation

## Scope

Daily Sales cards now expose **Manager** attribution only. The presentation projection passes no `driver_id`, `driver_name`, or `drivers_json` field to the card. Add Sales and Edit Sales no longer fetch drivers, render Driver Sales controls, or submit driver-attribution fields. The separate Driver Management module retains driver records, analytics, history, and dedicated **Record Driver Sale** and **Edit Driver Sale** flows.

## Database Integrity

Two additive migrations were applied to the live RestoCTRL database. The first adds `manager_user_id`, `manager_name`, and `manager_email`, backfills historical records without updating monetary fields, and creates an authenticated server-side attribution trigger. The second ensures that an approved manager resolved either by membership or profile cannot write outside their assigned branch.

A rollback-only live transaction used two existing approved branch managers. It verified that records were attributed to the correct authenticated manager, a Manager One cross-branch insert was rejected, a Manager Two record received its own identity, a metadata-only edit retained the first manager, and Cash, Network/POS, Credit, and Other components remained unchanged. No live manager, branch, Daily Sales, or driver record was retained.

## UI and Responsive Evidence

The Daily Sales card contract is tested to show the `Manager:` label and `UserRound` icon while containing no driver field or Truck icon. The same regression asserts manager branch filtering and the historical Manager presentation mapping. Its card structure uses `min-w-0`, truncation, wrapping, and overflow containment to protect narrow viewports. The managed `/sales` route was inspected at **1280×720**, **768×1024**, and **375×812**; the access-controlled portal shell rendered without horizontal overflow. Authenticated live list, Add Sales, and Edit Sales views were not opened because no user credentials were used. The prior disposable TEST OWNER strategy is intentionally not retried because hosted Auth rejected and rate-limited those fixtures; the rollback-only live manager/branch validation and source UI contracts provide the non-credential alternative without retaining an account or sales record.

## Automated Evidence

`pnpm test` completed with **31/31 tests passing**, including five Daily Sales contracts covering Manager-only presentation, Add/Edit Driver Sales separation, independent Driver Sales create/edit, historical Manager rendering, and multi-branch filtering. `NODE_ENV=production pnpm build` completed successfully for the source ERP release.
