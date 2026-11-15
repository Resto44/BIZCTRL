import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import { PackageCheck } from 'lucide-react';
import { isSupermarketProductPortal } from '@/lib/productImportAccess';
import { useRetailInventory } from '@/hooks/useRetailInventory';
import InventoryDocumentForm from '@/components/retail-inventory/InventoryDocumentForm';
import InventoryDocumentDetail from '@/components/retail-inventory/InventoryDocumentDetail';

const MESSAGES = {
  en: {
    title: 'Receive Order', date: 'Receipt Date',
    description: 'Enter quantities physically received now. Each line is tracked separately and posted exactly once.',
    ordered: 'Ordered', previously: 'Already received', remaining: 'Remaining',
    partial: 'Partial receipt — outstanding quantities remain open.',
    confirm: 'Confirm Receipt & Update Stock', saving: 'Updating…',
    loading: 'Checking previous receipts…', cancel: 'Cancel',
    noItems: 'Enter at least one received quantity.',
    invalid: 'Quantities must be between zero and the remaining amount for each line.',
    legacy: 'This order has older partial receipts without a reliable audit. Reconcile previous purchases before recording another receipt.',
    uncertain: 'Connection interrupted. The receipt may have saved. Retry without changing quantities; the same receipt ID prevents duplicate posting.',
    failure: 'Receipt was not saved. Check the error and retry.',
    progressError: 'Cannot check previously received quantities. Receipt is blocked to prevent duplicates.',
    PO_RECEIPT_INVALID_ORDER_STATUS: 'Order status changed. Refresh the orders before receiving.',
    PO_RECEIPT_EXCEEDS_REMAINING_QUANTITY: 'Another receipt changed the remaining quantity. Close and open the order again.',
    PO_RECEIPT_LEGACY_PARTIAL_RECONCILIATION_REQUIRED: 'Previous partial receipts need reconciliation before receiving again.',
  },
  ar: {
    title: 'استلام الطلب', date: 'تاريخ الاستلام',
    description: 'أدخل الكمية المستلمة فعلياً الآن. كل بند يُسجل مستقلاً ومرة واحدة فقط.',
    ordered: 'المطلوب', previously: 'المستلم سابقاً', remaining: 'المتبقي',
    partial: 'استلام جزئي — ستبقى الكميات المتبقية مفتوحة.',
    confirm: 'تأكيد الاستلام وتحديث المخزون', saving: 'جارٍ التحديث…',
    loading: 'جارٍ التحقق من الاستلام السابق…', cancel: 'إلغاء',
    noItems: 'أدخل كمية مستلمة واحدة على الأقل.',
    invalid: 'يجب أن تكون الكميات بين الصفر والكمية المتبقية لكل بند.',
    legacy: 'هذا الطلب لديه استلامات جزئية قديمة دون سجل موثوق؛ يجب مطابقة المشتريات السابقة أولاً.',
    uncertain: 'انقطع الاتصال. ربما تم الحفظ. أعد المحاولة بنفس الكميات لتفادي تكرار الشراء.',
    failure: 'لم يتم تأكيد الحفظ. راجع الخطأ وحاول مجدداً.',
    progressError: 'تعذر التحقق من الاستلام السابق، لذا تم إيقاف الإضافة لمنع التكرار.',
    PO_RECEIPT_INVALID_ORDER_STATUS: 'تغيّرت حالة الطلب، حدّث القائمة أولاً.',
    PO_RECEIPT_EXCEEDS_REMAINING_QUANTITY: 'تغيّرت الكمية المتبقية. أغلق الطلب وافتحه من جديد.',
    PO_RECEIPT_LEGACY_PARTIAL_RECONCILIATION_REQUIRED: 'يجب مطابقة الاستلامات الجزئية السابقة قبل التسجيل مجدداً.',
  },
  fa: {
    title: 'دریافت سفارش', date: 'تاریخ دریافت',
    description: 'مقداری را که واقعاً اکنون دریافت شده وارد کنید. هر ردیف جداگانه و فقط یک‌بار ثبت می‌شود.',
    ordered: 'سفارش', previously: 'دریافت قبلی', remaining: 'باقی‌مانده',
    partial: 'دریافت جزئی — مقدار باقی‌مانده باز می‌ماند.',
    confirm: 'تأیید دریافت و آپدیت موجودی', saving: 'در حال ثبت…',
    loading: 'بررسی دریافت‌های قبلی…', cancel: 'لغو',
    noItems: 'حداقل یک مقدار دریافت‌شده را وارد کنید.',
    invalid: 'مقدار هر ردیف باید بین صفر و مقدار باقی‌مانده باشد.',
    legacy: 'این سفارش دریافت جزئی قدیمی دارد که سوابق آن قابل تطبیق نیست؛ اول خریدهای قبلی را بررسی کنید.',
    uncertain: 'اتصال قطع شد؛ ممکن است ثبت انجام شده باشد. بدون تغییر مقدار دوباره امتحان کنید تا خرید تکراری نشود.',
    failure: 'ذخیره تأیید نشد. خطا را بررسی و دوباره امتحان کنید.',
    progressError: 'دریافت‌های قبلی قابل بررسی نیست؛ برای جلوگیری از تکرار، ثبت متوقف شد.',
    PO_RECEIPT_INVALID_ORDER_STATUS: 'وضعیت سفارش تغییر کرده؛ صفحه را تازه کنید.',
    PO_RECEIPT_EXCEEDS_REMAINING_QUANTITY: 'مقدار باقی‌مانده تغییر کرد؛ سفارش را ببندید و دوباره باز کنید.',
    PO_RECEIPT_LEGACY_PARTIAL_RECONCILIATION_REQUIRED: 'دریافت جزئی قبلی باید پیش از ثبت جدید تطبیق شود.',
  },
};

