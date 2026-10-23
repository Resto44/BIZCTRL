import { describe, it, expect, vi } from 'vitest';
import { loadClosingCashContext } from '../src/lib/closing/ClosingCashContext';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger';

const scope = { p_restaurant_id:'restaurant', p_branch_id:'branch', p_branch:'main', p_date:'2026-10-23', p_shift:'Morning', p_cashier_id:'cashier', p_closing_id:null };
function clientFor(data = [], error = null) {
  const query = { select:vi.fn().mockReturnThis(), eq:vi.fn().mockReturnThis(), then(resolve) { return Promise.resolve({data,error}).then(resolve); } };
  return { from:vi.fn(() => query), query, rpc:vi.fn(async (_, args) => ({data:{ opening_cash:65, movements: args.p_closing_id ? [] : [{amount:250,direction:'in'}] },error:null})) };
}
describe('closing cash context session identity', () => {
  it('excludes the prior sale when a new form targets an existing normalized session', async () => {
    const client = clientFor([{id:'existing',shift:' morning '},{id:'evening',shift:'Evening'}]);
    const result = await loadClosingCashContext(client, scope);
    expect(result.resolved_closing_id).toBe('existing');
    expect(client.rpc).toHaveBeenCalledWith('erp_sales_closing_cash_context', {...scope,p_closing_id:'existing'});
    for (const [key,value] of [['restaurant_id','restaurant'],['branch_id','branch'],['date','2026-10-23'],['cashier_id','cashier']]) expect(client.query.eq).toHaveBeenCalledWith(key,value);
  });
  it('does not borrow a different shift closing', async () => {
    const client = clientFor([{id:'evening',shift:'Evening'}]);
    expect((await loadClosingCashContext(client,scope)).resolved_closing_id).toBeNull();
  });
  it('honors explicit edit identity without a session lookup', async () => {
    const client = clientFor();
    expect((await loadClosingCashContext(client,{...scope,p_closing_id:'edit'})).resolved_closing_id).toBe('edit');
    expect(client.from).not.toHaveBeenCalled();
  });
  it('fails closed on a failed lookup', async () => {
    const client=clientFor(null,new Error('denied'));
    await expect(loadClosingCashContext(client,scope)).rejects.toThrow('denied');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on ambiguous existing sessions', async () => {
    const client=clientFor([{id:'a',shift:'Morning'},{id:'b',shift:'morning'}]);
    await expect(loadClosingCashContext(client,scope)).rejects.toThrow('Multiple closings');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('propagates canonical context errors', async () => {
    const client=clientFor(); client.rpc.mockResolvedValue({error:new Error('offline')});
    await expect(loadClosingCashContext(client,scope)).rejects.toThrow('offline');
  });
  it('shows genuine missing funding instead of offsetting it with old cash sales', () => {
    const snapshot=cashReconciliationSnapshot({openingCash:65,currentCashSales:81,ledgerMovements:[{amount:289,direction:'out'}],actualCash:0});
    expect(snapshot.expectedCash).toBe(-143);
    expect(snapshot.ledgerOverdrawn).toBe(true);
  });
});
