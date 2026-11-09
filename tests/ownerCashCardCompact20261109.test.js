import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/dashboard/ExecutiveSnapshotV2.jsx',import.meta.url),'utf8');
const card=source.slice(source.indexOf('data-testid="snapshot-drawer-cash"'),source.indexOf('<div className="min-w-0 rounded-2xl border border-border/80 p-3.5">'));
describe('Owner cash card compact layout and audit safety',()=>{
 it('shows a compact horizontal cash title and amount without a fixed height',()=>{
  expect(card).toContain('flex flex-wrap items-center justify-between gap-x-3 gap-y-1');
  expect(card).toContain('self-start');
  expect(card).toContain('data-testid="snapshot-drawer-cash-value"');
  expect(card).toContain('text-[clamp(1.35rem,5vw,1.7rem)]');
  expect(card).not.toContain('mt-2 text-[clamp(1.45rem,4vw,2rem)]');
 });
 it('hides bulky per-branch history by default and bounds expanded mobile height',()=>{
  expect(card).toContain('<details data-testid="snapshot-drawer-branch-breakdown"');
  expect(card).not.toContain('<details data-testid="snapshot-drawer-branch-breakdown" open');
  expect(card).toContain('max-h-44');
  expect(card).toContain('overflow-y-auto');
  expect(card).toContain('group-open:rotate-180');
  expect(card).toContain('drawerCash.details.map');
 });
 it('keeps multi-cashier warning visible even while detailed history is collapsed',()=>{
  const summary=card.slice(0,card.indexOf('<details data-testid="snapshot-drawer-branch-breakdown"'));
  expect(summary).toContain('snapshot-drawer-needs-review');
  expect(summary).toContain('Reported count only · NOT verified cash or an all-branch total.');
  expect(summary).toContain('drawerCash.latestPhysicalDetail.branchName');
  expect(summary).toContain('drawerCash.latestPhysicalDetail.date');
 });
 it('never treats a nonverified count as a verified all-branch total or zero cash',()=>{
  expect(card).toContain('drawerCash?.complete ? formatMoney(drawerCash.amount)');
  expect(card).toContain("drawerCash.latestPhysicalDetail.status==='verified'");
  expect(card).toContain('drawerCash.latestPhysicalDetail.reportedCash');
  expect(card).toContain("item.status==='verified' && item.cash!=null");
  expect(card).toContain("item.status==='ambiguous_drawer' && item.reportedCash!=null");
  expect(card).toContain("'—'");
  expect(card).toContain('Never sum multiple cashier counts');
 });
 it('retains Arabic, Persian and English labels with light/dark contrast',()=>{
  expect(card).toContain("lang==='fa'");
  expect(card).toContain("lang==='ar'");
  expect(card).toContain('dark:text-amber-200');
  expect(card).toContain('dark:bg-emerald-950/30');
 });
});
