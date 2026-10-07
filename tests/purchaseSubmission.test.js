import { expect, it, vi } from 'vitest';
import { resumePurchaseSubmission } from '../src/lib/purchaseSubmission';

it('retries the failed payment without duplicating the invoice or confirmed payments', async () => {
  const state={invoice:null,completedPayments:new Set()};
  const saveInvoice=vi.fn().mockResolvedValue({id:'invoice',status:'approved'});
  const savePayment=vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('RLS')).mockResolvedValueOnce({});
  const options={state,saveInvoice,savePayment,payments:[{_id:'cash'},{_id:'bank'}]};
  await expect(resumePurchaseSubmission(options)).rejects.toThrow('RLS');
  await expect(resumePurchaseSubmission(options)).resolves.toMatchObject({id:'invoice'});
  expect(saveInvoice).toHaveBeenCalledTimes(1);
  expect(savePayment.mock.calls.map(call=>call[1]._id)).toEqual(['cash','bank','bank']);
});

it('does not start payments if invoice persistence fails', async()=>{
  const savePayment=vi.fn();
  await expect(resumePurchaseSubmission({state:{invoice:null,completedPayments:new Set()},saveInvoice:vi.fn().mockRejectedValue(new Error('invoice failed')),savePayment,payments:[{_id:'cash'}]})).rejects.toThrow('invoice failed');
  expect(savePayment).not.toHaveBeenCalled();
});
