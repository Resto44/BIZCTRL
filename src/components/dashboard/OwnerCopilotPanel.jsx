import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronLeft,
  CircleAlert,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { ERP_NAV_GROUPS } from '@/components/layout/ERPSidebar';
import { Button } from '@/components/ui/button';

const COPY = {
  en: {
    title: 'AI Copilot',
    subtitle: 'Ask anything about your business or BizCTRL.',
    empty: 'How can I help you?',
    placeholder: 'Ask about your business or BizCTRL…',
    send: 'Send',
    newConversation: 'New conversation',
    clear: 'Clear conversation',
    close: 'Close AI Copilot',
    unavailable: 'AI Copilot temporarily unavailable.',
    confirm: 'Confirm & Create',
    cancel: 'Cancel',
    history: 'History',
    noHistory: 'No saved conversations yet.',
    thinking: 'Checking authorized ERP records…',
    allBranches: 'All authorized branches',
    expensePreview: 'Expense draft — nothing has been saved yet',
    amount: 'Amount',
    branch: 'Branch',
    description: 'Description',
    confirmationCreated: 'Expense saved after your confirmation',
    confirmationCancelled: 'Draft cancelled; no expense was created.',
    serviceSetup: 'AI service is not configured. The administrator must configure a supported model API key on the server.',
    serviceLimited: 'AI provider is currently unavailable. Check provider status and try again.',
    notAuthorized: 'Your organization or selected branch access could not be verified.',
    notEnoughData: 'I could not read authorized records for this question.',
    rateLimited: 'The AI provider is rate limited. Try again later.',
    historyLabel: 'Conversation history',
  },
  ar: {
    title: 'مساعد الذكاء الاصطناعي',
    subtitle: 'اسأل أي شيء عن عملك أو BizCTRL.',
    empty: 'كيف يمكنني مساعدتك؟',
    placeholder: 'اسأل عن عملك أو BizCTRL…',
    send: 'إرسال',
    newConversation: 'محادثة جديدة',
    clear: 'مسح المحادثة',
    close: 'إغلاق مساعد الذكاء الاصطناعي',
    unavailable: 'مساعد الذكاء الاصطناعي غير متاح مؤقتًا.',
    confirm: 'تأكيد وإنشاء',
    cancel: 'إلغاء',
    history: 'المحادثات السابقة',
    noHistory: 'لا توجد محادثات محفوظة بعد.',
    thinking: 'أراجع بيانات ERP المصرح بها…',
    allBranches: 'كل الفروع المصرح بها',
    expensePreview: 'مسودة مصروف — لم يُحفظ شيء بعد',
    amount: 'المبلغ',
    branch: 'الفرع',
    description: 'الوصف',
    confirmationCreated: 'تم حفظ المصروف بعد موافقتك',
    confirmationCancelled: 'أُلغيت المسودة ولم يُنشأ مصروف.',
    serviceSetup: 'خدمة الذكاء الاصطناعي غير مهيأة. يجب أن يضبط المسؤول مفتاح خدمة النموذج على الخادم.',
    serviceLimited: 'مزود الذكاء الاصطناعي غير متاح حالياً. تحقق من حالة الخدمة وحاول مجدداً.',
    notAuthorized: 'تعذر التحقق من صلاحية المنشأة أو الفرع المحدد.',
    notEnoughData: 'تعذر قراءة السجلات المصرح بها لهذا السؤال.',
    rateLimited: 'بلغت خدمة الذكاء الاصطناعي حد الطلبات. حاول لاحقاً.',
    historyLabel: 'سجل المحادثات',
  },
  fa: {
    title: 'دستیار هوش مصنوعی',
    subtitle: 'هر سوالی درباره کسب‌وکار یا BizCTRL بپرسید.',
    empty: 'چگونه می‌توانم کمک کنم؟',
    placeholder: 'درباره کسب‌وکار یا BizCTRL بپرسید…',
    send: 'ارسال',
    newConversation: 'گفتگوی جدید',
    clear: 'پاک‌کردن گفتگو',
    close: 'بستن دستیار هوش مصنوعی',
    unavailable: 'دستیار هوش مصنوعی موقتاً در دسترس نیست.',
    confirm: 'تأیید و ایجاد',
    cancel: 'لغو',
    history: 'تاریخچه گفتگو',
    noHistory: 'هنوز گفتگویی ذخیره نشده است.',
    thinking: 'در حال بررسی داده‌های مجاز ERP…',
    allBranches: 'تمام شعبه‌های مجاز',
    expensePreview: 'پیش‌نویس مصرف — هنوز هیچ چیز ذخیره نشده است',
    amount: 'مبلغ',
    branch: 'شعبه',
    description: 'توضیحات',
    confirmationCreated: 'مصرف پس از تأیید شما ذخیره شد',
    confirmationCancelled: 'پیش‌نویس لغو شد؛ مصرفی ثبت نشد.',
    serviceSetup: 'سرویس AI تنظیم نشده است. مدیر سیستم باید کلید API مدل را در سرور تنظیم کند.',
    serviceLimited: 'سرویس AI فعلاً در دسترس نیست. وضعیت ارائه‌دهنده را بررسی و دوباره تلاش کنید.',
    notAuthorized: 'دسترسی کسب‌وکار یا شعبه انتخاب‌شده قابل تأیید نیست.',
    notEnoughData: 'رکوردهای مجاز برای پاسخ به این سوال قابل خواندن نبود.',
    rateLimited: 'سرویس AI به محدودیت درخواست رسیده است. بعداً تلاش کنید.',
    historyLabel: 'تاریخچه گفتگو',
  },
};

