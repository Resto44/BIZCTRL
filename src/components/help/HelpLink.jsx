import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
export default function HelpLink({ guide }) {
  const { lang } = useLanguage();
  const location = useLocation();
  // Sign-in and Platform Owner are not inside the standard ERP workspace.
  // Other portal users should keep their navigation and bottom bar in Support.
  const standalone = /^\/(?:erp-login|erp-register|platform-owner)(?:\/|$)/.test(location.pathname);
  const to = standalone ? `/help${guide ? `?guide=${encodeURIComponent(guide)}` : ''}`
    : `/support?tab=guides${guide ? `&guide=${encodeURIComponent(guide)}` : ''}`;
  const label = lang === 'fa' ? 'راهنما' : lang === 'ar' ? 'المساعدة' : 'Help';
  return <Link to={to} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium hover:underline"><BookOpen className="h-4 w-4" aria-hidden="true" />{label}</Link>;
}
