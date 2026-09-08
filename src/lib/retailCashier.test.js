// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
import { money, paymentBreakdown, receiptHtml, isDefiniteRejection } from './retailCashier';
import { subscribeCashierBroadcast } from './cashierBroadcast';

describe('cashier payment and receipt boundaries', () => {
  it('uses integer cents for split tender and cash change', () => {
    expect(paymentBreakdown(34.5, 'mixed', 20, 20)).toEqual({ valid: true, change: 5.5, payments: [{ payment_method: 'cash', amount: 20 }, { payment_method: 'mada', amount: 20 }] });
    expect(paymentBreakdown(0.3, 'mixed', 0.1, 0.2).change).toBe(0);
    expect(paymentBreakdown(34.5, 'mada', 0, 0).payments).toEqual([{ payment_method: 'mada', amount: 34.5 }]);
  });
  it.each([['mixed', 20, 40], ['cash', -1, 0], ['cash', 1, 0], ['mixed', NaN, 1], ['mixed', 2, Infinity]])('rejects impossible tender %s %s %s', (mode, cash, card) => {
    expect(paymentBreakdown(34.5, mode, cash, card).valid).toBe(false);
  });
  it('escapes merchant and product values and preserves Arabic receipts', () => {
    const html = receiptHtml({ receipt_number: 'POS-1', business: { name: '<script>alert(1)</script>', currency: 'SAR' }, occurred_at: '2026-09-08T10:00:00Z', lines: [{ name: 'Milk', name_ar: 'حليب <img onerror=x>', quantity: 1, unit_price: 11.5, line_total: 11.5 }], net_total: 11.5 }, 'ar');
    expect(html).toContain('dir="rtl"'); expect(html).toContain('حليب &lt;img onerror=x&gt;');
    expect(html).not.toContain('<script>'); expect(html).toContain('size:80mm auto');
    expect(html).toContain('Print / Save PDF'); expect(html).not.toContain('ZATCA');
    expect(money(11.5)).toBe('SAR 11.50');
  });
  it('keeps ambiguous network failures pending, but clears definite DB rejections', () => {
    expect(isDefiniteRejection({ message: 'Failed to fetch' })).toBe(false);
    expect(isDefiniteRejection({ code: '40001' })).toBe(true);
    expect(isDefiniteRejection({ code: '42501' })).toBe(true);
  });
});
describe('fixed-topic realtime lifecycle', () => {
  it('shares subscribers and never adds callbacks after subscribe on StrictMode remount', async () => {
    vi.useFakeTimers();
    let subscribed = false; let event;
    const channel = { on: vi.fn((_, __, cb) => { if (subscribed) throw new Error('on after subscribe'); event = cb; return channel; }), subscribe: vi.fn(() => { subscribed = true; return channel; }) };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => { subscribed = false; }) };
    const a = vi.fn(); const b = vi.fn();
    const stop1 = subscribeCashierBroadcast(client, 'cashier:1', a); stop1();
    const stop2 = subscribeCashierBroadcast(client, 'cashier:1', a);
    const stop3 = subscribeCashierBroadcast(client, 'cashier:1', b);
    event({ payload: { net_total: 1 } });
    expect(a).toHaveBeenCalledWith('changed'); expect(b).toHaveBeenCalledWith('changed');
    expect(channel.on).toHaveBeenCalledTimes(1); expect(channel.subscribe).toHaveBeenCalledTimes(1);
    stop2(); await vi.advanceTimersByTimeAsync(150); expect(client.removeChannel).not.toHaveBeenCalled();
    stop3(); await vi.advanceTimersByTimeAsync(150); expect(client.removeChannel).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('waits for async channel removal before remount binding', async () => {
    vi.useFakeTimers();
    let finish; const channels = [];
    const client = { channel: vi.fn(() => { const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) }; channels.push(ch); return ch; }), removeChannel: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
    const stop = subscribeCashierBroadcast(client, 'customer-display:1', vi.fn()); stop(); await vi.advanceTimersByTimeAsync(110);
    const stop2 = subscribeCashierBroadcast(client, 'customer-display:1', vi.fn()); expect(client.channel).toHaveBeenCalledTimes(1);
    finish(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(client.channel).toHaveBeenCalledTimes(2); expect(channels[1].on).toHaveBeenCalledTimes(1);
    stop2(); vi.useRealTimers();
  });
});