function parseOrderItems(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function ReceiveOrderDialog(props) {
  const { activeRestaurant } = useTenant();
  return isSupermarketProductPortal(activeRestaurant)
    ? <RetailReceiveOrder {...props} />
    : <LegacyReceiveOrder {...props} />;
}
function RetailReceiveOrder({ order, open, onClose }) {
  const ctx = useRetailInventory();
  const [document, setDocument] = useState(null);
  const [draft, setDraft] = useState(true);
  const createdRef = useRef(false);
  if (!open) return null;
  return <>{draft && <InventoryDocumentForm ctx={ctx} config={{ kind: 'receipt', order_id: order.id, branch_id: order.branch_id }} onCreated={(doc) => { createdRef.current = true; setDocument(doc); setDraft(false); }} onClose={() => { if (!createdRef.current) onClose(); }} />}{document && <InventoryDocumentDetail ctx={ctx} document={document} onClose={onClose} />}</>;
}
function LegacyReceiveOrder({ order, open, onClose }) {
  const { lang = 'en' } = useLanguage();
  const t = MESSAGES[lang] || MESSAGES.en;
  const queryClient = useQueryClient();
  const orderedItems = parseOrderItems(order?.items);
  const requestRef = useRef(null);
  const [receiveDate, setReceiveDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [progress, setProgress] = useState(null);
  const [receivedQtys, setReceivedQtys] = useState({});
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    if (!open || !order?.id) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoadingProgress(true);
    setError('');
    supabase.rpc('erp_purchase_order_receipt_progress', { p_order_id: order.id })
      .abortSignal(controller.signal).then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError) throw rpcError;
        setProgress(data);
        setReceivedQtys(Object.fromEntries((data?.lines || []).map(line => [line.line_index, String(line.remaining_qty)])));
        if (data?.legacy_partial) setError(t.legacy);
      }).catch((e) => {
        if (active) { setProgress(null); setError(e?.message || t.progressError); }
      }).finally(() => {
        clearTimeout(timeout);
        if (active) setLoadingProgress(false);
      });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, order?.id, t.legacy, t.progressError]);

  const changeQuantity = (index, value) => {
    requestRef.current = null;
    setError('');
    setReceivedQtys(prev => ({ ...prev, [index]: value }));
  };

  const handleReceive = async () => {
    if (loading || loadingProgress || !progress || progress.legacy_partial || uncertain) {
      // An uncertain request must be retried with its original immutable inputs.
      if (!uncertain) return;
    }
    const lines = progress?.lines || [];
    const invalid = !receiveDate || lines.length !== orderedItems.length || lines.some(line => {
      const raw = receivedQtys[line.line_index];
      const n = Number(raw);
      return raw === '' || !Number.isFinite(n) || n < 0 || n > Number(line.remaining_qty);
    });
    if (invalid) { setError(t.invalid); return; }
    const inputItems = lines.map(line => ({
      line_index: line.line_index, received_qty: Number(receivedQtys[line.line_index])
    }));
    if (!inputItems.some(item => item.received_qty > 0)) { setError(t.noItems); return; }
    if (!requestRef.current) requestRef.current = crypto.randomUUID();
    setError('');
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error: rpcError } = await supabase.rpc('erp_receive_purchase_order', {
        p_order_id: order.id,
        p_request_id: requestRef.current,
        p_receipt_date: receiveDate,
        p_items: inputItems,
      }).abortSignal(controller.signal);
      if (rpcError) throw rpcError;
      if (!data?.receipt_id) throw new Error(t.failure);
      setUncertain(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchase_orders'] }),
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      onClose();
    } catch (e) {
      const timedOut = controller.signal.aborted || e?.name === 'AbortError' || e?.message?.includes('Failed to fetch');
      if (timedOut) {
        setUncertain(true);
        setError(t.uncertain);
      } else {
        setError(t[e?.message] || e?.message || t.failure);
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const disabled = loading || loadingProgress || !progress || progress.legacy_partial;
  const isPartial = (progress?.lines || []).some(line =>
    Number(receivedQtys[line.line_index] || 0) < Number(line.remaining_qty));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">
          <PackageCheck className="w-5 h-5" /> {t.title}
        </DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{t.date}</Label>
            <Input type="date" value={receiveDate} disabled={loading || uncertain}
              onChange={e => { requestRef.current = null; setReceiveDate(e.target.value); }} />
          </div>
          <p className="text-sm text-muted-foreground">{t.description}</p>
          {loadingProgress && <p role="status" className="text-sm">{t.loading}</p>}
          {!loadingProgress && <div className="space-y-2 max-h-72 overflow-y-auto">
            {orderedItems.map((item, index) => {
              const line = progress?.lines?.find(x => x.line_index === index);
              return <div key={index} className="flex items-center gap-3 p-3 border rounded-xl min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold break-words">{item.product_name || item.name || item.product_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.ordered}: {item.qty} {item.unit || ''}
                  </p>
                  {line && <p className="text-xs text-muted-foreground">
                    {t.previously}: {line.received_qty} · {t.remaining}: {line.remaining_qty}
                  </p>}
                </div>
                <div className="w-24 shrink-0">
                  <Input type="number" inputMode="decimal" min="0" max={line?.remaining_qty}
                    step="any" className="text-center" aria-label={`${item.product_name || 'Item'} ${index + 1}`}
                    disabled={disabled || uncertain} value={receivedQtys[index] ?? ''}
                    onChange={e => changeQuantity(index, e.target.value)} />
                </div>
              </div>;
            })}
          </div>}
          {progress && !progress.legacy_partial && isPartial && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <Badge className="bg-amber-100 text-amber-800">Partial</Badge>{t.partial}
            </div>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 break-words">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 min-h-11" onClick={handleReceive} disabled={disabled}>
              {loading ? t.saving : t.confirm}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={onClose} disabled={loading}>{t.cancel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
