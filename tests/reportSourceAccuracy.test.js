import {describe,it,expect} from 'vitest';
import {allocateReportExpenses} from '../src/lib/reportExpenseAllocation';
import {buildOperationsPdfReport} from '../src/lib/operationsPdfReport';
import {fetchReportStockConsumption} from '../src/lib/reportStockConsumption';
const from='2026-10-01',to='2026-10-15';
const fixed={id:'rent',branch_id:'a',name:'Rent',is_fixed:false,expense_type:'fixed',monthly_amount:3000,allocation_days:30};
describe('Verified ERP report sources',()=>{
 it('allocates branch configuration without a monthly row; does not add the row twice',()=>{
   const empty=allocateReportExpenses([], [fixed],from,to);
   const recorded=allocateReportExpenses([{category_id:'rent',branch_id:'a',amount:3000,date:from}],[fixed],from,to);
   expect(empty.fixed).toBe(1500);
   expect(recorded.fixed).toBe(1500);
   expect(empty.hasExpenseSource).toBe(true);
 });
 it('uses latest eligible monthly source, excludes future and cancelled entries',()=>{
   const rows=[
    {id:'1',category_id:'rent',amount:300,date:from},
    {id:'2',category_id:'rent',amount:600,date:'2026-10-02'},
    {id:'3',category_id:'rent',amount:9000,date:'2026-10-30'},
    {id:'4',category_id:'rent',amount:9000,date:'2026-10-03',status:'cancelled'},
   ];
   const result=allocateReportExpenses(rows,[{...fixed,monthly_amount:0}],from,to);
   expect(result.fixed).toBe(290);
   expect(result.variable).toBe(0);
   expect(allocateReportExpenses(rows.slice(2,3),[{...fixed,monthly_amount:0}],from,to).hasExpenseSource).toBe(false);
 });
 it('does not allocate another branch configuration to each branch',()=>{
   const report=buildOperationsPdfReport({branches:[{id:'a'},{id:'b'}],expenseCategories:[fixed],range:{from,to}});
   expect(report.branches.find(b=>b.id==='a').expenses).toBe(1500);
   expect(report.branches.find(b=>b.id==='b').expenses).toBe(0);
   expect(report.branchProfitUnallocated).toBe(0);
 });
 it('counts stock-out, separates sold from used, subtracts returns, never mixes units or transfers',()=>{
   const movements=[
    {transaction_type:'stock_out',quantity:3,unit:'carton'},
    {transaction_type:'recipe_consumption',quantity:20,unit:'kg'},
    {transaction_type:'sale',quantity:5,unit:'carton'},
    {transaction_type:'consumption_return',quantity:-2,unit:'carton'},
    {transaction_type:'transfer_out',quantity:100,unit:'carton'},
    {transaction_type:'stock_in',quantity:500,unit:'carton'},
   ].map((r,i)=>({...r,id:String(i),product_id:'chicken',product_name:'Chicken',created_date:from}));
   const r=buildOperationsPdfReport({inventoryTransactions:movements,range:{from,to}});
   expect(r.consumption).toHaveLength(2);
   expect(r.consumption.find(x=>x.unit==='carton')).toMatchObject({quantity:6,usedQuantity:3,soldQuantity:3,costAvailable:false});
   expect(r.consumption.find(x=>x.unit==='kg').quantity).toBe(20);
 });
 it('passes exact tenant/branch/dates to server and blocks errors and malformed results',async()=>{
   const calls=[];
   const args={restaurantId:'tenant',branchId:'branch',range:{from,to}};
   const db={async rpc(name,params){calls.push({name,params});return {data:[]};}};
   expect(await fetchReportStockConsumption({...args,db})).toEqual([]);
   expect(calls[0]).toEqual({name:'erp_report_stock_consumption',params:{p_restaurant_id:'tenant',p_branch_id:'branch',p_from:from,p_to:to}});
   await expect(fetchReportStockConsumption({...args,db:{rpc:async()=>({error:new Error('Denied')})}})).rejects.toThrow('Denied');
   await expect(fetchReportStockConsumption({...args,db:{rpc:async()=>({data:null})}})).rejects.toThrow('Invalid');
 });
});
