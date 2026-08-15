# Authenticated Portal Identity Validation

## Server Authority

The additive `erp_get_authenticated_portal_identity` function derives the viewer only from `auth.uid()` and verifies the requested restaurant against an approved `erp_memberships` row before returning the owner snapshot. Its input cannot create a new tenant relationship; an out-of-scope restaurant raises `TENANT_SCOPE_DENIED`. The live rollback-only validation confirmed both membership-scoped response behavior and cross-tenant rejection.

## Header Coverage

`ERPHeader`, the global header rendered by `ERPLayout`, now contains one `PortalIdentityHeader` for all authenticated dashboard routes. The header gets the portal label and icon from the canonical business mode context, localizes labels through the existing language context, and uses only the server-returned organization owner name. It uses truncation and responsive width constraints to avoid collisions and overflow.

## Responsive Evidence

The access-controlled `/sales` entry route rendered without runtime or layout errors at **375×812** (mobile), **768×1024** (tablet), and **1280×720** (desktop). The latest managed runtime logs contained development and dependency-age notices but no portal identity client exception, failed RPC, or layout error. No retained authenticated test account is available, so the authenticated header's dynamic data path is covered by the live rollback-only function validation and source contract suite.

## Automated and Build Evidence

The source suite completed with **39/39 tests passing**, including executable server-rendered identity checks for Restaurant, Pharmacy, and Retail in English, Persian, and Arabic. The rendered tenant-switch check confirms the new owner identity replaces, rather than retains, the prior organization’s owner.

A final rollback-only live validation exercised approved Owner, Manager, and Employee memberships with assigned branches. It verified the returned `viewer_branch_id` exactly matches the viewer’s canonical membership branch and rejected an out-of-scope organization request. The source production build completed successfully after all portal identity changes.

The mounted `TenantProvider` transition test simulates a full Owner A logout followed by Owner B login. It verifies that Owner A’s portal identity clears when the session ends and that only Owner B’s distinct organization identity renders after the new session settles. The source suite completed with **40/40 tests passing**, and the final production build completed successfully.

The tenant provider now resolves every approved owner membership, allowing a secure same-session active-organization switch. The mounted transition test selects a second restaurant for the same owner and confirms the portal and owner identity change without retaining the first organization. The source suite completed with **41/41 tests passing**, and the final production build completed successfully.
