# Platform Owner MFA Recovery — Authoritative Design Notes

## Supabase Auth facts used by this implementation

Supabase Auth’s TOTP enrollment flow is server-backed: `mfa.enroll()` returns a server-generated QR representation, secret, and `otpauth` URI for the authenticated user. The user scans the QR code or uses the manual key, then the application creates a challenge and verifies the six-digit code. A successfully verified factor is promoted to active status and the session is upgraded to AAL2. The TOTP flow uses Google Authenticator-compatible QR/URI conventions. [1] [2]

> A verified TOTP factor is an account factor stored by Supabase Auth; the metadata model contains no application-domain field. It cannot be cryptographically attributed to a former Vercel hostname. The factor active in production was created before the custom-domain launch and has a generic old-environment label, so the recovery design treats it as a stale candidate but never removes it until a newly enrolled factor has been verified.

Supabase JWT `amr` entries can distinguish an email password-recovery session (`recovery`) from ordinary password authentication, while `aal` distinguishes conventional AAL1 from MFA-proven AAL2. [3]

The recovery ceremony therefore requires the active Platform Owner account to prove control of its confirmed email through Supabase password recovery, then enroll and verify a new TOTP factor. Only when the resulting recovery session holds both `recovery` and `totp` authentication methods does the privileged server-side finalizer retire the old factor. The normal Platform Owner database assertion continues to require AAL2 and no tenant role is used for authorization.

Supabase’s administrative MFA factor deletion logs out active sessions for a deleted verified factor. The finalizer therefore returns a reauthentication requirement and never claims the old session continues. [4]

## Sources

[1]: https://supabase.com/docs/guides/auth/auth-mfa/totp "Supabase TOTP MFA guide"
[2]: https://supabase.com/blog/mfa-auth-via-rls "Supabase MFA and RLS"
[3]: https://supabase.com/docs/guides/auth/jwt-fields "Supabase JWT claims reference"
[4]: https://supabase.com/docs/reference/javascript/auth-admin-deletefactor "Supabase admin MFA factor deletion"
