export function isActiveMaterial(p){return p.is_active!==false&&!['inactive','discontinued'].includes(p.status);}
export function isRestorableMaterial(p){return p.is_active===false&&p.status==='inactive';}
export function filterRawMaterials(products,search='',archived=false){
 const needle=search.trim().toLocaleLowerCase();
 return products.filter(p=>(archived?isRestorableMaterial(p):isActiveMaterial(p))&&[p.name,p.name_en,p.name_ar,p.name_fa,p.sku,p.product_id,p.barcode].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
}
export function toggleRawMaterialSelection(ids,id){return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];}
export function selectedRawMaterials(rows,ids){const set=new Set(ids);return rows.filter(p=>set.has(p.id));}
