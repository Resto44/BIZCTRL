import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Check, ChevronRight, Building2, GitBranch, Globe, Zap, DollarSign, AlertCircle, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = ['SAR', 'ر.س', 'AED', '$', '€', '£', 'AFN', '؋'];

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { value: 'cafe',       label: 'Cafe',       icon: '☕' },
  { value: 'retail',     label: 'Retail',     icon: '🛍️' },
  { value: 'warehouse',  label: 'Warehouse',  icon: '🏭' },
  { value: 'factory',    label: 'Factory',    icon: '⚙️' },
  { value: 'pharmacy',   label: 'Pharmacy',   icon: '💊' },
  { value: 'clinic',     label: 'Clinic',     icon: '🏥' },
  { value: 'wholesale',  label: 'Wholesale',  icon: '📦' },
  { value: 'services',   label: 'Services',   icon: '🔧' },
  { value: 'other',      label: 'Other',      icon: '🏢' },
];

const LANGUAGES = [
  { value: 'en', label: 'English', dir: 'ltr', welcome: 'Welcome', sub: "Let's set up your business workspace" },
  { value: 'ar', label: 'العربية', dir: 'rtl', welcome: 'أهلاً وسهلاً', sub: 'لنقم بإعداد مساحة عمل نشاطك التجاري' },
  { value: 'fa', label: 'فارسی', dir: 'rtl', welcome: 'خوش آمدید', sub: 'بیایید فضای کاری کسب‌وکار شما را راه‌اندازی کنیم' },
];

const LABELS = {
  en: {
    step1: 'Language', step2: 'Business Type', step3: 'Business', step4: 'Branch', step5: 'Currency',
    businessTypeLabel: 'Select Your Business Type',
    restaurantLabel: 'Business Name', restaurantPlaceholder: 'e.g. Al-Nakheel Grill',
    addressLabel: 'Address (optional)', addressPlaceholder: 'City, Country',
    branchLabel: 'First Branch Name', branchPlaceholder: 'e.g. Main Branch',
    currencyLabel: 'Display Currency',
    summaryTitle: 'Your Setup Summary',
    summaryRestaurant: 'Business', summaryBusinessType: 'Type', summaryBranch: 'Branch', summaryCurrency: 'Currency', summaryLang: 'Language',
    back: 'Back', continue: 'Continue', launch: 'Launch My Dashboard',
    launching: 'Setting up your workspace…',
    privacy: 'Your data is completely private — no one else can access it.',
    required: 'This field is required',
  },
  ar: {
    step1: 'اللغة', step2: 'نوع النشاط', step3: 'اسم النشاط', step4: 'الفرع', step5: 'العملة',
    businessTypeLabel: 'اختر نوع نشاطك التجاري',
    restaurantLabel: 'اسم النشاط التجاري', restaurantPlaceholder: 'مثل: مطعم النخيل',
    addressLabel: 'العنوان (اختياري)', addressPlaceholder: 'المدينة، الدولة',
    branchLabel: 'اسم الفرع الأول', branchPlaceholder: 'مثل: الفرع الرئيسي',
    currencyLabel: 'عملة العرض',
    summaryTitle: 'ملخص الإعداد',
    summaryRestaurant: 'النشاط', summaryBusinessType: 'النوع', summaryBranch: 'الفرع', summaryCurrency: 'العملة', summaryLang: 'اللغة',
    back: 'رجوع', continue: 'متابعة', launch: 'إطلاق لوحتي',
    launching: 'جاري إعداد مساحة عملك…',
    privacy: 'بياناتك خاصة تماماً — لا أحد آخر يمكنه الوصول إليها.',
    required: 'هذا الحقل مطلوب',
  },
  fa: {
    step1: 'زبان', step2: 'نوع کسب‌وکار', step3: 'نام کسب‌وکار', step4: 'شعبه', step5: 'ارز',
    businessTypeLabel: 'نوع کسب‌وکار خود را انتخاب کنید',
    restaurantLabel: 'نام کسب‌وکار', restaurantPlaceholder: 'مثل: رستوران نخیل',
    addressLabel: 'آدرس (اختیاری)', addressPlaceholder: 'شهر، کشور',
    branchLabel: 'نام اولین شعبه', branchPlaceholder: 'مثل: شعبه اصلی',
    currencyLabel: 'ارز نمایش',
    summaryTitle: 'خلاصه تنظیمات',
    summaryRestaurant: 'کسب‌وکار', summaryBusinessType: 'نوع', summaryBranch: 'شعبه', summaryCurrency: 'ارز', summaryLang: 'زبان',
    back: 'بازگشت', continue: 'ادامه', launch: 'راه‌اندازی داشبوردم',
    launching: 'در حال راه‌اندازی فضای کاری شما…',
    privacy: 'اطلاعات شما کاملاً خصوصی است — هیچ‌کس دیگری به آن دسترسی ندارد.',
    required: 'این فیلد الزامی است',
  },
};

