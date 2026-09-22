import {SERVING_KEYS} from './restaurantServingOptions';
import {createProductImportTemplate} from './productSpreadsheet';

export const FOOD_HEADERS=['food_code','name','name_ar','name_fa','selling_price','tax_rate','category_id','image_url','station','stock_mode','recipe_json','status','option_group','size','serving_style','option_3_name','option_3_value','option_4_name','option_4_value','food_id','option_1_name','option_2_name','option_key'];
export function foodTemplate(){return createProductImportTemplate({sheetName:'Restaurant Foods',headers:FOOD_HEADERS,example:['FOOD-001','Example dish','','','22','0','','','Kitchen','untracked','','inactive','Roast chicken','Half','With rice','','','','']});}
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
 const codes=new Set(),ids=new Set(),rows=[],errors=[];
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
   const id=text('food_id')||await foodImportId(tenant,branch,code);const old=menu.find(m=>m.id===id);
   if(text('food_id')&&!old)throw new Error('food_id: this exported food does not belong to the selected branch.');
   if(ids.has(id))throw new Error('food_id: duplicate food in file.');ids.add(id);
   const group=text('option_group'),choices=[];const fixedKey=text('option_key');
   if(fixedKey&&(!SERVING_KEYS.includes(fixedKey)||`${text('size')}_${text('serving_style')}`!==fixedKey))throw new Error('option_key: keep the exported fixed size and serving style, or clear option_key to use custom choices.');
   if(text('size'))choices.push({label:text('option_1_name')||'Size',value:text('size')});
   if(text('serving_style'))choices.push({label:text('option_2_name')||'Serving',value:text('serving_style')});
   for(const n of [3,4]){
    const label=text(`option_${n}_name`),value=text(`option_${n}_value`);
    if(Boolean(label)!==Boolean(value))throw new Error(`option_${n}: enter both name and value.`);
    if(label)choices.push({label,value});
   }
   if(Boolean(group)!==Boolean(choices.length)||group.length>80)throw new Error('option_group: enter a food group and at least one size or option; leave all blank for a standalone dish.');
   if(choices.some(o=>o.label.length>60||o.value.length>60)||new Set(choices.map(o=>o.label)).size!==choices.length)throw new Error('Options must have distinct names and values of 1–60 characters.');
   if(fixedKey&&(choices.length!==2||choices[0].label!=='Size'||choices[1].label!=='Serving'))throw new Error('option_key: fixed servings use only Size and Serving.');
   if(old?.option_group&&old.option_group!==group)throw new Error('Keep the existing option_group. Rename or separate this food in the food editor.');
   rows.push({row,code,update:Boolean(old),payload:{id,name,name_ar:text('name_ar'),name_fa:text('name_fa'),price,tax_rate:tax,category_id:category.id,image_url:text('image_url'),station:text('station')||'Kitchen',stock_mode:mode,recipe,active:status==='active',option_group:group||null,option_key:group?fixedKey||'custom_'+id:null,variant_options:fixedKey?[]:choices}});
  }catch(e){errors.push({row,code,message:e.message});}
 }
 // Validate whole groups before any write; missing rows must not silently alter an existing group.
 const groups=new Map();for(const r of rows)if(r.payload.option_group){const group=r.payload.option_group;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(r);}
 const invalid=new Set();
 for(const [group,items] of groups){
  let message='';const active=items.filter(r=>r.payload.active),labels=active.map(r=>JSON.stringify(r.payload.variant_options.map(o=>o.label))),combinations=items.map(r=>r.payload.variant_options.length?JSON.stringify(r.payload.variant_options):r.payload.option_key);
  if(active.some(r=>r.payload.variant_options.length)&&active.some(r=>!r.payload.variant_options.length))message='Do not mix fixed and custom choices in one food.';
  else if(items.length>100)message='At most 100 choices per food group.';
  else if(new Set(items.map(r=>r.payload.category_id)).size!==1)message='Use the same POS sales category for every choice in a group.';
  else if(new Set(labels).size>1)message='Use the same option names and order for every active choice.';
  else if(new Set(combinations).size!==combinations.length)message='Duplicate size/serving combination in this group.';
  else if(menu.some(m=>m.option_group===group&&!items.some(r=>r.payload.id===m.id)))message='Include every existing choice of this group with its original food_code, or use the food editor.';
  if(message)for(const r of items){invalid.add(r);errors.push({row:r.row,code:r.code,message});}
 }
 return {rows:rows.filter(r=>!invalid.has(r)),errors};
}
export async function runFoodImport(rows,{tenant,branch,confirmUntracked,rpc,onProgress=()=>{}}){
 if(rows.some(r=>r.payload.stock_mode==='untracked')&&!confirmUntracked)throw new Error('Confirm foods without automatic stock deduction.');
 const results=[];
 const batches=new Map();
 for(const row of rows){const key=row.payload.option_group?'group:'+row.payload.option_group:'row:'+row.code;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(row);}
 for(const batch of batches.values()){
  const first=batch[0],group=first.payload.option_group;
  try{
   const items=batch.map(row=>({...row.payload,confirm_untracked:confirmUntracked}));
   await rpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branch,p_command:group?'menu_batch':'menu',p_payload:group?{option_group:group,category_id:first.payload.category_id,items}:items[0]});
   results.push(...batch.map(row=>({...row,ok:true})));
  }catch(e){results.push(...batch.map(row=>({...row,ok:false,message:e.message})));}
  onProgress([...results]);
 }
 return results;
}

// Existing IDs are accepted only when present in the authorized branch catalog.
// Preserve fixed serving keys as well as arbitrary custom option names and order.
export function foodExport(menu=[]){
 const rows=menu.map(m=>{
  const options=m.variant_options?.length?m.variant_options:m.option_group&&m.option_key?[
   {label:'Size',value:m.option_key.split('_')[0]},
   {label:'Serving',value:m.option_key.split('_')[1]}
  ]:[];
  return [m.id,m.name,m.name_ar,m.name_fa,m.price,m.tax_rate,m.category_id,m.image_url,m.station,m.stock_mode,
   JSON.stringify((m.recipe||[]).map(r=>({inventory_id:r.inventory_id,quantity:r.quantity}))),m.active?'active':'inactive',m.option_group,
   options[0]?.value,options[1]?.value,options[2]?.label,options[2]?.value,options[3]?.label,options[3]?.value,m.id,options[0]?.label,options[1]?.label,SERVING_KEYS.includes(m.option_key)?m.option_key:''];
 });
 return createProductImportTemplate({sheetName:'Restaurant Foods',headers:FOOD_HEADERS,rows});
}