const SUGGESTIONS = {
  en: [
    'Give me today’s business summary',
    'How are my sales today?',
    'Which branch is performing best?',
    'What are my biggest expenses this month?',
    'Show my unpaid customer debt',
    'How do I add an expense?',
    'Why can’t I access this module?',
    'Which items are below the stock threshold?',
    'Summarize purchases this month',
    'Which supplier invoices remain unpaid?',
    "Why won't inventory save in Branch Manager?",
    'How does Wallet approval work?',
  ],
  ar: [
    'أعطني ملخص أعمال اليوم',
    'كيف هي مبيعاتي اليوم؟',
    'أي فرع يحقق أفضل أداء؟',
    'ما أكبر مصروفاتي هذا الشهر؟',
    'أظهر ديون العملاء غير المسددة',
    'كيف أضيف مصروفًا؟',
    'ما الأصناف الأقل من حد المخزون؟',
    'لخّص مشتريات هذا الشهر',
    'ما فواتير الموردين غير المسددة؟',
    'لماذا لا يحفظ المخزون عند مدير الفرع؟',
    'كيف تتم الموافقة على تحويل المحفظة؟',
  ],
  fa: [
    'خلاصه کسب‌وکار امروز را نشان بده',
    'فروش امروز من چگونه است؟',
    'کدام شعبه بهترین عملکرد را دارد؟',
    'بزرگ‌ترین هزینه‌های این ماه چیست؟',
    'بدهی پرداخت‌نشده مشتریان را نشان بده',
    'چگونه هزینه اضافه کنم؟',
    'کدام محصولات کمبود موجودی دارند؟',
    'خریدهای این ماه را خلاصه کن',
    'کدام فاکتورهای سپلایر پرداخت نشده‌اند؟',
    'چرا انبار در Branch Manager ذخیره نمی‌شود؟',
    'تأیید معامله والت چگونه است؟',
  ],
};

