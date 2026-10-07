import { entityLabel, recordDetails, isFinancialEvent } from './events.ts';
export const MODULES = ['sales', 'purchases', 'inventory', 'finance', 'people', 'other'];
export const TOKENS = ['business', 'branch', 'action', 'entity', 'reference', 'time', 'sales', 'expenses', 'purchases', 'net_profit', 'date', 'currency', 'network_sales', 'pos_sales', 'source_sales', 'delivery_sales', 'delivery_cash', 'delivery_network'];
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
 return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[{}]/.test(value.replace(/\{(business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network)\}/g, ''));
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
export const FINANCIAL_LABELS: Record<string, any> = {
 en: {heading:'Append financial summary to custom text',sales:'Sales',purchases:'Purchases',network:'Network sales',pos:'POS sales',sources:'Sales Sources',delivery:'Delivery sales',cash:'Delivery cash',deliveryNetwork:'Delivery network',expenses:'Expenses',profit:'Net profit',preset:'Use financial layout',help:'Totals for the record’s business date; drafts are excluded. Delivery = driver cash + network, already included in sales. Net profit = sales − approved purchases − variable expenses − allocated fixed expenses. Amounts appear on the lock screen. Network, POS and Sales Sources may overlap; do not add them together. Preview uses example amounts.'},
 fa: {heading:'افزودن خلاصهٔ مالی به متن سفارشی',sales:'فروشات',purchases:'خرید',network:'فروشات شبکه',pos:'فروشات POS',sources:'فروشات منابع فروش',delivery:'فروش دلیوری',cash:'نقد دلیوری',deliveryNetwork:'شبکهٔ دلیوری',expenses:'مصارف',profit:'فایدهٔ خالص',preset:'استفاده از قالب مالی',help:'جمع تاریخ رکورد؛ پیش‌نویس حساب نمی‌شود. دلیوری = نقد + شبکهٔ راننده و قبلاً در فروشات شامل است. فایدهٔ خالص = فروشات − خریدهای تأییدشده − مصارف متغیر − سهم روزانهٔ مصارف ثابت. ارقام روی صفحهٔ قفل دیده می‌شوند. شبکه، POS و Sales Sources ممکن است هم‌پوشانی داشته باشند؛ باهم جمع نکنید. پیش‌نمایش ارقام نمونه دارد.'},
 ar: {heading:'إضافة الملخص المالي إلى النص المخصص',sales:'المبيعات',purchases:'المشتريات',network:'مبيعات الشبكة',pos:'مبيعات POS',sources:'مصادر المبيعات',delivery:'مبيعات التوصيل',cash:'نقد التوصيل',deliveryNetwork:'شبكة التوصيل',expenses:'المصروفات',profit:'صافي الربح',preset:'استخدام القالب المالي',help:'إجماليات تاريخ السجل دون المسودات. التوصيل = نقد السائق + الشبكة، وهو ضمن المبيعات. صافي الربح = المبيعات − المشتريات المعتمدة − المصروفات المتغيرة − الحصة اليومية للمصروفات الثابتة. تظهر المبالغ على شاشة القفل. قد تتداخل مبيعات الشبكة وPOS والمصادر؛ لا تجمعها معًا. المعاينة بأرقام تجريبية.'},
};
export function financialTemplate(language: string) {
 const t=FINANCIAL_LABELS[language] || FINANCIAL_LABELS.en;
 return `{branch} · {date}\n${t.sales}: {sales}\n${t.purchases}: {purchases}\n${t.expenses}: {expenses}\n${t.network}: {network_sales}\n${t.pos}: {pos_sales}\n${t.sources}: {source_sales}\n${t.delivery}: {delivery_sales}\n${t.profit}: {net_profit}`;
}
export function needsFinancialSummary(settings: any, event: any = {}) {
 if (!isFinancialEvent(event)) return false;
 return settings?.financial_summary !== false || /\{(sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network)\}/.test((settings?.title_template || '')+(settings?.body_template || ''));
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
  ? `${new Intl.NumberFormat(language, {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(financial[key]))} ${financial.currency || business?.currency || 'SAR'}` : '—';
 const values: Record<string,string> = {
  delivery_sales:money('delivery_sales'),delivery_cash:money('delivery_cash'),delivery_network:money('delivery_network'),
  network_sales:money('network_sales'),pos_sales:money('pos_sales'),source_sales:money('source_sales'),
  sales:money('sales'),expenses:money('expenses'),purchases:money('purchases'),net_profit:money('net_profit'),
  date: financial?.date || '—',currency:financial?.currency || business?.currency || '',
  business: business?.name || 'BizCTRL',
  branch: branch?.name || event.context?.branch_name || event.branch || globalBranch || '',
  action: ACTIONS[language][event.action] || event.action || '',
  entity: entityLabel(event.entity,language),
  reference: p.show_reference ? String(event.reference || '') : '',
  time,
 };
 const fill = (template: string, max: number) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] || '').slice(0, max);
 const hasAmounts=/\{(sales|expenses|purchases|net_profit|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network)\}/.test(p.body_template);
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
 const fields: Record<string,string>={sales:'sales',purchases:'purchases',expenses:'expenses',network_sales:'network',pos_sales:'pos',source_sales:'sources',delivery_sales:'delivery',delivery_cash:'cash',delivery_network:'deliveryNetwork',net_profit:'profit'};
 const localize=(template: string)=>template.replace(/([^\n:]+):\s*\{(sales|purchases|expenses|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|net_profit)\}/g,(match,label,key)=>{
  const known=(key==='source_sales' && label.trim()==='فروشات Sales Sources') || Object.values(FINANCIAL_LABELS).some(l=>l[fields[key]]===label.trim());
  return known ? `${labels[fields[key]]}: {${key}}` : match;
 });
 return {...p,language:lang,title_template:localize(p.title_template),body_template:localize(p.body_template)};
}
