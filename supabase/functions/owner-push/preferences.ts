export const MODULES = ['sales', 'purchases', 'inventory', 'finance', 'people', 'other'];
export const TOKENS = ['business', 'branch', 'action', 'entity', 'reference', 'time'];
export const DEFAULT_PREFERENCES = {
 enabled: true,
 title_template: 'BizCTRL · {business}',
 body_template: '{action} · {entity} · {reference} · {branch}',
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
 return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[{}]/.test(value.replace(/\{(business|branch|action|entity|reference|time)\}/g, ''));
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
export function renderNotification(settings: any, event: any, business: any, branch: any) {
 const p = settings || DEFAULT_PREFERENCES;
 const language = ACTIONS[p.language] ? p.language : 'en';
 const globalBranch = {en:'All business',fa:'سطح کسب‌وکار',ar:'على مستوى المنشأة'}[language];
 let time = '';
 if (event.created_at && Number.isFinite(Date.parse(event.created_at))) {
  try { time = new Intl.DateTimeFormat(language, {timeZone:business?.timezone || 'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}).format(new Date(event.created_at)); }
  catch { time = new Date(event.created_at).toISOString(); }
 }
 const values: Record<string,string> = {
  business: business?.name || 'BizCTRL',
  branch: branch?.name || event.branch || globalBranch || '',
  action: ACTIONS[language][event.action] || event.action || '',
  entity: String(event.entity || '').replaceAll('_', ' '),
  reference: p.show_reference ? String(event.reference || '') : '',
  time,
 };
 const fill = (template: string, max: number) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] || '').slice(0, max);
 return {title:fill(p.title_template,100),body:fill(p.body_template,500)};
}