const STEPS = ['step1', 'step2', 'step3', 'step4', 'step5'];

export default function Onboarding({ onComplete }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en');
  const [businessType, setBusinessType] = useState('restaurant');
  const [restaurant, setRestaurant] = useState({ name: '', address: '' });
  const [branchLabel, setBranchLabel] = useState('');
  const [currency, setCurrency] = useState('SAR');

  const L = LABELS[lang] || LABELS.en;
  const langMeta = LANGUAGES.find(l => l.value === lang) || LANGUAGES[0];
  const dir = langMeta.dir;

  const stepIcons = [Globe, Briefcase, Building2, GitBranch, DollarSign];
  const stepLabels = [L.step1, L.step2, L.step3, L.step4, L.step5];

  const validate = () => {
    if (step === 2 && !restaurant.name.trim()) { toast.error(L.required); return false; }
    if (step === 3 && !branchLabel.trim()) { toast.error(L.required); return false; }
    return true;
  };

  const goNext = () => {
    if (!validate()) return;
    setError('');
    if (step === 0) {
      localStorage.setItem('rc_lang', lang);
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', lang);
    }
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleFinish();
  };

  const handleFinish = async () => {
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      if (!user?.email) throw new Error('Not authenticated — please refresh and try again.');

      const branchKey = branchLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'main';
      // Persist the canonical portal mode. Pharmacy has a dedicated server-backed
      // mode and must never be collapsed into Retail during tenant creation.
      const businessMode = businessType === 'pharmacy'
        ? 'pharmacy'
        : ['retail', 'wholesale', 'warehouse'].includes(businessType)
          ? 'retail'
          : 'restaurant';

      const rest = await base44.entities.Restaurant.create({
        org_id: user.email,
        name: restaurant.name.trim(),
        address: restaurant.address.trim(),
        currency,
        business_type: businessType,
        business_mode: businessMode,
        branches: JSON.stringify([{ key: branchKey, label: branchLabel.trim(), is_active: true }]),
      });

      if (!rest?.id) throw new Error('Business creation failed — please try again.');

      // ── Fetch the first branch created for this org ────────────────────────
      let branchId = null;
      try {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id')
          .eq('restaurant_id', rest.id)
          .limit(1)
          .single();
        branchId = branchData?.id || null;
      } catch (_) {}

      // ── Initialize tenant with default master data ────────────────────────
      const CURRENCY_MAP = {
        'SAR': { symbol: 'ر.س', name: 'Saudi Riyal' },
        'ر.س': { symbol: 'ر.س', name: 'Saudi Riyal', code: 'SAR' },
        'AED': { symbol: 'د.إ', name: 'UAE Dirham' },
        'USD': { symbol: '$', name: 'US Dollar' },
        '$': { symbol: '$', name: 'US Dollar', code: 'USD' },
        'EUR': { symbol: '€', name: 'Euro' },
        '€': { symbol: '€', name: 'Euro', code: 'EUR' },
        'GBP': { symbol: '£', name: 'British Pound' },
        '£': { symbol: '£', name: 'British Pound', code: 'GBP' },
        'EGP': { symbol: 'ج.م', name: 'Egyptian Pound' },
        'KWD': { symbol: 'د.ك', name: 'Kuwaiti Dinar' },
        'QAR': { symbol: 'ر.ق', name: 'Qatari Riyal' },
        'BHD': { symbol: 'د.ب', name: 'Bahraini Dinar' },
        'OMR': { symbol: 'ر.ع', name: 'Omani Rial' },
      };
      const currencyMeta = CURRENCY_MAP[currency] || { symbol: currency, name: currency, code: 'USD' };
      const currencyCode = currencyMeta.code || (currency.length <= 3 ? currency : 'USD');
      try {
        await supabase.rpc('initialize_tenant', {
          p_organization_id: rest.id,
          p_branch_id: branchId,
          p_currency_code: currencyCode,
          p_currency_symbol: currencyMeta.symbol,
          p_currency_name: currencyMeta.name,
        });
      } catch (initErr) {
        console.warn('[Onboarding] Tenant init warning (non-fatal):', initErr.message);
      }

      localStorage.setItem('rc_lang', lang);
      localStorage.setItem('rc_currency', currency);
      localStorage.setItem('rc_lang_applied', '1');
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', lang);

      try {
        const profile = await base44.auth.me();
        if (!profile) throw new Error('Profile not found after onboarding');
      } catch (e) {
        console.error('[Onboarding] Profile hydration failed:', e);
        setError('Failed to complete profile setup. Please refresh and try again.');
        toast.error('Profile setup failed — please refresh and try again.');
        setSaving(false);
        return;
      }

      qc.clear();
      await new Promise(r => setTimeout(r, 200));
      window.location.replace('/');
    } catch (e) {
      console.error('[Onboarding] handleFinish error:', e);
      setError(e.message || 'Something went wrong. Please try again.');
      toast.error(e.message || 'Setup failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">
            {langMeta.welcome}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-slate-400 text-sm mt-1">{langMeta.sub}</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
          {STEPS.map((_, i) => {
            const Icon = stepIcons[i];
            return (
              <React.Fragment key={i}>
                <div className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  i === step ? 'bg-primary text-primary-foreground' :
                  i < step ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>
                  {i < step ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{stepLabels[i]}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">

          {/* Step 0: Language */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="text-white font-bold text-lg">{L.step1}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {LANGUAGES.map(l => (
                  <button
                    key={l.value}
                    onClick={() => setLang(l.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      lang === l.value ? 'border-primary bg-primary/20 text-white' : 'border-white/20 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                    dir={l.dir}
                  >
                    {lang === l.value && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                    {lang !== l.value && <span className="w-4" />}
                    <span className="font-semibold">{l.label}</span>
                  </button>
                ))}
              </div>
              <Button className="w-full" onClick={goNext}>
                {L.continue} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 1: Business Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-primary" />
                <h2 className="text-white font-bold text-lg">{L.step2}</h2>
              </div>
              <p className="text-slate-400 text-sm">{L.businessTypeLabel}</p>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.value}
                    onClick={() => setBusinessType(bt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                      businessType === bt.value
                        ? 'border-primary bg-primary/20 text-white'
                        : 'border-white/20 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {businessType === bt.value
                      ? <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      : <span className="w-3.5" />
                    }
                    <span className="text-base">{bt.icon}</span>
                    <span className="text-sm font-medium">{bt.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/20 text-slate-300 hover:bg-white/10" onClick={() => setStep(0)}>{L.back}</Button>
                <Button className="flex-1" onClick={goNext}>{L.continue} <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* Step 2: Business Name */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-primary" />
                <h2 className="text-white font-bold text-lg">{L.step3}</h2>
              </div>
              <div>
                <Label className="text-slate-300 text-sm">{L.restaurantLabel} *</Label>
                <Input
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  placeholder={L.restaurantPlaceholder}
                  value={restaurant.name}
                  onChange={e => setRestaurant(r => ({ ...r, name: e.target.value }))}
                  dir={dir}
                />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">{L.addressLabel}</Label>
                <Input
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  placeholder={L.addressPlaceholder}
                  value={restaurant.address}
                  onChange={e => setRestaurant(r => ({ ...r, address: e.target.value }))}
                  dir={dir}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/20 text-slate-300 hover:bg-white/10" onClick={() => setStep(1)}>{L.back}</Button>
                <Button className="flex-1" onClick={goNext}>{L.continue} <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* Step 3: Branch */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="w-5 h-5 text-primary" />
                <h2 className="text-white font-bold text-lg">{L.step4}</h2>
              </div>
              <p className="text-slate-400 text-sm">
                {restaurant.name && <span className="text-white font-medium">{restaurant.name} — </span>}
                {L.branchLabel}
              </p>
              <div>
                <Label className="text-slate-300 text-sm">{L.branchLabel} *</Label>
                <Input
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  placeholder={L.branchPlaceholder}
                  value={branchLabel}
                  onChange={e => setBranchLabel(e.target.value)}
                  dir={dir}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/20 text-slate-300 hover:bg-white/10" onClick={() => setStep(2)}>{L.back}</Button>
                <Button className="flex-1" onClick={goNext}>{L.continue} <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* Step 4: Currency + Summary */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <h2 className="text-white font-bold text-lg">{L.step5}</h2>
              </div>
              <div>
                <Label className="text-slate-300 text-sm">{L.currencyLabel}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                        currency === c ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/20 text-slate-300 hover:bg-white/10'
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/10">
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide">{L.summaryTitle}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{L.summaryRestaurant}</span>
                  <span className="text-white font-medium">{restaurant.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{L.summaryBusinessType}</span>
                  <span className="text-white font-medium capitalize">{businessType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{L.summaryBranch}</span>
                  <span className="text-white font-medium">{branchLabel}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{L.summaryCurrency}</span>
                  <span className="text-white font-medium">{currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{L.summaryLang}</span>
                  <span className="text-white font-medium">{langMeta.label}</span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/20 border border-red-500/40 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/20 text-slate-300 hover:bg-white/10" onClick={() => setStep(3)} disabled={saving}>{L.back}</Button>
                <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold" onClick={handleFinish} disabled={saving}>
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                      {L.launching}
                    </span>
                  ) : `🚀 ${L.launch}`}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-slate-600 text-xs mt-4">{L.privacy}</p>
      </div>
    </div>
  );
}
