import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';

const COPY = {
  en: { title:'Explore BizCTRL', intro:'Explore sample catalogs for 11 business types.', notice:'Read-only demonstration. All names and records are fictional. This is not an operational ERP account; no orders, invoices or financial transactions are created.', loading:'Loading demo catalog…', error:'Demo catalog could not be loaded.', retry:'Retry', business:'Business', products:'Products', suppliers:'Suppliers', categories:'Categories', search:'Search products or suppliers', sku:'SKU', product:'Product', supplier:'Supplier', category:'Category', subcategory:'Subcategory', branches:'Sample branch names', people:'Sample people and roles', empty:'No matching products', home:'Home', signIn:'ERP sign in' },
  ar: { title:'اكتشف بيز كنترول', intro:'استعرض كتالوجات تجريبية لـ 11 نشاطاً تجارياً.', notice:'عرض تجريبي للقراءة فقط. جميع الأسماء والسجلات افتراضية. هذا ليس حساب ERP تشغيلياً ولا ينشئ طلبات أو فواتير أو معاملات مالية.', loading:'جارٍ تحميل الكتالوج التجريبي…', error:'تعذر تحميل الكتالوج التجريبي.', retry:'إعادة المحاولة', business:'النشاط', products:'المنتجات', suppliers:'الموردون', categories:'الفئات', search:'ابحث عن المنتجات أو الموردين', sku:'رمز المنتج', product:'المنتج', supplier:'المورد', category:'الفئة', subcategory:'الفئة الفرعية', branches:'أسماء الفروع التجريبية', people:'الأسماء والأدوار التجريبية', empty:'لا توجد منتجات مطابقة', home:'الرئيسية', signIn:'تسجيل الدخول' },
  fa: { title:'با بیزکنترول آشنا شوید', intro:'کاتالوگ نمونه ۱۱ نوع کسب‌وکار را بررسی کنید.', notice:'دموی فقط خواندنی. تمام نام‌ها و رکوردها فرضی هستند. این حساب عملیاتی ERP نیست و سفارش، فاکتور یا تراکنش مالی ایجاد نمی‌کند.', loading:'در حال دریافت کاتالوگ دیمو…', error:'دریافت کاتالوگ دیمو ممکن نشد.', retry:'تلاش دوباره', business:'کسب‌وکار', products:'محصولات', suppliers:'سپلایرها', categories:'دسته‌بندی‌ها', search:'جستجوی محصول یا سپلایر', sku:'کد محصول', product:'محصول', supplier:'سپلایر', category:'دسته‌بندی', subcategory:'زیردسته', branches:'نام‌های نمونه شعبه', people:'نام‌ها و نقش‌های نمونه', empty:'محصولی یافت نشد', home:'صفحه اصلی', signIn:'ورود به ERP' }
};

const ROLES = {
 owner:['Owner','المالك','مالک'], general_manager:['General manager','المدير العام','مدیر عمومی'], branch_manager:['Branch manager','مدير الفرع','مدیر شعبه'], accountant:['Accountant','المحاسب','حسابدار'], cashier:['Cashier','أمين الصندوق','صندوقدار'], employee:['Employee','الموظف','کارمند'], driver:['Driver','السائق','راننده'], supplier:['Supplier','المورد','سپلایر'], customer:['Customer','العميل','مشتری']
};
const name = (x, lang) => x?.[lang] || x?.en || '';

