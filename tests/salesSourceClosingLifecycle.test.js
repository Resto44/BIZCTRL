import { describe, expect, it } from 'vitest';
import { buildSalesSourceClosingSnapshots, salesSourceTodayTotal } from '../src/lib/salesSourceClosingLifecycle';

const hungerStation = {
  id: '11111111-1111-4111-8111-111111111111',
  name_en: 'HungerStation',
  name_ar: 'هنقرستيشن',
  default_payment_method: 'network',
  included_in_revenue: true,
};
const wholesale = {
  id: '22222222-2222-4222-8222-222222222222',
  name_en: 'Wholesale',
  default_payment_method: 'cash',
  included_in_revenue: true,
};

const summaries = (source, previous = 0, today = 0) => [{
  source,
  today,
  previous,
  total: previous + today,
}];

describe('Sales Source Closing lifecycle', () => {
  it('starts a new source and a New Closing with clean Today values while Previous remains historical', () => {
    expect(summaries(hungerStation)[0]).toMatchObject({ today: 0, previous: 0, total: 0 });
    expect(summaries(hungerStation, 400)[0]).toMatchObject({ today: 0, previous: 400, total: 400 });
  });

  it('keeps Today editable without accumulating transient typing values', () => {
    const previous = 400;
    const valuesTypedInSequence = [100, 200, 300];
    const finalSummary = summaries(hungerStation, previous, valuesTypedInSequence.at(-1))[0];
    expect(finalSummary).toMatchObject({ today: 300, previous: 400, total: 700 });
    expect(salesSourceTodayTotal([finalSummary])).toBe(300);
  });

  it('accumulates each finalized closing into the next New Closing without recognizing Previous as revenue', () => {
    const first = buildSalesSourceClosingSnapshots(summaries(hungerStation, 0, 400), { date: '2026-08-20', branch: 'A', shift: 'Morning', cashierId: 'cashier-a' });
    expect(first[0]).toMatchObject({ amount: 400, today_amount: 400, previous_amount: 0, total_amount: 400 });

    const second = buildSalesSourceClosingSnapshots(summaries(hungerStation, first[0].total_amount, 200), { date: '2026-08-21', branch: 'A', shift: 'Morning', cashierId: 'cashier-a' });
    expect(second[0]).toMatchObject({ amount: 200, today_amount: 200, previous_amount: 400, total_amount: 600 });
    expect(salesSourceTodayTotal([{ source: hungerStation, today: second[0].today_amount, previous: second[0].previous_amount }])).toBe(200);

    const thirdNewClosing = summaries(hungerStation, second[0].total_amount)[0];
    expect(thirdNewClosing).toMatchObject({ today: 0, previous: 600, total: 600 });
  });

  it('keeps multiple Sales Sources independent and totals only their current Today values', () => {
    const activeSources = [
      { source: hungerStation, previous: 600, today: 150, total: 750 },
      { source: wholesale, previous: 0, today: 200, total: 200 },
    ];
    const snapshots = buildSalesSourceClosingSnapshots(activeSources, { branch: 'A', date: '2026-08-22', shift: 'Evening', cashierName: 'Cashier A' });

    expect(salesSourceTodayTotal(activeSources)).toBe(350);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ source_id: hungerStation.id, amount: 150, previous_amount: 600, total_amount: 750 });
    expect(snapshots[1]).toMatchObject({ source_id: wholesale.id, amount: 200, previous_amount: 0, total_amount: 200 });
  });

  it('stores a self-contained finalized snapshot that remains unchanged after later summaries are edited', () => {
    const snapshot = buildSalesSourceClosingSnapshots(summaries(hungerStation, 600, 150), { branch: 'A', date: '2026-08-22', shift: 'Evening', cashierId: 'cashier-a', cashierName: 'Cashier A' })[0];
    const editedCurrentForm = summaries(hungerStation, 600, 999)[0];

    expect(snapshot).toMatchObject({ amount: 150, today_amount: 150, previous_amount: 600, total_amount: 750, branch: 'A', date: '2026-08-22', shift: 'Evening', cashier_id: 'cashier-a', cashier_name: 'Cashier A' });
    expect(editedCurrentForm.today).toBe(999);
    expect(snapshot.amount).toBe(150);
  });
});


describe('ordinary Sales Source save payload compatibility', () => {
  it('does not attach an empty driver_entries array to a standard source snapshot', () => {
    const snapshot = buildSalesSourceClosingSnapshots([
      { source: hungerStation, previous: 100, today: 25, total: 125 },
    ], { branch: 'A', date: '2026-08-27', shift: 'Morning', cashierId: 'cashier-a' })[0];

    expect(snapshot).toMatchObject({ source_id: hungerStation.id, amount: 25, previous_amount: 100, total_amount: 125 });
    expect(snapshot).not.toHaveProperty('driver_entries');
  });
});
