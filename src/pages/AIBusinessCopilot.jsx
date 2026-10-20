/**
 * Authenticated ERP Copilot route.
 * The old local, sample-data chat was removed in favor of the same JWT-scoped
 * Edge Function and RLS-backed chat used by the Owner quick action.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import OwnerCopilotPanel from '@/components/dashboard/OwnerCopilotPanel';

const copy = {
  en: { loading: 'Checking your authorized business and wallet-free ERP scope…', unavailable: 'Select an authorized business before opening the AI Copilot.' },
  ar: { loading: 'جارٍ التحقق من المؤسسة والصلاحيات المصرح بها…', unavailable: 'اختر منشأة مصرحاً بها قبل فتح المساعد الذكي.' },
  fa: { loading: 'در حال بررسی کسب‌وکار و صلاحیت‌های مجاز…', unavailable: 'پیش از بازکردن کاپلوت، کسب‌وکار مجاز را انتخاب کنید.' },
};

export default function AIBusinessCopilot() {
  const navigate = useNavigate();
  const { lang, currency } = useLanguage();
  const { user } = useAuth();
  const { activeRestaurant, loadingRestaurants } = useTenant();
  const { role, can } = useRole();
  const { selectedBranchId, selectedBranchLabel, isAllBranches } = useBranchScope();
  const [open, setOpen] = useState(true);
  const t = copy[lang] || copy.en;
  const goHome = () => {
    setOpen(false);
    navigate(role === 'owner' ? '/owner-command-center' : role === 'manager' ? '/manager-dashboard' : '/dashboard', { replace: true });
  };

  if (loadingRestaurants || !user) return <div className="p-6 text-sm" role="status">{t.loading}</div>;
  if (!activeRestaurant?.id) return <div className="p-6 text-sm" role="alert">{t.unavailable}</div>;

  return (
    <main data-testid="erp-authenticated-copilot" className="min-h-[50dvh]">
      <OwnerCopilotPanel open={open} onOpenChange={(next) => { if (!next) goHome(); }}
        restaurantId={activeRestaurant.id} selectedBranchId={isAllBranches ? 'all' : selectedBranchId}
        selectedBranchLabel={selectedBranchLabel} role={role} can={can}
        currency={currency} lang={lang} userId={user.id} />
    </main>
  );
}
