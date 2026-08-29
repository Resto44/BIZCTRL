import { describe, expect, it } from 'vitest';
import { dailySalesNetworkBreakdown } from '../src/lib/dailySalesPresentation.js';

describe('Closing History network breakdown', () => {
  it('keeps Counter, Driver and Other details equal to the canonical Network Total', () => {
    const breakdown = dailySalesNetworkBreakdown({
      restaurant_network: 150,
      sales_sources_json: [
        {
          source_id: 'drivers',
          payment_bucket: 'other',
          driver_entries: [
            { cash_amount: 10, network_amount: 20 },
            { cash_amount: 0, network_amount: 10 },
          ],
        },
        { source_id: 'delivery-app', name_en: 'Delivery App', payment_bucket: 'card', today_amount: 20 },
      ],
    });

    expect(breakdown).toMatchObject({ counter: 100, driver: 30, other: 20, total: 150 });
    expect(breakdown.counter + breakdown.driver + breakdown.other).toBe(breakdown.total);
  });

  it('caps inconsistent legacy detail at the saved Network Total', () => {
    const breakdown = dailySalesNetworkBreakdown({
      restaurant_network: 40,
      sales_sources_json: [{ payment_bucket: 'card', today_amount: 70 }],
    });

    expect(breakdown).toMatchObject({ counter: 0, driver: 0, other: 40, total: 40 });
  });
});
