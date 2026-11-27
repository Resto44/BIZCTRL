import {describe,it,expect} from 'vitest';
import {employeeFixedBudget,riyadhBudgetDate} from '../src/lib/employeeFixedBudget';
import {expenseMonthModel} from '../src/lib/expenseInvoiceMonthly';
const branches=[{id:'b1',key:'main'},{id:'b2',key:'second'}];
const scope={restaurantId:'r1',branches,today:'2026-11-27',configuredFixed:1000};
const rows=[
 {id:'e1',restaurant_id:'r1',branch_id:'b1',base_salary:3500,is_active:true,joining_date:'2026-01-01'},
 {id:'e2',restaurant_id:'r1',branch_id:'b2',base_salary:5000,is_active:true},
 {id:'e3',restaurant_id:'r1',branch:'main',salary:2200},
 {id:'e4',restaurant_id:'r1',branch_id:'b1',base_salary:3000,is_active:false},
 {id:'e5',restaurant_id:'r1',branch_id:'b1',base_salary:9000,joining_date:'2026-12-01'},
 {id:'e6',restaurant_id:'r2',branch_id:'b1',base_salary:99999},
 {id:'e7',restaurant_id:'r1',branch_id:'other',base_salary:6000},
 {id:'e8',restaurant_id:'r1',branch_id:'b1',base_salary:0,salary:999},
];
describe('Employee fixed monthly budget',()=>{
 it('sums active base pay by branch and business; avoids duplicates and future hires',()=>{
  expect(employeeFixedBudget([...rows,rows[0]],[],{...scope,branchId:'b1',branchKey:'main'})).toEqual({salary:5700,count:3,manualSalaryConflict:false,combined:6700});
  expect(employeeFixedBudget(rows,[],scope).salary).toBe(10700);
 });
 it('reflects salary changes and archive without adding historical expense records',()=>{
  const updated=rows.map(e=>e.id==='e1'?{...e,base_salary:4000}:e.id==='e2'?{...e,is_active:false}:e);
  expect(employeeFixedBudget(updated,[],scope).salary).toBe(6200);
  expect(expenseMonthModel([],[],{month:'2026-11'}).recordedTotal).toBe(0);
 });
 it('withholds the combined total for a recognized manual salary budget',()=>{
  const cats=[{id:'c',name_ar:'رواتب الموظفين',is_fixed:true,monthly_amount:3500,branch_id:'b1'}];
  expect(employeeFixedBudget(rows,cats,{...scope,branchId:'b1',branchKey:'main'})).toMatchObject({salary:5700,manualSalaryConflict:true,combined:null});
  expect(employeeFixedBudget(rows,cats,{...scope,branchId:'b2',branchKey:'second'}).combined).toBe(6000);
 });
 it('uses the Riyadh date at midnight',()=>expect(riyadhBudgetDate(new Date('2026-11-26T21:00:00Z'))).toBe('2026-11-27'));
});
