import React from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

const COPY = {
  en: {
    eyebrow: 'Video Tutorials',
    title: 'Learn BizCTRL on the platform you already use',
    description: 'Watch short step-by-step tutorials for sales, POS, inventory, reports and daily operations.',
    open: 'Watch tutorials',
    soon: 'Coming soon',
    pending: 'Official channel link pending',
  },
  ar: {
    eyebrow: 'فيديوهات تعليمية',
    title: 'تعلّم BizCTRL على المنصة التي تستخدمها',
    description: 'شاهد شروحات قصيرة خطوة بخطوة للمبيعات ونقاط البيع والمخزون والتقارير والعمليات اليومية.',
    open: 'مشاهدة الشروحات',
    soon: 'قريباً',
    pending: 'رابط القناة الرسمية قيد الإضافة',
  },
  fa: {
    eyebrow: 'ویدیوهای آموزشی',
    title: 'BizCTRL را در شبکه‌ای که استفاده می‌کنی یاد بگیر',
    description: 'آموزش‌های کوتاه و مرحله‌به‌مرحله برای فروش، POS، موجودی، گزارش‌ها و کارهای روزانه را ببین.',
    open: 'تماشای آموزش‌ها',
    soon: 'به‌زودی',
    pending: 'لینک رسمی کانال هنوز اضافه نشده',
  },
};

const SOCIALS = [
  { key: 'facebook', label: 'Facebook', mark: 'f', env: 'VITE_SOCIAL_FACEBOOK_URL', tone: 'from-blue-600 to-blue-500' },
  { key: 'youtube', label: 'YouTube', mark: '▶', env: 'VITE_SOCIAL_YOUTUBE_URL', tone: 'from-red-600 to-red-500' },
  { key: 'snapchat', label: 'Snapchat', mark: 'S', env: 'VITE_SOCIAL_SNAPCHAT_URL', tone: 'from-yellow-300 to-yellow-200', markClass: 'text-slate-950' },
  { key: 'instagram', label: 'Instagram', mark: '◎', env: 'VITE_SOCIAL_INSTAGRAM_URL', tone: 'from-fuchsia-600 via-rose-500 to-amber-400' },
  { key: 'tiktok', label: 'TikTok', mark: '♪', env: 'VITE_SOCIAL_TIKTOK_URL', fallback: 'https://www.tiktok.com/@bizctrl26', tone: 'from-slate-950 via-slate-900 to-cyan-500' },
];

function safeSocialUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export default function SocialTutorialLinks({ theme = 'light', className = '' }) {
  const { lang } = useLanguage();
  const copy = COPY[lang] || COPY.en;
  const dark = theme === 'dark';

  return (
    <section
      aria-labelledby="social-tutorials-title"
      className={`rounded-3xl border p-5 sm:p-7 ${dark ? 'border-white/10 bg-white/[0.04]' : 'border-border bg-card'} ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className={`text-xs font-black uppercase tracking-[0.18em] ${dark ? 'text-cyan-300' : 'text-primary'}`}>{copy.eyebrow}</p>
          <h2 id="social-tutorials-title" className={`mt-2 text-2xl font-black tracking-tight sm:text-3xl ${dark ? 'text-white' : 'text-foreground'}`}>{copy.title}</h2>
          <p className={`mt-3 text-sm leading-6 ${dark ? 'text-slate-300' : 'text-muted-foreground'}`}>{copy.description}</p>
        </div>
        <PlayCircle className={`h-9 w-9 shrink-0 ${dark ? 'text-cyan-300' : 'text-primary'}`} aria-hidden="true" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {SOCIALS.map((social) => {
          const configured = safeSocialUrl(import.meta.env?.[social.env] || social.fallback);
          const cardClass = `group min-w-0 rounded-2xl border p-3.5 transition ${dark ? 'border-white/10 bg-slate-950/45' : 'border-border bg-background'}`;
          const inner = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${social.tone} text-lg font-black text-white shadow-sm ${social.markClass || ''}`} aria-hidden="true">{social.mark}</span>
                {configured ? <ExternalLink className={`h-4 w-4 shrink-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${dark ? 'text-slate-400' : 'text-muted-foreground'}`} /> : <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${dark ? 'bg-white/10 text-slate-300' : 'bg-muted text-muted-foreground'}`}>{copy.soon}</span>}
              </div>
              <p className={`mt-3 font-black ${dark ? 'text-white' : 'text-foreground'}`}>{social.label}</p>
              <p className={`mt-1 text-xs leading-5 ${configured ? (dark ? 'text-cyan-300' : 'text-primary') : (dark ? 'text-slate-500' : 'text-muted-foreground')}`}>{configured ? copy.open : copy.pending}</p>
            </>
          );

          return configured ? (
            <a key={social.key} href={configured} target="_blank" rel="noopener noreferrer" className={`${cardClass} hover:-translate-y-0.5 ${dark ? 'hover:border-cyan-400/35 hover:bg-white/[0.07]' : 'hover:border-primary/35 hover:shadow-sm'}`} aria-label={`${social.label}: ${copy.open}`}>
              {inner}
            </a>
          ) : (
            <div key={social.key} className={`${cardClass} opacity-75`} aria-label={`${social.label}: ${copy.soon}`}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
