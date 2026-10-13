import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import HelpCenter, { HELP_COPY } from '@/components/help/HelpCenter';

export default function Help() {
  const { lang, dir } = useLanguage();
  const c = HELP_COPY[lang] || HELP_COPY.en;
  return <main dir={dir} className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h1 className="text-xl font-bold">BizCTRL</h1><LanguageSwitcher /><nav className="flex flex-wrap gap-4 text-sm"><Link to="/erp-login" className="text-primary underline">{c.home}</Link><Link to="/support?tab=tickets" className="text-primary underline">{c.support}</Link></nav></header>
      <HelpCenter />
    </div>
  </main>;
}
