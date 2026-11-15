import React from 'react';

/**
 * Pure presentation. This component NEVER delays application startup,
 * fetches data, sets a minimum loading duration, or modifies the session.
 * The same structure is first painted from index.html before JS has loaded.
 */
const copy = {
  en: { tagline: 'Your business. In control.', status: 'Opening your workspace', foot: 'One clear view of your business' },
  ar: { tagline: 'أعمالك تحت سيطرتك', status: 'جاري فتح مساحة عملك', foot: 'أعمالك كلها في مكان واحد' },
  fa: { tagline: 'کنترول کسب‌وکار شما', status: 'در حال بازکردن داشبورد شما', foot: 'تمام کاروبارت در یک دید' },
};

export default function StartupLoadingScene({ lang = 'en', compact = false }) {
  const t = copy[lang] || copy.en;
  return (
    <main className={`bzc-startup ${compact ? 'bzc-startup--inline' : 'bzc-startup--full'}`}
      role="status" aria-live="polite" aria-label={t.status} data-testid="bizctrl-startup-scene">
      <div className="bzc-startup__ambient bzc-startup__ambient--a" aria-hidden="true" />
      <div className="bzc-startup__ambient bzc-startup__ambient--b" aria-hidden="true" />
      <div className="bzc-startup__frame" aria-hidden="true" />
      <div className="bzc-startup__content">
        <div className="bzc-startup__emblem">
          <span className="bzc-startup__halo" aria-hidden="true" />
          <span className="bzc-startup__orbit" aria-hidden="true" />
          <img className="bzc-startup__logo" src="/icons/bizctrl-icon-192-v3.png"
            alt="BizCTRL" width="84" height="84" decoding="async" />
        </div>
        <div className="bzc-startup__wordmark" translate="no" dir="ltr" aria-hidden="true">
          <span>Biz</span><strong>CTRL</strong>
        </div>
        <p className="bzc-startup__tagline">{t.tagline}</p>
        <div className="bzc-startup__progress" aria-hidden="true"><span /></div>
        <p className="bzc-startup__status">{t.status}<span className="bzc-startup__dots" aria-hidden="true">...</span></p>
      </div>
      <p className="bzc-startup__footer">{t.foot}</p>
    </main>
  );
}
