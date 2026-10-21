import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import HelpCenter, { HELP_COPY } from '@/components/help/HelpCenter';
import { useAuth } from '@/lib/AuthContext';
import { ROLE_HOME } from '@/lib/RoleContext';

export default function Help() {
  const { lang, dir } = useLanguage();
  const { user } = useAuth();
  const dashboardPath = user?.role ? ROLE_HOME[user.role] : null;
  const c = HELP_COPY[lang] || HELP_COPY.en;
  return <main dir={dir} className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h1 className="text-xl font-bold">BizCTRL</h1><LanguageSwitcher /><nav className="flex flex-wrap gap-3 text-sm">{dashboardPath ? <Link to={dashboardPath} className="min-h-11 rounded-lg border px-3 py-2 font-semibold text-primary">{lang === 'fa' ? 'برگشت به داشبورد' : lang === 'ar' ? 'العودة للوحة التحكم' : 'Back to Dashboard'}</Link> : <Link to="/erp-login" className="min-h-11 rounded-lg border px-3 py-2 text-primary">{c.home}</Link>}<Link to="/support?tab=guides" className="min-h-11 rounded-lg border px-3 py-2 text-primary">{lang === 'fa' ? 'برگشت به مرکز راهنما' : lang === 'ar' ? 'العودة لمركز المساعدة' : 'Back to Help Center'}</Link></nav></header>
      <HelpCenter dashboardPath={dashboardPath} />
    </div>
  </main>;
}
