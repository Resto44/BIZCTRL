import { describe, it, expect, vi } from 'vitest';
import { readDebtHistory, collectionActionPayload } from '../src/lib/debtCollection';
const debt = { id: 'debt-a', restaurant_id: 'store-a', branch_id: 'branch-a', branch: 'main-a', party_name: 'Customer' };
function clientFor(errorTable) {
  const calls = [];
  const client = { from: table => {
    const chain = { select: () => chain, eq: (key, value) => { calls.push([table, key, value]); return chain; },
      order: (column, options) => { calls.push([table, 'order', column, options]); return chain; },
      limit: async () => ({ data: [{ id: table }], error: table === errorTable ? new Error('offline') : null }) };
    return chain;
  } };
  return { client, calls };
}
describe('debt collection deployed contract', () => {
  it('loads both histories in the same business and sorts actions by the real timestamp', async () => {
    const { client, calls } = clientFor();
    expect(await readDebtHistory(client, debt)).toEqual([[{id:'debt_payments'}], [{id:'collection_actions'}]]);
    for (const table of ['debt_payments', 'collection_actions']) {
      expect(calls).toContainEqual([table, 'restaurant_id', 'store-a']);
      expect(calls).toContainEqual([table, 'debt_id', 'debt-a']);
    }
    expect(calls).toContainEqual(['collection_actions', 'order', 'created_date', {ascending:false}]);
  });
  it.each(['collection_actions','debt_payments'])('rejects a failed %s read instead of returning empty history', async table => {
    await expect(readDebtHistory(clientFor(table).client, debt)).rejects.toThrow('offline');
  });
  it('never reads or writes an unscoped debt', async () => {
    const client = { from: vi.fn() };
    await expect(readDebtHistory(client, {id:'a'})).rejects.toThrow('DEBT_SCOPE_REQUIRED');
    expect(client.from).not.toHaveBeenCalled();
    expect(() => collectionActionPayload({id:'a'}, {}, '')).toThrow('DEBT_SCOPE_REQUIRED');
  });
  it('preserves notes, promise details and follow-up using supported columns only', () => {
    const payload = collectionActionPayload(debt, { action_type:'promise', outcome:'Called', next_follow_up:'2026-11-20', promise_amount:'42', promise_date:'2026-11-19' }, 'staff@example.test', 'Promise: 42 on 2026-11-19');
    expect(payload).toEqual({restaurant_id:'store-a',branch_id:'branch-a',branch:'main-a',debt_id:'debt-a',customer_name:'Customer',action_type:'promise',notes:'Called\nPromise: 42 on 2026-11-19',next_action_date:'2026-11-20',created_by:'staff@example.test'});
  });
});
