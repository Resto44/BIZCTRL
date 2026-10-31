# Closing History analytics: session-aware 7-point trends and compact cost notes

**Observed bug**: finalized Morning shifts for the same restaurant, branch and cashier had
four sessions on Oct 31 and three on Oct 27. The old trend grouped by date and
discarded every date containing multiple closings, producing a false 0/7 history.

**Fix**: use a seven-session chronological rolling window with tenant, canonical branch,
shift and cashier isolation. Distinct session numbers order same-day closings. Reliable
distinct finalization timestamps are the fallback for older sessions. Legacy duplicate
same-day rows without either ordering source remain excluded; do not invent ordering.
Keep all dates in the trend and label comparisons by session number. No revenue data
changes, no date normalization, no percent if the prior value is zero.

**UI**: keep the accounting warning, but show only a short line in a collapsed <details>.
Long fixed allocation and frozen historical snapshot explanations remain available
on expansion, reducing card height on iPhone. Financial safety signals remain intact.

**Validation**: pure source-function test for 7 real-pattern sessions and ambiguous legacy
rows passed; Vitest regressions for session order and compact disclosures added.
Run targeted tests and signed-in iPhone history smoke check before closing follow-up.

**Caveat**: successive Closing *session* totals are not equal-duration sales rates.
Do not describe session-over-session percentage as daily growth.
