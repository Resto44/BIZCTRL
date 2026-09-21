import {Children,Fragment,isValidElement,useRef,useState} from 'react';
import './touch.css';
export function touchCopy(lang='en') {return ({en:{categories:'Categories',title:'Touch screen POS',exit:'Back to workspace',next:'Next',previous:'Previous',more:'Actions',products:'Products',invoice:'Invoice',choose:'Choose',back:'Back',add:'Add to order',quantity:'Quantity',hold:'Held orders',receipts:'Receipts',empty:'No items',cancel:'Close',full:'Full screen'},ar:{categories:'الفئات',title:'كاشير باللمس',exit:'العودة للإدارة',next:'التالي',previous:'السابق',more:'الإجراءات',products:'المنتجات',invoice:'الفاتورة',choose:'اختر',back:'رجوع',add:'إضافة للطلب',quantity:'الكمية',hold:'طلبات معلقة',receipts:'الفواتير',empty:'لا توجد أصناف',cancel:'إغلاق',full:'ملء الشاشة'},fa:{categories:'کتگوری‌ها',title:'کاشیر تاچ‌اسکرین',exit:'بازگشت به مدیریت',next:'بعدی',previous:'قبلی',more:'عملیات',products:'محصولات',invoice:'فاکتور',choose:'انتخاب',back:'برگشت',add:'افزودن به سفارش',quantity:'تعداد',hold:'سفارش‌های معلق',receipts:'فاکتورها',empty:'موردی نیست',cancel:'بستن',full:'تمام صفحه'}})[lang]||touchCopy('en');}
export function useTouchMode(){
 const [off,setOff]=useState(false);
 return {enabled:!off,supported:true,enable:()=>setOff(false),exit:()=>setOff(true)};
}
export function Pager({page,pages,onChange,lang}){const t=touchCopy(lang);return <nav className="touch-pager" aria-label={t.next}><button type="button" disabled={page<=0} onClick={()=>onChange(page-1)}>{t.previous}</button><output>{page+1} / {Math.max(1,pages)}</output><button type="button" disabled={page>=pages-1} onClick={()=>onChange(page+1)}>{t.next}</button></nav>;}
export function usePage(items,size,resetKey=''){
 const [state,setState]=useState({key:resetKey,page:0});const pages=Math.max(1,Math.ceil(items.length/size));const page=state.key===resetKey?Math.min(state.page,pages-1):0;
 return {page,pages,setPage:p=>setState({key:resetKey,page:Math.max(0,p)}),items:items.slice(page*size,(page+1)*size)};
}
const flatten=children=>Children.toArray(children).flatMap(child=>isValidElement(child)&&child.type===Fragment?flatten(child.props.children):[child]);
// Each step stays within the viewport; parent state retains fields between steps.
export function TouchForm({children,onSubmit,lang,...props}){
 const [step,setStep]=useState(0);const form=useRef(null);const fields=flatten(children);const pages=Math.max(1,Math.ceil(fields.length/2));const page=Math.min(step,pages-1);
 const next=()=>{if(form.current?.reportValidity())setStep(p=>Math.min(p+1,pages-1));};
 return <form {...props} ref={form} className="touch-form" onSubmit={e=>{if(page<pages-1){e.preventDefault();next();}else onSubmit?.(e);}}><div className="touch-form-fields">{fields.slice(page*2,page*2+2)}</div><nav className="touch-pager"><button type="button" disabled={page===0} onClick={()=>setStep(p=>Math.max(0,p-1))}>{touchCopy(lang).previous}</button><output>{page+1} / {pages}</output><button type="button" disabled={page===pages-1} onClick={next}>{touchCopy(lang).next}</button></nav></form>;
}
export function TouchReceiptLines({lines=[],render,lang}){const p=usePage(lines,2);return <div><div>{p.items.map(render)}</div><Pager page={p.page} pages={p.pages} onChange={p.setPage} lang={lang}/></div>;}
