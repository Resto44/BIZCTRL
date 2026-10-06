import { describe, expect, it } from 'vitest';
import { salesPaymentOptions, validPaymentCode } from '../src/lib/salesPaymentMethods';
import { paymentBuckets } from '../src/lib/closing/CashReconciliationLedger';

describe('sales source payment classification', () => {
  it('rejects underscore-only codes without silently transliterating Arabic', () => {
    for (const code of [undefined, null, '____', 'شبكة', '', 'a b']) expect(validPaymentCode(code)).toBe(false);
    for (const code of ['card', 'mada', 'bank_transfer', 'gateway_2']) expect(validPaymentCode(code)).toBe(true);
  });
  it('keeps network selectable when a tenant only has a malformed custom method', () => {
    const options = salesPaymentOptions([{ id: 'bad', code: '____', name_en: 'شبكة' }]);
    expect(options.some(method => method.code === 'card')).toBe(true);
    expect(options.some(method => method.code === '____')).toBe(false);
  });
  it('preserves customized labels and explicitly inactive methods without duplicates', () => {
    const options = salesPaymentOptions([{id:'1', code:'card', name_en:'Mada'}, {id:'2',code:'cash',is_active:false}]);
    expect(options.filter(method => method.code === 'card')).toHaveLength(1);
    expect(options.find(method => method.code === 'card').name_en).toBe('Mada');
    expect(options.some(method => method.code === 'cash')).toBe(false);
  });
  it('puts corrected sources in network once without counting historical balances', () => {
    const amounts = [25, 45, 85, 65];
    const buckets = paymentBuckets(amounts.map(value => ({default_payment_method:'card', today_amount:value, previous_amount:1000, total_amount:1000+value})));
    expect(buckets.card).toBe(220);
    expect(buckets.other).toBe(0);
    expect(Object.values(buckets).reduce((a,b)=>a+b,0)).toBe(220);
  });
});
