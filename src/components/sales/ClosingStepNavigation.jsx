import React from 'react';

export const closingStepCopy = {
  fa: { steps: ['فروش', 'صندوق', 'تأیید'], next: ['ادامه به شمارش صندوق', 'ادامه به تأیید'], back: 'برگشت', title: 'مراحل بستن شیفت' },
  ar: { steps: ['المبيعات', 'الصندوق', 'التأكيد'], next: ['متابعة لعدّ النقد', 'متابعة للتأكيد'], back: 'رجوع', title: 'خطوات إقفال الوردية' },
  en: { steps: ['Sales', 'Cash count', 'Review'], next: ['Continue to cash count', 'Continue to review'], back: 'Back', title: 'Closing steps' },
};

// Navigation never posts money. Final posting still uses the existing server
// validations and a separate explicit confirmation.
export function closingStepIssues(step, validations) {
  const keys = step === 0
    ? ['cashier', 'branch', 'shift', 'pos', 'credit', 'cash', 'creditLimit']
    : step === 1 ? ['erpData', 'cashBalance'] : [];
  return validations.filter(item => keys.includes(item.key) && !item.passed);
}

export default function ClosingStepNavigation({ step, onChange, disabled, lang = 'en' }) {
  const copy = closingStepCopy[lang] || closingStepCopy.en;
  return <nav aria-label={copy.title} data-testid="closing-workflow-stepper" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'} className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-2">
    {copy.steps.map((label, index) => <button key={label} type="button" disabled={disabled || index > step + 1} aria-current={index === step ? 'step' : undefined} onClick={() => onChange(index)} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 ${index === step ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
      <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-full ${index === step ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{index + 1}</span><span>{label}</span>
    </button>)}
  </nav>;
}
