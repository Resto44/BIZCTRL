import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useTenant} from '@/lib/TenantContext';
import {useLanguage} from '@/lib/LanguageContext';
import {useRole} from '@/lib/RoleContext';
import {readAllPortalRows} from '@/lib/portalReliability';
import SupplierLedger from '@/pages/SupplierLedger';
import PurchaseInvoiceForm from '@/components/purchases/PurchaseInvoiceForm';
import PurchaseOrderForm from '@/components/purchase-orders/PurchaseOrderForm';
import SupplierWorkspacePayment from './SupplierWorkspacePayment';
import SupplierContractTab from './SupplierContractTab';
import SupplierStatement from './SupplierStatement';
import {supplierOrderItems} from '@/lib/supplierWorkspace';
import {fetchSupplierLedger} from '@/lib/supplierLedgerData';
import PortalDataState from '@/components/shared/PortalDataState';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
const COPY={
 en:{back:'Back',invoice:'Add invoice',order:'New purchase order',payment:'Record payment',account:'Account, invoices & payments',orders:'Purchase orders',contract:'Contract',prices:'Invoice item price history',pdf:'Statement PDF',close:'Close',choose:'Choose an invoice',details:'Invoice details',empty:'No records',edit:'Edit draft',review:'Review the invoice, linked payments and reconciliation here before changing any financial record.'},
 fa:{back:'برگشت',invoice:'افزودن فاکتور',order:'سفارش خرید جدید',payment:'ثبت پرداخت',account:'حساب، فاکتورها و پرداخت‌ها',orders:'سفارش‌های خرید',contract:'قرارداد',prices:'سابقهٔ قیمت اقلام فاکتور',pdf:'صورت‌حساب PDF',close:'بستن',choose:'فاکتور را انتخاب کنید',details:'جزئیات فاکتور',empty:'سابقه‌ای نیست',edit:'ویرایش پیش‌نویس',review:'فاکتور، پرداخت‌های مرتبط و اختلاف حساب را پیش از تغییر مالی همین‌جا بررسی کنید.'},
 ar:{back:'رجوع',invoice:'إضافة فاتورة',order:'أمر شراء جديد',payment:'تسجيل دفعة',account:'الحساب والفواتير والمدفوعات',orders:'أوامر الشراء',contract:'العقد',prices:'سجل أسعار أصناف الفواتير',pdf:'كشف حساب PDF',close:'إغلاق',choose:'اختر فاتورة',details:'تفاصيل الفاتورة',empty:'لا توجد سجلات',edit:'تعديل المسودة',review:'راجع الفاتورة والدفعات المرتبطة والفروقات هنا قبل تعديل أي سجل مالي.'},
};
export default function SupplierDetail({supplier,onBack}) {
 const {lang='en'}=useLanguage();const t=COPY[lang]||COPY.en;
 const {activeRestaurantId,activeRestaurant,isBranchScoped,isManager,managerBranchObject}=useTenant();
 const restaurantId=activeRestaurantId||activeRestaurant?.id;const restricted=isBranchScoped||isManager;const branch=restricted?managerBranchObject:null;
 const {can}=useRole();const qc=useQueryClient();const [action,setAction]=useState(null);
 const financial=useQuery({queryKey:['supplier-ledger',restaurantId,restricted,branch?.id,branch?.key],queryFn:()=>fetchSupplierLedger(supabase,{restaurantId,branch}),enabled:Boolean(restaurantId&&(!restricted||branch?.id))});
 const orders=useQuery({queryKey:['supplier-workspace-orders',restaurantId,supplier.id,branch?.id],queryFn:()=>readAllPortalRows(()=>{let q=supabase.from('purchase_orders').select('*').eq('restaurant_id',restaurantId).eq('supplier_id',supplier.id).order('id');if(branch)q=q.eq('branch_id',branch.id);return q;}),enabled:Boolean(restaurantId&&(!restricted||branch?.id))});
 const invoices=(financial.data?.invoices||[]).filter(i=>i.supplier_id===supplier.id);
 const refresh=()=>{for(const key of ['supplier-ledger','supplier-workspace-orders','supplier_invoices','supplier_payments','purchase_orders','inventory','cash_movements','daily_cash_settlements','wallet_transactions','debt_records'])qc.invalidateQueries({queryKey:[key]});setAction(null);};
 const currentSupplier=financial.data?.suppliers.find(s=>s.id===supplier.id)||supplier;
 if(financial.isError||orders.isError)return <PortalDataState onRetry={()=>{financial.refetch();orders.refetch();}}/>;
 if(financial.isLoading||orders.isLoading)return <PortalDataState loading/>;
 if(!restaurantId || (restricted&&!branch?.id))return <PortalDataState missing/>;
 return <div className="space-y-4" dir={lang==='en'?'ltr':'rtl'}>
  <header className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={onBack}>{t.back}</Button><h2 className="text-xl font-bold">{supplier.name}</h2></header>
  <Card className="flex flex-wrap gap-4 p-3 text-sm">{supplier.phone&&<a href={`tel:${supplier.phone}`} dir="ltr">{supplier.phone}</a>}{supplier.email&&<a href={`mailto:${supplier.email}`}>{supplier.email}</a>}</Card>
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{can.createPurchases&&<><Button onClick={()=>setAction({type:'invoice'})}>{t.invoice}</Button><Button variant="outline" onClick={()=>setAction({type:'choose-payment'})}>{t.payment}</Button></>}{can.updatePurchaseOrders&&<Button variant="outline" onClick={()=>setAction({type:'order'})}>{t.order}</Button>}</div>
  {action&&<div className="rounded-xl border-2 border-primary/30 p-3">
   {action.type==='invoice'&&<PurchaseInvoiceForm key={action.invoice?.id||'new'} supplier={supplier} invoice={action.invoice} onSuccess={refresh} onCancel={()=>setAction(null)}/>}
   {action.type==='order'&&<PurchaseOrderForm key={action.order?.id||'new'} supplier={supplier} order={action.order} onSaved={refresh} onClose={()=>setAction(null)}/>}
   {action.type==='payment'&&<SupplierWorkspacePayment key={action.invoice.id} invoice={action.invoice} onSaved={refresh} onClose={()=>setAction(null)}/>}
   {action.type==='choose-payment'&&<div className="space-y-2"><h3>{t.choose}</h3>{invoices.filter(i=>Number(i.total_amount)>Number(i.paid_amount||0)&&!['draft','cancelled','rejected'].includes(i.status)).map(i=><Button key={i.id} variant="outline" className="me-2" onClick={()=>setAction({type:'payment',invoice:i})}>{i.invoice_number || i.id.slice(0,8)} · {i.currency} {Number(i.total_amount)-Number(i.paid_amount||0)}</Button>)}<Button variant="ghost" onClick={()=>setAction(null)}>{t.close}</Button></div>}
   {action.type==='view'&&<div className="space-y-2"><h3 className="font-bold">{t.details}: {action.invoice.invoice_number}</h3><p className="text-xs">{t.review}</p><p>{action.invoice.date} · {action.invoice.currency} {action.invoice.total_amount} · {action.invoice.status}</p><p className="whitespace-pre-wrap">{action.invoice.notes}</p>{supplierOrderItems(action.invoice.items).map((item,i)=><p key={i} className="text-sm">{item.product_name || item.name} · {item.qty || item.quantity} × {item.unit_price || item.price}</p>)}{(financial.data?.payments||[]).filter(p=>p.invoice_id===action.invoice.id).map(p=><p key={p.id} className="text-sm">{p.date} · {p.amount} · {p.payment_method} · {p.notes}</p>)}{can.createPurchases&&action.invoice.status==='draft'&&<Button onClick={()=>setAction({type:'invoice',invoice:action.invoice})}>{t.edit}</Button>}<Button variant="outline" onClick={()=>setAction(null)}>{t.close}</Button></div>}
  </div>}
  <SupplierLedger supplier={supplier} onPayInvoice={can.createPurchases?invoice=>setAction({type:'payment',invoice}):undefined} onOpenInvoice={invoice=>setAction({type:'view',invoice})}/>
  <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{t.orders} ({orders.data?.length||0})</summary><div className="mt-3 space-y-2">{(orders.data||[]).map(order=><Card className="p-3" key={order.id}><p>{order.order_number} · {order.created_date?.slice(0,10)} · {order.status}</p>{supplierOrderItems(order.items).map((item,i)=><p key={i} className="text-xs">{item.product_name} · {item.qty} × {item.unit_price}</p>)}{can.updatePurchaseOrders&&order.status==='draft'&&<Button size="sm" variant="outline" onClick={()=>setAction({type:'order',order})}>{t.edit}</Button>}</Card>)}</div></details>
  <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{t.contract}</summary><SupplierContractTab key={currentSupplier.updated_date} supplier={currentSupplier} readOnly={!can.manageSuppliers}/></details>
  <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{t.prices}</summary>{invoices.flatMap(inv=>supplierOrderItems(inv.items).map((item,i)=><p key={`${inv.id}-${i}`} className="py-2 text-sm">{inv.date} · {inv.invoice_number} · {item.product_name} · {inv.currency} {item.unit_price || item.price || 0}</p>))}</details>
  <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{t.pdf}</summary><SupplierStatement supplier={supplier}/></details>
 </div>;
}
