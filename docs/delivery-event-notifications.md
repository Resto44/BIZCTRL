# Delivery accounting and event notifications

Delivery revenue comes from canonical `driver_sales_entries` joined to the same tenant/branch closing. Only finalized entries with finalized or locked closings count. Cash + network = delivery sales. This is a channel breakdown already included in total sales, not additional revenue. Cash reconciliation includes only the cash side. Drafts and cancelled records must not re-enter analytics through a retained finalized timestamp.

The push event headline always identifies the actual table and operation, translated into the receiving device's app language. Financial-only legacy templates cannot suppress the headline. Each event retains a small presentation snapshot (amount, cash/network, status, business date, currency and branch name); DELETE snapshots use OLD. No complete row, customer address or phone is copied. Existing owner-only RLS and device ownership checks apply. Reference visibility and user-selected operation/module/branch filters remain enforced.

The financial layout adds delivery sales; custom templates also support `{delivery_cash}` and `{delivery_network}`. Financial totals use the event business date where present. Non-financial record events do not carry an unrelated sales summary. Summary failures do not prevent the record event from being sent. Preview can select record type and operation; the saved-settings test sends the selected sample, clearly marked TEST-001.

Validation: targeted unit tests cover all three languages, expense deletion, purchase/sales/product/category actions, reference privacy, missing vs zero totals, split collections, cancellation exclusions and locked closing inclusion. Transactional database test as the branch manager inserted, updated and deleted a temporary expense: three corresponding events and two eligible device queue entries for each were verified, then everything rolled back. Live read-only reconciliation on 2026-10-07 returned delivery cash 365, network 245, total 610, without adding 610 again to total sales.

Physical iPhone push display is not part of the automated verification.