const QUICK_ACTIONS = [
  { key: 'sale', label: { en: 'Sales', ar: 'المبيعات', fa: 'فروشات' }, path: '/sales' },
  { key: 'purchase', label: { en: 'Purchases', ar: 'المشتريات', fa: 'خریدها' }, path: '/enterprise-purchases' },
  { key: 'expense', label: { en: 'Expenses', ar: 'المصروفات', fa: 'مصارف' }, path: '/expenses' },
  { key: 'inventory', label: { en: 'Inventory', ar: 'المخزون', fa: 'انبار' }, path: '/inventory' },
  { key: 'suppliers', label: { en: 'Suppliers', ar: 'الموردون', fa: 'سپلایرها' }, path: '/suppliers' },
  { key: 'wallet', label: { en: 'Wallet', ar: 'المحفظة', fa: 'والت' }, path: '/sponsor-treasury' },
  { key: 'help', label: { en: 'Help Center', ar: 'مركز المساعدة', fa: 'مرکز راهنما' }, path: '/help' },
];

function asErrorMessage(error, copy) {
  const value = String(error?.message || error?.error || error?.context?.error || '');
  if (value.includes('AI_COPILOT_PROVIDER_NOT_CONFIGURED') || value.includes('AI_COPILOT_PROVIDER_UNSUPPORTED')) return copy.serviceSetup;
  if (value.includes('AI_COPILOT_PROVIDER_RATE_LIMITED') || value.includes('AI_COPILOT_RATE_LIMITED')) return copy.rateLimited;
  if (value.includes('AI_COPILOT_PROVIDER_UNAVAILABLE') || value.includes('AI_COPILOT_PROVIDER_AUTH_FAILED')) return copy.serviceLimited;
  if (value.includes('AUTHORIZED_DATA_UNAVAILABLE')) return copy.notEnoughData;
  if (value.includes('TENANT_SCOPE_DENIED') || value.includes('BRANCH_SCOPE_DENIED')) return copy.notAuthorized;
  return copy.unavailable;
}

async function copilotError(error, copy) {
  if (error?.context?.json) {
    try {
      const detail = await error.context.json();
      if (detail?.error) return asErrorMessage(detail, copy);
    } catch { /* The provider did not return readable JSON. */ }
  }
  return asErrorMessage(error, copy);
}

