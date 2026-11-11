import {describe,expect,it} from 'vitest';
import {supplierPortalAnalytics,supplierPeriodRange,riyadhDate,supplierPortalRecordDate} from '../src/lib/supplierPortalAnalytics';

const today='2026-11-12';
const orders=[
 {id:'one',status:'approved',created_date:'2026-11-10T05:00:00Z'},
 {id:'two',status:'shipped',created_date:'2026-11-11T18:00:00Z'},
 {id:'three',status:'received',created_date:'2026-10-02T09:00:00Z'},
 {id:'old',status:'cancelled',created_date:'2026-01-12T09:00:00Z'}
];
const deliveries=[{order_id:'three',confirmed_at:'2026-11-12T09:00:00Z'}];
const invoices=[
 {id:'usd',status:'approved',currency:'USD',date:'2026-11-10',total_amount:100,paid_amount:30,due_date:'2026-11-11'},
 {id:'sar',status:'approved',currency:'SAR',date:'2026-11-11',total_amount:40,paid_amount:10,due_date:'2026-11-30'},
 {id:'draft',status:'draft',currency:'USD',date:'2026-11-10',total_amount:1000,paid_amount:0}
];
const payments=[
 {id:'a',invoice_id:'usd',amount:30,date:'2026-11-11'},
 {id:'old',invoice_id:'sar',amount:10,date:'2026-10-28'},
 {id:'other',invoice_id:'other-supplier',amount:5000,date:'2026-11-11'}
];
describe('Supplier ERP date filters and currency-separated analytics',()=>{
 it('returns stable Saudi local calendar range for presets and timezone-aware activity',()=>{
  expect(supplierPeriodRange('today',today)).toEqual({from:today,to:today});
  expect(supplierPeriodRange('7d',today)).toEqual({from:'2026-11-06',to:today});
  expect(supplierPeriodRange('month',today)).toEqual({from:'2026-11-01',to:today});
  expect(supplierPeriodRange('3m',today)).toEqual({from:'2026-09-01',to:today});
  expect(supplierPeriodRange('6m',today)).toEqual({from:'2026-06-01',to:today});
  expect(supplierPeriodRange('12m',today)).toEqual({from:'2025-12-01',to:today});
  expect(supplierPeriodRange('custom',today,{from:'2026-05-01',to:'2026-08-30'})).toEqual({from:'2026-05-01',to:'2026-08-30'});
  expect(riyadhDate(new Date('2026-11-11T22:00:00Z'))).toBe('2026-11-12');
  expect(supplierPortalRecordDate('2026-11-11T22:00:00Z')).toBe('2026-11-12');
 });
 it('reports only requested activity, Owner-verified completion on confirmation date, not PO creation date',()=>{
  const a=supplierPortalAnalytics({orders,deliveries,invoices,payments,today,period:'7d'});
  expect(a.invalid).toBe(false);
  expect(a.orders).toBe(2);
  expect(a.awaitingShipment).toBe(1);
  expect(a.awaitingOwner).toBe(1);
  expect(a.received).toBe(1);
  expect(a.cancelled).toBe(0);
  expect(a.paymentRecords).toBe(1);
  expect(a.trend.some(x=>x.date==='2026-11-12'&&x.completed===1)).toBe(true);
 });
 it('never adds USD and SAR balances or unrelated third-party payments',()=>{
  const a=supplierPortalAnalytics({orders,deliveries,invoices,payments,today,period:'month'});
  expect(a.currencies).toHaveLength(2);
  const usd=a.currencies.find(x=>x.currency==='USD');
  const sar=a.currencies.find(x=>x.currency==='SAR');
  expect(usd).toMatchObject({invoiced:100,paid:30,outstanding:70,overdue:70});
  expect(sar).toMatchObject({invoiced:40,paid:0,outstanding:30,overdue:0});
  expect(a.currencies.every(x=>x.invoiced<1000)).toBe(true);
 });
 it('rejects inverted, too-large or missing custom dates rather than showing bogus trend values',()=>{
  expect(supplierPortalAnalytics({period:'custom',custom:{from:'2026-11-30',to:'2026-11-01'},today}).invalid).toBe(true);
  expect(supplierPortalAnalytics({period:'custom',custom:{from:'2022-01-01',to:today},today}).invalid).toBe(true);
 });
 it('empty datasets show empty actual activity, never demo counts',()=>{
  const a=supplierPortalAnalytics({today,period:'today'});
  expect(a.orders).toBe(0);
  expect(a.received).toBe(0);
  expect(a.currencies).toEqual([]);
  expect(a.trend).toEqual([]);
 });
});
