# Network sales reporting

Network sales are a payment-channel subtotal, not additional revenue. Sales Sources and POS are separate overlapping breakdowns. Do not add these figures together.

The October 2026 repair addressed payment codes silently converted from Arabic into underscores. The closing ledger correctly treated these unknown codes as `other`, leaving network totals zero. Four reviewed network sources now use `card`. Six existing closings received reporting-only reclassifications; their original rows and total revenue/profit were unchanged.

`daily_sales_network_report` is a security-invoker view over the existing RLS-protected sales table. It adds `reported_network_sales`, including reviewed adjustments from `network_sales_reclassifications`. Both Network Management and the owner push summary read this figure. Adjustments have no browser write grants and are visible only when the corresponding sale is readable. They apply only while the original source snapshot, network amount and other-sales amount still match. This prevents a later corrected record from being counted twice. Future correctly classified sales need no adjustment.

The UI rejects invalid codes without destructive transliteration and exposes standard accounting methods even when the tenant only configured custom methods. Display names can remain Arabic or Farsi. Custom payment codes still follow the existing `other` accounting bucket; the editor now explains this explicitly.

Validation: 30 payment/push regression tests; production build; manager can read own-branch corrected totals, another tenant cannot; browser cannot write adjustments. For the reported branch on 2026-10-06 the network subtotal changed from 0 to 485 while sales remained 485, purchases 145 and net profit 340. Original closing row hashes were checked unchanged in the repair transaction. No live sale was created or deleted for testing. Physical iPhone receipt of push was not tested in this session.