export default function PublicDemoCatalog() {
 const [lang, setLang] = useState('en');
 const [catalog, setCatalog] = useState(null);
 const [error, setError] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [selected, setSelected] = useState('R01');
 const [query, setQuery] = useState('');
 const c = COPY[lang];
 useEffect(() => {
   let active = true;
   setError(false);
   supabase.from('bizctrl_public_demo_catalog').select('payload').eq('catalog_key','businesses-v1').single()
     .then(({data,error:err}) => {
       if (!active) return;
       if (err || data?.payload?.synthetic !== true || !Array.isArray(data.payload.businesses)) { setError(true); return; }
       setCatalog(data.payload);
     }).catch(() => { if(active) setError(true); });
   return () => { active = false; };
 }, [attempt]);
 const business = catalog?.businesses.find(x => x.code === selected) || catalog?.businesses[0];
 const items = business?.items || [];
 const matches = useMemo(() => {
   const q = query.trim().toLocaleLowerCase();
   return items.filter(x => !q || [x.sku, ...['product','supplier','category','subcategory'].flatMap(k=>Object.values(x[k] || {}))].some(v=>String(v).toLocaleLowerCase().includes(q)));
 }, [items,query]);
 return <main dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang} className="min-h-screen bg-slate-950 text-slate-100">
   <div className="mx-auto max-w-6xl p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
      <Link to="/" className="text-xl font-black text-white">BizCTRL</Link>
      <nav className="flex flex-wrap items-center gap-3 text-sm"><Link to="/">{c.home}</Link><Link to="/erp-login">{c.signIn}</Link>
      <div className="flex gap-1">{[['en','English'],['ar','العربية'],['fa','فارسی']].map(([l,label])=><button key={l} type="button" aria-pressed={lang===l} onClick={()=>setLang(l)} className={'rounded-lg px-3 py-2 '+(lang===l?'bg-cyan-400 text-slate-950 font-semibold':'bg-slate-800')}>{label}</button>)}</div></nav>
    </header>
    <h1 className="mt-8 text-3xl font-black sm:text-5xl">{c.title}</h1><p className="mt-3 text-lg text-slate-300">{c.intro}</p>
    <p className="mt-4 rounded-xl border border-cyan-800 bg-slate-900 p-4 text-sm leading-relaxed">{c.notice}</p>
    {error ? <div role="alert" className="mt-6"><p>{c.error}</p><button type="button" onClick={()=>setAttempt(a=>a+1)} className="mt-3 rounded-lg bg-cyan-400 px-4 py-2 text-slate-950">{c.retry}</button></div> : !catalog ? <p role="status" className="mt-6">{c.loading}</p> : <>
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{catalog.businesses.map(b=><button key={b.code} type="button" aria-pressed={b.code===business?.code} onClick={()=>{setSelected(b.code);setQuery('');}} className={'min-h-20 rounded-xl border p-3 text-start '+(b.code===business?.code?'border-cyan-400 bg-cyan-950':'border-slate-700 bg-slate-900')}><span className="block text-xs text-cyan-300">{b.code}</span><span className="block font-semibold">{name(b.business_name,lang)}</span></button>)}</div>
    <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
      <h2 className="text-2xl font-bold">{name(business?.business_name,lang)}</h2>
      <div className="mt-4 grid grid-cols-3 gap-2">{[[c.products,items.length],[c.suppliers,new Set(items.map(x=>x.supplier.en)).size],[c.categories,new Set(items.map(x=>x.category.en)).size]].map(([label,n])=><div key={label} className="rounded-xl bg-slate-800 p-3"><div className="text-xl font-bold text-cyan-300">{n}</div><div className="text-xs text-slate-300">{label}</div></div>)}</div>
      <label className="mt-5 block text-sm">{c.search}<input value={query} onChange={e=>setQuery(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white" /></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matches.map(x=><article key={x.sku} className="rounded-xl border border-slate-700 p-4"><p dir="ltr" className="text-xs text-cyan-300">{x.sku}</p><h3 className="my-2 text-lg font-bold">{name(x.product,lang)}</h3><dl className="space-y-2 text-sm">{[['supplier',c.supplier],['category',c.category],['subcategory',c.subcategory]].map(([k,label])=><div key={k}><dt className="text-slate-400">{label}</dt><dd>{name(x[k],lang)}</dd></div>)}</dl></article>)}</div>
      {!matches.length && <p className="mt-4 text-slate-300">{c.empty}</p>}
    </section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-700 p-4"><h2 className="mb-3 font-bold">{c.branches}</h2><ul className="space-y-2 text-sm">{catalog.branch_names.map(b=><li key={b.en}>{name(b,lang)}</li>)}</ul></div><div className="rounded-xl border border-slate-700 p-4"><h2 className="mb-3 font-bold">{c.people}</h2><ul className="space-y-2 text-sm">{catalog.people.map(p=><li key={p.display_role}>{name(p.name,lang)} · {ROLES[p.display_role]?.[['en','ar','fa'].indexOf(lang)] || p.display_role}</li>)}</ul></div></section>
    </>}
   </div>
 </main>;
}
