// Sales Source category codes are stable accounting metadata shared with the
// database CHECK constraint. Do not rename old values or double-count revenue.
export const SALES_SOURCE_CATEGORIES = Object.freeze([
  "delivery",
  "wholesale",
  "counter",
  "online",
  "corporate",
  "credit",
  "bank_transfer",
  "dine_in",
  "takeaway",
  "catering",
  "marketplace",
  "social_media",
  "field_sales",
  "subscriptions",
  "appointments",
  "reseller",
  "events",
  "other"
]);

export const ADDED_SALES_SOURCE_CATEGORIES = Object.freeze([
  "dine_in",
  "takeaway",
  "catering",
  "marketplace",
  "social_media",
  "field_sales",
  "subscriptions",
  "appointments",
  "reseller",
  "events"
]);
