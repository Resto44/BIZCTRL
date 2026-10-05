import {describe,it,expect,vi} from 'vitest';
import {deleteExpenseRecord} from '../src/lib/expenseDeletion';
const client = result => ({from:vi.fn(()=>({delete:()=>({eq:()=>({select:async()=>result})})}))});
describe('expense deletion',()=>{
 it('rejects zero affected rows',async()=>{
  await expect(deleteExpenseRecord(client({data:[],error:null}),'e1')).rejects.toThrow('not deleted');
 });
 it('confirms the requested expense was deleted',async()=>{
  await expect(deleteExpenseRecord(client({data:[{id:'e1'}],error:null}),'e1')).resolves.toEqual({success:true});
 });
 it('propagates database errors',async()=>{
  await expect(deleteExpenseRecord(client({error:new Error('Denied')}),'e1')).rejects.toThrow('Denied');
 });
});
