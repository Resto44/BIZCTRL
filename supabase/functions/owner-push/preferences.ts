import { entityLabel, recordDetails, isFinancialEvent, readablePushReference } from './events.ts';
export const MODULES = ['sales', 'purchases', 'inventory', 'finance', 'people', 'other'];
export const TOKENS = ['business', 'branch', 'action', 'entity', 'reference', 'time', 'sales', 'expenses', 'purchases', 'net_profit', 'date', 'currency', 'network_sales', 'pos_sales', 'source_sales', 'delivery_sales', 'delivery_cash', 'delivery_network', 'credit_sales', 'receivables'];
export const DEFAULT_PREFERENCES = {
 enabled: true,
 financial_summary: true,
 title_template: '{business}',
 body_template: '{branch} · {date}\nSales: {sales}\nPurchases: {purchases}\nExpenses: {expenses}\nNetwork sales: {network_sales}\nPOS sales: {pos_sales}\nSales Sources: {source_sales}\nDelivery sales: {delivery_sales}\nNet profit: {net_profit}',
 language: 'en',
 actions: ['insert', 'update', 'delete'],
 modules: [...MODULES],
 branch_ids: [],
 show_reference: true,
};
export function moduleFor(entity: string): string {
 if (/^(sales_|daily_sales|orders$|order_items$|payments$|retail_pos_|delivery_orders$|reservations$|dining_tables$|promotions$)/.test(entity)) return 'sales';
 if (/^(purchas|supplier)/.test(entity)) return 'purchases';
 if (/^(product|categor|inventory|retail_inventory|recipe|ingredient|production|branch_product|online_order_categor|batch_document)/.test(entity)) return 'inventory';
 if (/^(debt|cash_|daily_cash|owner_cash|owner_personal|treasury|wallet|network_|settlement|sponsor_|customer_collection|collection_action|driver_debt|driver_settlement|driver_sales|expense|pos_reconciliation)/.test(entity)) return 'finance';
 if (/^(employee|staff_|attendance|payroll|salary|deduction|customer|driver|manager_invite|branch_assignment|erp_invitation|erp_registration)/.test(entity)) return 'people';
 return 'other';
}
export function validTemplate(value: unknown, max: number): boolean {
 return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[{}]/.test(value.replace(/\{(business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|credit_sales|receivables)\}/g, ''));
}
export function resolveBranch(event: any, branches: any[]) {
 const exact = branches.find(b => b.id === event.branch) || branches.find(b => b.branch_key === event.branch);
 if (exact) return exact;
 const named = branches.filter(b => b.name === event.branch);
 return named.length === 1 ? named[0] : undefined;
}
export function shouldDeliver(settings: any, event: any, branch: any): boolean {
 const p = settings || DEFAULT_PREFERENCES;
 return p.enabled && p.actions.includes(event.action) && p.modules.includes(moduleFor(event.entity)) &&
  (p.branch_ids.length === 0 || Boolean(branch && p.branch_ids.includes(branch.id)));
}
const ACTIONS: Record<string, Record<string,string>> = {
 en: {insert:'Created',update:'Updated',delete:'Deleted'},
 fa: {insert:'ثبت شد',update:'تغییر کرد',delete:'حذف شد'},
 ar: {insert:'تمت الإضافة',update:'تم التعديل',delete:'تم الحذف'},
};
// Compact iPhone-first labels: sales and purchases are daily flows; receivables
// are the outstanding customer balance as of dispatch, not additional sales.
export const COMPACT_PUSH_LABELS: Record<string, Record<string,string>> = {
 en:{sales:'Sales',purchases:'Purchases',network:'Network',credit:'Credit sales',receivables:'Customer debt',profit:'Profit',loss:'Loss',amount:'Amount',status:'Status'},
 ar:{sales:'المبيعات',purchases:'المشتريات',network:'الشبكة',credit:'الآجل',receivables:'ديون العملاء',profit:'ربح',loss:'خسارة',amount:'المبلغ',status:'الحالة'},
 fa:{sales:'فروشات',purchases:'خرید',network:'شبکه',credit:'فروشات نسیه',receivables:'طلب مشتری',profit:'فایده',loss:'نقصان',amount:'مبلغ',status:'وضعیت'},
};
export function pushCurrency(raw: unknown): string {
 const currency=String(raw || '').trim();
 // Symbols without a currency code are ambiguous; never silently convert USD
 // amounts into SAR. The business currency must be corrected in ERP Settings.
 return currency === '$' ? 'USD' : (currency || 'SAR');
}
const financialValue=(financial: any, key: string): number | null => {
 const raw=financial?.[key];
 return raw===null || raw===undefined || raw==='' || !Number.isFinite(Number(raw)) ? null : Number(raw);
};
function compactFinancialLines(language: string, financial: any, currency: string): string[] {
 if(!financial) return [];
 const t=COMPACT_PUSH_LABELS[language] || COMPACT_PUSH_LABELS.en;
 const fmt=(key: string) => {
  const value=financialValue(financial,key);
  return value===null ? '—' : new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(value);
 };
 const profit=financialValue(financial,'net_profit');
 const moneyCurrency=pushCurrency(financial.currency || currency);
 const line=(parts: string[])=>parts.join(' · ');
 return [
  line([`${t.sales}: ${fmt('sales')}`,`${t.purchases}: ${fmt('purchases')}`]),
  line([`${t.network}: ${fmt('network_sales')}`,`${t.credit}: ${fmt('credit_sales')}`]),
  line([`${profit!==null && profit<0?t.loss:t.profit}: ${profit===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Math.abs(profit))}`,`${t.receivables}: ${fmt('receivables')}`]) + ` ${moneyCurrency}`,
 ];
}
function isStockFinancialLayout(template: string): boolean {
 // Automatically upgrade previous built-in presets; arbitrary user prose is kept.
 return template.trimStart().startsWith('{branch} · {date}')
  && ['{sales}','{purchases}','{net_profit}','{network_sales}'].every(token=>template.includes(token));
}
export const FINANCIAL_LABELS: Record<string, any> = {
 en: {heading:'Append financial summary to custom text',sales:'Sales',purchases:'Purchases',network:'Network sales',pos:'POS sales',sources:'Sales Sources',delivery:'Delivery sales',cash:'Delivery cash',deliveryNetwork:'Delivery network',expenses:'Expenses',profit:'Net profit',creditSales:'Credit sales',receivables:'Customer debt',preset:'Use financial layout',help:'Totals for the record’s business date; drafts are excluded. Delivery = driver cash + network, already included in sales. Net profit = sales − approved purchases − variable expenses − allocated fixed expenses. Amounts appear on the lock screen. Network, POS and Sales Sources may overlap; do not add them together. Preview uses example amounts.'},
 fa: {heading:'افزودن خلاصهٔ مالی به متن سفارشی',sales:'فروشات',purchases:'خرید',network:'فروشات شبکه',pos:'فروشات POS',sources:'فروشات منابع فروش',delivery:'فروش دلیوری',cash:'نقد دلیوری',deliveryNetwork:'شبکهٔ دلیوری',expenses:'مصارف',profit:'فایدهٔ خالص',creditSales:'فروشات نسیه',receivables:'طلب مشتری',preset:'استفاده از قالب مالی',help:'جمع تاریخ رکورد؛ پیش‌نویس حساب نمی‌شود. دلیوری = نقد + شبکهٔ راننده و قبلاً در فروشات شامل است. فایدهٔ خالص = فروشات − خریدهای تأییدشده − مصارف متغیر − سهم روزانهٔ مصارف ثابت. ارقام روی صفحهٔ قفل دیده می‌شوند. شبکه، POS و Sales Sources ممکن است هم‌پوشانی داشته باشند؛ باهم جمع نکنید. پیش‌نمایش ارقام نمونه دارد.'},
 ar: {heading:'إضافة الملخص المالي إلى النص المخصص',sales:'المبيعات',purchases:'المشتريات',network:'مبيعات الشبكة',pos:'مبيعات POS',sources:'مصادر المبيعات',delivery:'مبيعات التوصيل',cash:'نقد التوصيل',deliveryNetwork:'شبكة التوصيل',expenses:'المصروفات',profit:'صافي الربح',creditSales:'الآجل',receivables:'ديون العملاء',preset:'استخدام القالب المالي',help:'إجماليات تاريخ السجل دون المسودات. التوصيل = نقد السائق + الشبكة، وهو ضمن المبيعات. صافي الربح = المبيعات − المشتريات المعتمدة − المصروفات المتغيرة − الحصة اليومية للمصروفات الثابتة. تظهر المبالغ على شاشة القفل. قد تتداخل مبيعات الشبكة وPOS والمصادر؛ لا تجمعها معًا. المعاينة بأرقام تجريبية.'},
};
export function financialTemplate(language: string) {
 const t=FINANCIAL_LABELS[language] || FINANCIAL_LABELS.en;
 return `{branch} · {date}\n${t.sales}: {sales} · ${t.purchases}: {purchases}\n${t.network}: {network_sales} · ${t.creditSales}: {credit_sales}\n${t.profit}: {net_profit} · ${t.receivables}: {receivables}`;
}
export function needsFinancialSummary(settings: any, event: any = {}) {
 if (!isFinancialEvent(event)) return false;
 return settings?.financial_summary !== false || /\{(sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|credit_sales|receivables)\}/.test((settings?.title_template || '')+(settings?.body_template || ''));
}
export function renderNotification(settings: any, event: any, business: any, branch: any, financial: any = null) {
 const p = settings || DEFAULT_PREFERENCES;
 const language = ACTIONS[p.language] ? p.language : 'en';
 const globalBranch = {en:'All business',fa:'سطح کسب‌وکار',ar:'على مستوى المنشأة'}[language];
 let time = '';
 if (event.created_at && Number.isFinite(Date.parse(event.created_at))) {
  try { time = new Intl.DateTimeFormat(language, {timeZone:business?.timezone || 'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}).format(new Date(event.created_at)); }
  catch { time = new Date(event.created_at).toISOString(); }
 }
 const money=(key: string) => financial && financial[key]!==null && financial[key]!==undefined && financial[key]!=='' && Number.isFinite(Number(financial[key]))
  ? `${new Intl.NumberFormat(language, {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(financial[key]))} ${pushCurrency(financial.currency || business?.currency || 'SAR')}` : '—';
 const values: Record<string,string> = {
  delivery_sales:money('delivery_sales'),delivery_cash:money('delivery_cash'),delivery_network:money('delivery_network'),
  network_sales:money('network_sales'),pos_sales:money('pos_sales'),source_sales:money('source_sales'),credit_sales:money('credit_sales'),receivables:money('receivables'),
  sales:money('sales'),expenses:money('expenses'),purchases:money('purchases'),net_profit:money('net_profit'),
  date: financial?.date || '—',currency:pushCurrency(financial?.currency || business?.currency),
  business: business?.name || 'BizCTRL',
  branch: branch?.name || event.context?.branch_name || event.branch || globalBranch || '',
  action: ACTIONS[language][event.action] || event.action || '',
  entity: entityLabel(event.entity,language),
  reference: p.show_reference ? readablePushReference(event.reference) : '',
  time,
 };
 const fill = (template: string, max: number) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] || '').slice(0, max);
 const hasAmounts=/\{(sales|expenses|purchases|net_profit|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|credit_sales|receivables)\}/.test(p.body_template);
 const summary=fill(financialTemplate(language),500);
 // Always preserve the actual event before optional/custom financial text.
 const eventLine=event.entity && event.action ? `${values.entity} · ${values.action}` : '';
 const header=eventLine ? [eventLine,...recordDetails(event,language,event.context?.currency || business?.currency || 'SAR',p.show_reference)].join('\n') : '';
 let base=fill(p.body_template,500);
 if(!isFinancialEvent(event) && hasAmounts) base=fill(p.body_template.split('\n').filter((line: string)=>!(/\{(sales|expenses|purchases|net_profit|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|date)\}/.test(line))).join('\n'),500) + '\n' + [values.branch,values.time].filter(Boolean).join(' · ');
 // Old financial-only presets remain compatible. Non-financial records do not
 // inherit an unrelated sales summary. Custom non-financial prose is preserved.
 const tail=isFinancialEvent(event) && p.financial_summary !== false && !hasAmounts ? `${base}\n${summary}` : base;
 const context=eventLine && !/\{(branch|time|date)\}/.test(p.body_template) ? [values.branch,values.time].filter(Boolean).join(' · ') : '';
 // The default financial preset was too long for an iPhone lock screen:
 // put the event first, discard opaque IDs and follow with three concise lines.
 if(isFinancialEvent(event) && p.financial_summary !== false && isStockFinancialLayout(p.body_template)) {
  const currency=pushCurrency(event.context?.currency || financial?.currency || business?.currency);
  const reference=p.show_reference ? readablePushReference(event.reference) : '';
  const amount=financialValue(event.context,'amount');
  const amountText=amount===null?'':`${new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(amount)} ${currency}`;
  const status=recordDetails({...event,reference:'',context:{status:event.context?.status}},language,currency,false)[0] || '';
  const details=[values.branch, reference, amountText || status].filter(Boolean).join(' · ');
  const lines=compactFinancialLines(language,financial,currency);
  const body=[eventLine,details,...lines].filter(Boolean).join('\n').slice(0,500);
  return {title:fill(p.title_template,100),body};
 }
 const body=[header,context,tail].filter(Boolean).join('\n').slice(0,1000);
 return {title:fill(p.title_template,100),body};
}

export function appPushLanguage(language: unknown) {
 return ['en','ar','fa'].includes(String(language)) ? String(language) : 'en';
}
export function preferencesForLanguage(settings: any, language: unknown) {
 const p=settings || DEFAULT_PREFERENCES;
 const lang=appPushLanguage(language || p.language);
 const labels=FINANCIAL_LABELS[lang];
 const fields: Record<string,string>={sales:'sales',purchases:'purchases',expenses:'expenses',network_sales:'network',pos_sales:'pos',source_sales:'sources',delivery_sales:'delivery',delivery_cash:'cash',delivery_network:'deliveryNetwork',net_profit:'profit',credit_sales:'creditSales',receivables:'receivables'};
 const localize=(template: string)=>template.replace(/([^\n:]+):\s*\{(sales|purchases|expenses|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|net_profit)\}/g,(match,label,key)=>{
  const known=(key==='source_sales' && label.trim()==='فروشات Sales Sources') || Object.values(FINANCIAL_LABELS).some(l=>l[fields[key]]===label.trim());
  return known ? `${labels[fields[key]]}: {${key}}` : match;
 });
 return {...p,language:lang,title_template:localize(p.title_template),body_template:isStockFinancialLayout(p.body_template) ? financialTemplate(lang) : localize(p.body_template)};
}
