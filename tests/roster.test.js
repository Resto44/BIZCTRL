import { describe, it, expect } from 'vitest';
import { getWeekDates, calcTotal, rosterPayload } from '../src/lib/roster';
describe('roster save contract', () => {
  const data = { branch: 'rayan', week_start: '2026-11-14', staff_name: ' Test ', staff_email: '', staff_phone: '', shifts: [{day:'saturday',start:'15:53',end:'02:25'}], notes:'' };
  it('includes canonical tenant and branch identity and JSON array', () => {
    const payload = rosterPayload(data, 'tenant', [{key:'rayan',id:'branch',restaurant_id:'tenant'}]);
    expect(payload).toMatchObject({restaurant_id:'tenant',branch_id:'branch',week_starting:'2026-11-14',staff_name:'Test',shifts:data.shifts});
    expect(payload).not.toHaveProperty('total_hours');
  });
  it('rejects unloaded, missing and foreign branch scopes', () => {
    expect(()=>rosterPayload(data,null,[])).toThrow();
    expect(()=>rosterPayload(data,'tenant',[{key:'rayan'}])).toThrow();
    expect(()=>rosterPayload(data,'tenant',[{key:'rayan',id:'branch',restaurant_id:'foreign'}])).toThrow();
  });
  it('uses real weekdays for a Saturday week start', () => {
    expect(getWeekDates('2026-11-14')[0]).toEqual({day:'saturday',date:'Nov 14'});
    expect(getWeekDates('2026-11-14')[2]).toEqual({day:'monday',date:'Nov 16'});
    expect(getWeekDates('')).toEqual([]);
  });
  it('counts overnight hours and legacy JSON strings', () => {
    expect(calcTotal(data.shifts)).toBeCloseTo(10+32/60);
    expect(calcTotal(JSON.stringify(data.shifts))).toBeCloseTo(10+32/60);
    expect(calcTotal('broken')).toBe(0);
  });
});
