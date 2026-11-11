// Pure presentation/cent arithmetic for the already-authorized POS menu.
export function creditPOSMenuLabel(menu, lang='en') {
 const raw=String(menu?.[`name_${lang}`]||menu?.name||menu?.name_ar||menu?.name_fa||'').trim();
 const group=String(menu?.option_group||'').trim();
 const combined=group&&!raw.includes(group)?`${group} · ${raw}`:raw;
 return combined.slice(0,160);
}
export function creditPOSMenuChoices(rows) {
 if(!Array.isArray(rows))return [];
 return rows.filter(x=>x && typeof x.id==='string' && typeof x.product_id==='string'
   && Boolean(x.name||x.name_ar||x.name_fa)
   && Number.isFinite(Number(x.price)) && Number(x.price)>0
   && Math.abs(Math.round(Number(x.price)*100)-Number(x.price)*100)<1e-6);
}
export function creditPOSInvoiceItem(menu,lang='en',quantity=1) {
 const price=Number(menu.price);
 const qty=Math.max(1,Math.min(1000,Number(quantity)||1));
 return {
  menu_id:menu.id,product_id:menu.product_id,
  name:creditPOSMenuLabel(menu,'en'),
  name_ar:creditPOSMenuLabel(menu,'ar'),
  name_fa:creditPOSMenuLabel(menu,'fa'),
  quantity:qty,unit_price:price,
  total_price:Math.round(qty*price*100)/100
 };
}
export function creditPOSInvoiceTotal(items){
 return ((items||[]).reduce((cents,line)=>{
  const q=Number(line.quantity),p=Number(line.unit_price);
  if(!Number.isFinite(q)||!Number.isFinite(p))return cents;
  return cents+Math.round(q*p*100);
 },0)/100).toFixed(2);
}
