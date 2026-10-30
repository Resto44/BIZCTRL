import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import SimpleClosingCash from './SimpleClosingCash';
vi.mock('./ClosingNumericInput',()=>({default:({id,value,onChange,disabled})=><input id={id} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>}));
const props={inputId:'count',actualCashValue:'',onActualCashChange:vi.fn(),openingValue:'',onOpeningChange:vi.fn(),onSaveOpening:vi.fn(),cashNotes:'',onCashNotesChange:vi.fn(),difference:null};
const render=p=>{let view;act(()=>{view=TestRenderer.create(<SimpleClosingCash {...props} {...p}/>)});return view;};
describe('simple branch closing count',()=>{
 it('keeps counting available before an opening exists and accepts an explicit zero',()=>{
  const view=render({openingRequired:true,canSetOpening:true,openingValue:'0'});
  expect(view.root.findByProps({id:'count'}).props.disabled).toBeFalsy();
  const button=view.root.findAllByType('button')[0]; expect(button.props.disabled).toBeFalsy();
  act(()=>button.props.onClick());expect(props.onSaveOpening).toHaveBeenCalledOnce();
 });
 it('never treats an empty opening as zero or adds an approval button',()=>{
  const view=render({openingRequired:true,canSetOpening:true});
  expect(view.root.findAllByType('button')[0].props.disabled).toBe(true);
  expect(JSON.stringify(view.toJSON())).not.toMatch(/Approve Cash Count|Reason \/ counted by/);
 });
 it('has only one amount input after the initial count is recorded',()=>{
  const view=render({openingRequired:false,openingCash:150,expectedCash:250,difference:-10});
  expect(view.root.findAllByType('input')).toHaveLength(1);
  expect(JSON.stringify(view.toJSON())).toContain('This difference is saved separately');
 });
 it('prevents a second starting-cash entry when an earlier session has no verified ending count',()=>{
  const view=render({lang:'fa',openingRequired:true,openingBlockedByPrevious:true,canSetOpening:true,openingValue:'150'});
  expect(view.root.findAllByType('input')).toHaveLength(1);
  expect(view.root.findAllByType('button').filter(button=>button.props.children==='ثبت مبلغ شروع')).toHaveLength(0);
  expect(JSON.stringify(view.toJSON())).toContain('کلوزینگ قبلی');
 });
 it('shows a scoped recovery message instead of a manager opening override for history',()=>{
  const view=render({openingRequired:true,canSetOpening:false});
  expect(view.root.findAllByType('input')).toHaveLength(1);
  expect(JSON.stringify(view.toJSON())).toContain('Ask the owner');
 });
 it.each(['fa','ar'])('localizes the main workflow for %s',lang=>{
  const view=render({lang,openingRequired:true,canSetOpening:true});
  expect(JSON.stringify(view.toJSON())).not.toMatch(/Cash in the drawer|First closing|Save starting cash/);
 });
 it('keeps wallet actions visible for a ledger gap and hides a misleading variance',()=>{
  const view=render({ledgerOverdrawn:true,role:'owner',fundingContent:<div data-testid="wallet"/>});
  expect(view.root.findByProps({'data-testid':'wallet'})).toBeTruthy();
  expect(JSON.stringify(view.toJSON())).not.toContain('This difference is saved separately');
 });
 it('shows a retry on read failure without pretending cash is zero',()=>{
  const view=render({ledgerUnavailable:true,onRetryLedger:vi.fn()});
  expect(view.root.findByProps({role:'alert'})).toBeTruthy();
  expect(JSON.stringify(view.toJSON())).not.toContain('0 SAR');
 });
});
