import React from 'react';
import {ArrowLeftRight,BookOpen,HandCoins,Landmark,ShieldCheck,UserRound} from 'lucide-react';

const translations={
 en:{title:'Account operations',subtitle:'Choose the real financial workflow — not every transaction is a loan.',account:'Selected account',custody:'Business custody transfer',custodyText:'Review a handover or return request from this person. Once approved, Treasury and custody receive linked entries.',advance:'Personal advance / repayment',advanceText:'Record an actual loan or repayment already completed. Not an ordinary wallet transfer.',statement:'View account activity',statementText:'Inspect this person’s loan ledger and custody records separately.',notice:'No external bank payment is initiated. A custody request must be submitted by the person and approved by the owner; loan entries require confirmation that the funds already moved.',unlinked:'No account selected',restricted:'Personal advances are disabled for this account.'},
 ar:{title:'عمليات الحساب',subtitle:'اختر العملية المالية الصحيحة؛ ليست كل معاملة قرضاً.',account:'الحساب المختار',custody:'تحويل عهدة المنشأة',custodyText:'راجع طلب استلام أو إعادة عهدة هذا الشخص. عند الاعتماد تُربط حركتا الخزينة والعهدة.',advance:'سلفة شخصية / سداد',advanceText:'سجّل سلفة أو سداداً تم تنفيذه بالفعل، وليس تحويلاً عادياً للمحفظة.',statement:'عرض حركة الحساب',statementText:'راجع دفتر السلف والعهدة لهذا الشخص دون خلط الأرصدة.',notice:'لا يتم إرسال أي مبلغ من بنك خارجي. يقدم الشخص طلب العهدة ثم يعتمده المالك، ولا تُسجل السلفة إلا بعد حدوث الدفع فعلاً.',unlinked:'لم يتم تحديد حساب',restricted:'السلف الشخصية معطلة لهذا الحساب.'},
 fa:{title:'عملیات حساب',subtitle:'نوع معامله واقعی را انتخاب کنید؛ هر انتقال پول قرض نیست.',account:'حساب انتخاب‌شده',custody:'انتقال پول امانی کسب‌وکار',custodyText:'درخواست تحویل یا برگشت پول این شخص را بررسی کنید. پس از تأیید، حرکت خزانه و امانت به هم متصل می‌شوند.',advance:'قرض شخصی / بازپرداخت',advanceText:'فقط قرض یا بازپرداختی را ثبت کنید که واقعاً انجام شده؛ این انتقال عادی والت نیست.',statement:'مشاهده گردش حساب',statementText:'سوابق قرض و امانت این شخص را بدون مخلوط‌کردن مانده‌ها بررسی کنید.',notice:'هیچ پولی از بانک بیرونی انتقال داده نمی‌شود. درخواست امانت ابتدا توسط خود شخص ثبت و سپس از طرف اونر تأیید می‌شود؛ قرض فقط بعد از پرداخت واقعی ثبت می‌گردد.',unlinked:'هیچ حسابی انتخاب نشده',restricted:'قرض شخصی برای این حساب غیرفعال است.'},
};
export default function OwnerWalletOperations({partner,lang='en',onCustody,onAdvance,onStatement}){
 const t=translations[lang]||translations.en;
 const actions=[
  {key:'custody',Icon:ArrowLeftRight,style:'border-emerald-200 bg-emerald-50/80 text-emerald-800',iconStyle:'bg-emerald-100',onClick:onCustody,disabled:!partner},
  {key:'advance',Icon:HandCoins,style:'border-amber-200 bg-amber-50/80 text-amber-900',iconStyle:'bg-amber-100',onClick:onAdvance,disabled:!partner||!partner.is_active||partner.allow_loans===false},
  {key:'statement',Icon:BookOpen,style:'border-blue-200 bg-blue-50/80 text-blue-800',iconStyle:'bg-blue-100',onClick:onStatement,disabled:!partner}
 ];
 return <section aria-label={t.title} className="min-w-0 space-y-3 rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
  <header className="space-y-1"><h3 className="flex items-center gap-2 text-lg font-black text-slate-950"><Landmark className="size-5 shrink-0 text-blue-600"/>{t.title}</h3>
   <p className="text-xs leading-5 text-slate-600">{t.subtitle}</p>
   <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700"><UserRound className="size-4"/>{t.account}: <span dir="auto" className="break-words font-black">{partner?.name||t.unlinked}</span></p></header>
  <div className="grid gap-2.5 md:grid-cols-3">
   {actions.map(a=><button key={a.key} type="button" onClick={a.onClick} disabled={a.disabled} className={'group flex min-h-32 min-w-0 flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 '+a.style}>
     <span className={'grid size-10 shrink-0 place-items-center rounded-xl '+a.iconStyle}><a.Icon className="size-5"/></span>
     <strong className="break-words text-sm font-black">{t[a.key]}</strong>
     <span className="text-xs leading-5">{t[a.key+'Text']}</span>
    </button>)}
  </div>
  <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{t.notice}</p>
  {partner&&partner.allow_loans===false&&<p className="text-xs text-amber-700">{t.restricted}</p>}
 </section>;
}
