import {createProductImportTemplate} from './productSpreadsheet';

export const FOOD_HEADERS=['food_code','name','name_ar','name_fa','selling_price','tax_rate','category_id','image_url','station','stock_mode','recipe_json','status'];
export function foodTemplate(){return createProductImportTemplate({sheetName:'Restaurant Foods',headers:FOOD_HEADERS,example:['FOOD-001','Example dish','','','22','0','','','Kitchen','untracked','','inactive']});}
export function downloadFoodFile(data,name,type='text/csv;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function foodCsv(rows){return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
export async function foodImportId(tenant,branch,code){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['restaurant-food-import-v1',tenant,branch,code]))));
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function prepareFoodImport(records,{tenant,branch,categories=[],inventory=[],menu=[]}){
 if(!tenant||!branch)throw new Error('Select a restaurant branch.');
 if(!records.length||records.length>500)throw new Error('Import 1–500 food rows per file.');
 const codes=new Set(),rows=[],errors=[];
 for(const record of records){
  const row=record._rowNumber;const text=k=>String(record[k]??'').trim();const code=text('food_code');
  try{
   if(!code||code.length>80)throw new Error('food_code: enter a stable unique code (1–80 characters).');
   if(codes.has(code))throw new Error('food_code: duplicate code in file.');codes.add(code);
   const name=text('name');if(!name||name.length>160)throw new Error('name: enter a food name (1–160 characters).');
   const price=Number(text('selling_price')),tax=Number(text('tax_rate'));
   if(!text('selling_price')||!Number.isFinite(price)||price<0.01||price>1000000)throw new Error('selling_price: enter a price including tax from 0.01 to 1000000.');
   if(!text('tax_rate')||!Number.isFinite(tax)||tax<0||tax>100)throw new Error('tax_rate: enter a percentage from 0 to 100.');
   const category=categories.find(c=>c.id===text('category_id')&&c.is_active!==false);if(!category)throw new Error('category_id: choose an active POS sales category from the reference file.');
   if(text('image_url')){try{if(new URL(text('image_url')).protocol!=='https:')throw new Error();}catch{throw new Error('image_url: use a valid HTTPS URL.');}}
   const mode=text('stock_mode');if(!['recipe','untracked'].includes(mode))throw new Error('stock_mode: use recipe or untracked.');
   const status=text('status').toLowerCase();if(!['active','inactive'].includes(status))throw new Error('status: use active or inactive.');
   let recipe=[];
   if(mode==='recipe'){
    try{recipe=JSON.parse(text('recipe_json'));}catch{throw new Error('recipe_json: invalid JSON.');}
    if(!Array.isArray(recipe)||!recipe.length||recipe.length>100)throw new Error('recipe_json: include 1–100 ingredients.');
    const seen=new Set();recipe=recipe.map(r=>{if(!r||!inventory.some(v=>v.id===r.inventory_id)||seen.has(r.inventory_id)||!Number.isFinite(Number(r.quantity))||Number(r.quantity)<0.000001||Number(r.quantity)>1000000)throw new Error('recipe_json: invalid branch ingredient, duplicate ingredient or quantity.');seen.add(r.inventory_id);return {inventory_id:r.inventory_id,quantity:Number(r.quantity)};});
   }else if(text('recipe_json')&&text('recipe_json')!=='[]')throw new Error('recipe_json: use recipe stock mode to deduct ingredients.');
   const id=await foodImportId(tenant,branch,code);const old=menu.find(m=>m.id===id);
   // Grouped choices must be edited together in the existing group editor.
   if(old?.option_group)throw new Error('This food now has options. Edit it using the food options editor.');
   rows.push({row,code,update:Boolean(old),payload:{id,name,name_ar:text('name_ar'),name_fa:text('name_fa'),price,tax_rate:tax,category_id:category.id,image_url:text('image_url'),station:text('station')||'Kitchen',stock_mode:mode,recipe,active:status==='active'}});
  }catch(e){errors.push({row,code,message:e.message});}
 }
 return {rows,errors};
}
export async function runFoodImport(rows,{tenant,branch,confirmUntracked,rpc,onProgress=()=>{}}){
 if(rows.some(r=>r.payload.stock_mode==='untracked')&&!confirmUntracked)throw new Error('Confirm foods without automatic stock deduction.');
 const results=[];
 for(const row of rows){
  try{await rpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branch,p_command:'menu',p_payload:{...row.payload,confirm_untracked:confirmUntracked}});results.push({...row,ok:true});}
  catch(e){results.push({...row,ok:false,message:e.message});}
  onProgress([...results]);
 }
 return results;
}
