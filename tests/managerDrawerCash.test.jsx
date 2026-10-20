import {describe,it,expect,vi} from 'vitest';
import {readManagerDrawer} from '../src/components/dashboard/ManagerDrawerCashCard';
const row={id:'closing',branch_id:'branch',date:'2026-10-20',closing_state:'finalized',actual_cash:16,restaurant_cash:35,closing_cash:116,owner_cash_injection:100};
function client(data,error=null){const q={};for(const name of ['select','eq','lte','order'])q[name]=vi.fn(()=>q);q.limit=vi.fn(async()=>({data,error}));return {from:vi.fn(()=>q),q};}
describe('Manager physical cash balance',()=>{
 it('shows recorded 16, never cash sales 35 or owner injection 100',async()=>{
  const c=client([row]);expect((await readManagerDrawer(c,'branch','2026-10-20')).amount).toBe(16);
  expect(c.q.eq).toHaveBeenCalledWith('branch_id','branch');expect(c.q.eq).toHaveBeenCalledWith('closing_state','finalized');expect(c.q.limit).toHaveBeenCalledWith(1);
  expect(c.q.lte).toHaveBeenCalledWith('date','2026-10-20');
 });
 it('preserves prior closing date and real zero',async()=>{expect(await readManagerDrawer(client([{...row,date:'2026-10-19',actual_cash:0}]),'branch','2026-10-20')).toMatchObject({date:'2026-10-19',amount:0});});
 it('does not invent zero for missing cash',async()=>{expect(await readManagerDrawer(client([]),'branch','2026-10-20')).toBeNull();expect((await readManagerDrawer(client([{...row,actual_cash:null}]),'branch','2026-10-20')).amount).toBeNull();});
 it('surfaces read errors',async()=>{await expect(readManagerDrawer(client([],Error('denied')),'branch','2026-10-20')).rejects.toThrow('denied');});
 it.each([{...row,branch_id:'other'},{...row,closing_state:'draft'},{...row,date:'2026-10-21'}])('rejects unrelated or nonfinal rows',async r=>{await expect(readManagerDrawer(client([r]),'branch','2026-10-20')).rejects.toThrow('Invalid drawer scope');});
});