export default function OwnerCopilotPanel({
  open,
  onOpenChange,
  restaurantId,
  selectedBranchId,
  selectedBranchLabel,
  role,
  can,
  currency,
  lang = 'en',
  userId,
}) {
  const navigate = useNavigate();
  const copy = COPY[lang] || COPY.en;
  const dir = lang === 'ar' || lang === 'fa' ? 'rtl' : 'ltr';
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [processingActionId, setProcessingActionId] = useState(null);
  const endRef = useRef(null);

  const availableModules = useMemo(
    () => ERP_NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => !item.permission || can?.[item.permission])
      .map(({ label, path, permission }) => ({ label, path, permission })),
    [can],
  );
  const suggestions = useMemo(() => {
    const base = SUGGESTIONS[lang] || SUGGESTIONS.en;
    return base.filter((question) => !/branch/i.test(question) || role === 'owner' || can?.viewReports);
  }, [can?.viewReports, lang, role]);

  useEffect(() => {
    if (!open || !restaurantId || !userId) return;
    let active = true;
    supabase
      .from('copilot_conversations')
      .select('id, title, last_message_at')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active) setHistory(data || []);
      });
    return () => { active = false; };
  }, [open, restaurantId, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading]);

  const loadConversation = async (id) => {
    if (!id || !restaurantId || !userId) return;
    const { data, error: loadError } = await supabase
      .from('copilot_messages')
      .select('id, role, content, metadata, created_at')
      .eq('conversation_id', id)
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (loadError) {
      setError(asErrorMessage(loadError, copy));
      return;
    }
    setConversationId(id);
    setMessages((data || []).map((item) => ({ ...item, kind: 'message' })));
    setShowHistory(false);
  };

  const clearConversation = async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const { error: clearError } = await supabase
      .from('copilot_messages')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId);
    if (clearError) {
      setError(asErrorMessage(clearError, copy));
      return;
    }
    setMessages([]);
    setConversationId(null);
  };

  const submit = async (question = input) => {
    const message = String(question || '').trim();
    if (!message || loading || !restaurantId) return;
    const localId = `local-${Date.now()}`;
    setMessages((current) => [...current, { id: localId, role: 'user', content: message, kind: 'message' }]);
    setInput('');
    setError(null);
    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke('owner-copilot', {
      body: {
        operation: 'chat',
        conversationId,
        message,
        restaurantId,
        selectedBranchId,
        language: lang,
        availableModules,
      },
    });
    setLoading(false);
    if (invokeError || data?.error) {
      setError(await copilotError(invokeError || data, copy));
      return;
    }
    setConversationId(data.conversation_id || conversationId);
    const assistant = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: data.message || copy.unavailable,
      kind: 'message',
    };
    const requests = (data.action_requests || []).map((action) => ({
      id: `action-${action.action_request_id}`,
      role: 'assistant',
      content: action.message,
      action,
      kind: 'action',
    }));
    setMessages((current) => [...current, assistant, ...requests]);
    if (data.conversation_id) {
      setHistory((current) => [{ id: data.conversation_id, title: message.slice(0, 80), last_message_at: new Date().toISOString() }, ...current.filter((item) => item.id !== data.conversation_id)].slice(0, 10));
    }
  };

  const decideAction = async (actionRequestId, decision) => {
    if (!actionRequestId || processingActionId) return;
    setProcessingActionId(actionRequestId);
    const { data, error: invokeError } = await supabase.functions.invoke('owner-copilot', {
      body: {
        operation: 'confirm_action',
        actionRequestId,
        decision,
        restaurantId,
        selectedBranchId,
        language: lang,
        availableModules,
      },
    });
    setProcessingActionId(null);
    if (invokeError || data?.error) {
      setError(await copilotError(invokeError || data, copy));
      return;
    }
    const confirmation = decision === 'confirm'
      ? `${copy.confirmationCreated}: ${Number(data?.expense?.amount || 0).toLocaleString()} ${currency} — ${data?.expense?.description || ''}`
      : copy.confirmationCancelled;
    setMessages((current) => [...current, { id: `decision-${Date.now()}`, role: 'assistant', content: confirmation, kind: 'message' }]);
  };

  const leaveToAction = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex min-w-0 w-full max-w-full overflow-hidden box-border" dir={dir} role="dialog" aria-modal="true" aria-label={copy.title}>
      <button type="button" className="hidden flex-1 bg-black/40 md:block" aria-label={copy.close} onClick={() => onOpenChange(false)} />
      <section className="flex h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden border-border bg-card shadow-2xl box-border md:ms-auto md:max-w-xl md:border-s" aria-live="polite">
        <header className="flex min-w-0 max-w-full shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-card px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-black text-foreground">{copy.title}</h2>
            <p className="truncate text-xs text-muted-foreground">{selectedBranchLabel || copy.allBranches} · {copy.subtitle}</p>
          </div>
          <Button variant="ghost" size="icon" type="button" className="h-10 w-10 shrink-0" aria-label={copy.newConversation} onClick={() => { setConversationId(null); setMessages([]); setError(null); }}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" type="button" className="h-10 w-10 shrink-0" aria-label={copy.close} onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-border px-2 py-2 sm:gap-2 sm:px-3 md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:none]">
          <Button variant="outline" size="sm" type="button" className="h-auto min-h-8 max-w-full min-w-0 shrink whitespace-normal px-2 py-1 text-center text-[11px] leading-tight md:h-8 md:shrink-0 md:whitespace-nowrap md:px-3 md:py-0 md:text-xs" onClick={() => setShowHistory((current) => !current)}>
            <ChevronLeft className={`me-1 h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-[-90deg]' : 'rotate-0'}`} /> {copy.history}
          </Button>
          <Button variant="ghost" size="sm" type="button" className="h-auto min-h-8 max-w-full min-w-0 shrink whitespace-normal px-2 py-1 text-center text-[11px] leading-tight md:h-8 md:shrink-0 md:whitespace-nowrap md:px-3 md:py-0 md:text-xs" onClick={clearConversation} disabled={!messages.length}>
            <Trash2 className="me-1 h-3.5 w-3.5" /> {copy.clear}
          </Button>
          {QUICK_ACTIONS.map((action) => (
            <Button key={action.path} variant="outline" size="sm" type="button" className="h-auto min-h-8 max-w-full min-w-0 shrink whitespace-normal px-2 py-1 text-center text-[11px] leading-tight md:h-8 md:shrink-0 md:whitespace-nowrap md:px-3 md:py-0 md:text-xs" onClick={() => leaveToAction(action.path)}>
              {action.label[lang] || action.label.en}
            </Button>
          ))}
        </div>

        {showHistory && (
          <div className="max-h-36 min-w-0 max-w-full shrink-0 overflow-y-auto border-b border-border bg-muted/30 p-2">
            {history.length ? history.map((item) => (
              <button key={item.id} type="button" className="block w-full truncate rounded-md px-3 py-2 text-start text-xs font-medium text-foreground hover:bg-muted" onClick={() => loadConversation(item.id)}>
                {item.title}
              </button>
            )) : <p className="px-3 py-2 text-xs text-muted-foreground">{copy.noHistory}</p>}
          </div>
        )}

          <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overscroll-contain px-3 py-5 pb-28 sm:px-4">
          {!messages.length && (
            <div className="mx-auto flex w-full min-w-0 max-w-md flex-col items-center py-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Bot className="h-7 w-7" /></div>
              <h3 className="text-lg font-black text-foreground">{copy.empty}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
              <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
                {suggestions.map((question) => (
                  <button key={question} type="button" className="max-w-full break-words rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted" onClick={() => submit(question)}>
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-3">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'ms-auto min-w-0 max-w-[88%] sm:max-w-[92%]' : 'me-auto min-w-0 max-w-[92%] sm:max-w-[96%]'}>
                <div className={message.role === 'user' ? 'min-w-0 break-words [overflow-wrap:anywhere] rounded-2xl rounded-se-sm bg-primary px-3 py-2 text-sm text-primary-foreground' : 'min-w-0 break-words [overflow-wrap:anywhere] rounded-2xl rounded-ss-sm border border-border bg-muted/50 px-3 py-2 text-sm leading-6 text-foreground'}>
                  {message.content}
                </div>
                {message.kind === 'action' && message.action && (
                  <div className="mt-2 min-w-0 max-w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-bold">{copy.expensePreview}</p>
                    <dl className="mt-2 grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
                      <dt className="text-amber-700 dark:text-amber-300">{copy.amount}</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{currency}{Number(message.action.payload?.amount || 0).toLocaleString()}</dd>
                      <dt className="text-amber-700 dark:text-amber-300">{copy.branch}</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{message.action.payload?.branch_key}</dd>
                      <dt className="text-amber-700 dark:text-amber-300">{copy.description}</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{message.action.payload?.description}</dd>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" type="button" variant="outline" onClick={() => decideAction(message.action.action_request_id, 'cancel')} disabled={processingActionId === message.action.action_request_id}>{copy.cancel}</Button>
                      <Button size="sm" type="button" onClick={() => decideAction(message.action.action_request_id, 'confirm')} disabled={processingActionId === message.action.action_request_id}>
                        {processingActionId === message.action.action_request_id && <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />}{copy.confirm}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="me-auto flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /> <span className="min-w-0 break-words">{copy.thinking}</span></div>}
            {error && <div className="flex min-w-0 max-w-full items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0 break-words [overflow-wrap:anywhere]">{error}</span></div>}
            <div ref={endRef} />
          </div>
        </main>

        <form className="w-full min-w-0 max-w-full shrink-0 border-t border-border bg-card p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] box-border sm:p-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="flex min-w-0 max-w-full items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={1} maxLength={4000} className="min-w-0 w-full max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" placeholder={copy.placeholder} aria-label={copy.placeholder} />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!input.trim() || loading} aria-label={copy.send}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
