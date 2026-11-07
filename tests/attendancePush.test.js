import {it,expect} from 'vitest';
import {renderNotification,DEFAULT_PREFERENCES,shouldDeliver} from '../supabase/functions/owner-push/preferences.ts';
import {notificationTarget} from '../supabase/functions/owner-push/navigation.ts';
const event={id:'11111111-1111-4111-8111-111111111111',entity:'attendance_alert',action:'insert',context:{attendance_kind:'check_in',employee_name:'Test employee',occurred_at:'2026-11-07T12:00:00Z',code:'SECRET',latitude:1},reference:'employee',branch:'b'};
it.each([['en','Employee checked in'],['ar','تم تسجيل دخول الموظف'],['fa','ورود کارمند ثبت شد']])('renders a specific attendance alert in %s without code or coordinates',(language,label)=>{
 const result=renderNotification({...DEFAULT_PREFERENCES,language},event,{name:'BizCTRL'}, {name:'Branch',id:'b'});
 expect(result.title).toContain(label);expect(result.body).toContain('Test employee');expect(result.body).toContain('Branch');
 expect(result.body).not.toContain('SECRET');expect(result.body).not.toContain('Sales:');expect(result.body).not.toContain('latitude');
});
it('keeps missing-entry review distinct from a recorded absence',()=>{
 const render=kind=>renderNotification(DEFAULT_PREFERENCES,{...event,context:{...event.context,attendance_kind:kind}},{name:'BizCTRL'},null).title;
 expect(render('missing_check_in')).toContain('review needed');expect(render('absent')).toContain('marked absent');expect(render('check_out')).toContain('checked out');
});
it('honors People module and device-business branch filters and opens Employee Management',()=>{
 expect(shouldDeliver(DEFAULT_PREFERENCES,event,{id:'b'})).toBe(true);
 expect(shouldDeliver({...DEFAULT_PREFERENCES,modules:['sales']},event,{id:'b'})).toBe(false);
 expect(shouldDeliver({...DEFAULT_PREFERENCES,branch_ids:['other']},event,{id:'b'})).toBe(false);
 expect(notificationTarget(event)).toBe('/employees?notification='+event.id);
});
