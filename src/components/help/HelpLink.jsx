import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
export default function HelpLink({ guide }) {
  const { lang } = useLanguage();
  const label = lang === 'fa' ? 'راهنما' : lang === 'ar' ? 'المساعدة' : 'Help';
  return <Link to={guide ? `/help?guide=${guide}` : '/help'} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium hover:underline"><BookOpen className="h-4 w-4" aria-hidden="true" />{label}</Link>;
}
