import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Building2, ChefHat, ShoppingBag, Warehouse, Factory,
  Pill, Stethoscope, Package, Wrench, BarChart3,
  Users, DollarSign, ShieldCheck, Globe,
  ArrowRight, CheckCircle2, Zap,
  LayoutDashboard, Truck, Receipt,
  ChevronRight, Menu, X, CreditCard, Clock, Sparkles
} from 'lucide-react';

const BUSINESS_TYPES = [
  { icon: ChefHat,      label: 'Restaurant',  color: 'from-orange-500 to-red-600' },
  { icon: ShoppingBag,  label: 'Retail',      color: 'from-blue-500 to-cyan-600' },
  { icon: Warehouse,    label: 'Warehouse',   color: 'from-slate-500 to-slate-700' },
  { icon: Factory,      label: 'Factory',     color: 'from-gray-500 to-gray-700' },
  { icon: Pill,         label: 'Pharmacy',    color: 'from-green-500 to-emerald-600' },
  { icon: Stethoscope,  label: 'Clinic',      color: 'from-teal-500 to-cyan-600' },
  { icon: Package,      label: 'Wholesale',   color: 'from-purple-500 to-violet-600' },
  { icon: Wrench,       label: 'Services',    color: 'from-amber-500 to-yellow-600' },
  { icon: Building2,    label: 'Café',        color: 'from-amber-600 to-orange-700' },
  { icon: Globe,        label: 'Other',       color: 'from-pink-500 to-rose-600' },
];

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Unified Owner Dashboard',
    desc: 'Real-time KPIs, operating results, branch comparisons, and AI-powered insights — all in one command center.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  {
    icon: Users,
    title: 'Role-Based Access Control',
    desc: 'Owner, Manager, Employee, and Supplier access is protected by tailored dashboards and granular permissions.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    icon: Truck,
    title: 'Supplier Management',
    desc: 'Owner-issued supplier invitations, purchase orders, invoices, and outstanding balance tracking.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Package,
    title: 'Smart Inventory',
    desc: 'Multi-branch inventory, batch/lot tracking, expiry alerts, serial numbers, and automatic reorder points.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Receipt,
    title: 'Sales & POS',
    desc: 'Cash register, invoicing, customer debts, loyalty programs, and multi-channel sales analytics.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    icon: DollarSign,
    title: 'Finance & Treasury',
    desc: 'Profit & Loss, cash flow, payroll, expense tracking, network settlement, and multi-currency support.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: BarChart3,
    title: 'BI & Analytics',
    desc: 'Advanced reports, scheduled exports, AI business copilot, and predictive inventory forecasting.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant & Secure',
    desc: 'Each business is fully isolated. Row-level security, audit logs, and role-based data access.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
  },
];

const PRICING_COPY = {
  en: {
    trial: '30-Day Full ERP Trial', title: 'Plans that scale with your operation',
    intro: 'Create your organization to start a 30-day full-access trial. After the trial, choose the permanent Free plan or a paid plan. Paid selections remain payment-pending until a payment provider confirms them.',
    start: 'Start Free Trial', choose: 'Choose Plan', recommended: 'Recommended', original: 'Original', final: 'Final',
    tiers: [
      { name: 'Free', amount: 0, price: '$0', detail: 'Permanent limited access', limits: ['1 restaurant · 1 branch', '5 employees · 5 users', '512 MB storage', '10 PDF reports · 10 OCR/month', 'Core sales, purchasing & inventory'] },
      { name: 'Starter', amount: 20, price: '$20', detail: 'per month', limits: ['1 restaurant · 3 branches', '20 employees · 20 users', '5 GB storage', '100 PDF reports · 100 OCR/month', 'Treasury, suppliers & reports'] },
      { name: 'Growth', amount: 40, price: '$40', detail: 'per month', limits: ['3 restaurants · 10 branches', '75 employees · 75 users', '25 GB storage', '500 PDF reports · 500 OCR/month', 'Advanced & scheduled analytics'] },
      { name: 'Enterprise', amount: 100, price: '$100', detail: 'per month', limits: ['10 restaurants · 50 branches', '250 employees · 250 users', '100 GB storage', '2,000 PDF reports · 2,000 OCR/month', 'All ERP modules'] },
    ],
  },
  ar: {
    trial: 'تجربة ERP كاملة لمدة 30 يوماً', title: 'خطط تنمو مع عملياتك',
    intro: 'أنشئ مؤسستك لبدء تجربة وصول كامل لمدة 30 يوماً. بعد التجربة، اختر الخطة المجانية الدائمة أو خطة مدفوعة. تبقى الخطط المدفوعة بانتظار تأكيد الدفع ولا تُفعّل قبل ذلك.',
    start: 'ابدأ التجربة المجانية', choose: 'اختر الخطة', recommended: 'موصى بها', original: 'الأصلي', final: 'النهائي',
    tiers: [
      { name: 'مجاني', amount: 0, price: '$0', detail: 'وصول محدود دائم', limits: ['مطعم واحد · فرع واحد', '5 موظفين · 5 مستخدمين', '512 ميجابايت تخزين', '10 تقارير PDF · 10 OCR/شهر', 'المبيعات والمشتريات والمخزون الأساسية'] },
      { name: 'Starter', amount: 20, price: '$20', detail: 'شهرياً', limits: ['مطعم واحد · 3 فروع', '20 موظفاً · 20 مستخدماً', '5 جيجابايت تخزين', '100 تقرير PDF · 100 OCR/شهر', 'الخزينة والموردون والتقارير'] },
      { name: 'Growth', amount: 40, price: '$40', detail: 'شهرياً', limits: ['3 مطاعم · 10 فروع', '75 موظفاً · 75 مستخدماً', '25 جيجابايت تخزين', '500 تقرير PDF · 500 OCR/شهر', 'تحليلات متقدمة ومجدولة'] },
      { name: 'Enterprise', amount: 100, price: '$100', detail: 'شهرياً', limits: ['10 مطاعم · 50 فرعاً', '250 موظفاً · 250 مستخدماً', '100 جيجابايت تخزين', '2,000 تقرير PDF · 2,000 OCR/شهر', 'جميع وحدات ERP'] },
    ],
  },
  fa: {
    trial: 'آزمایش کامل ERP برای ۳۰ روز', title: 'طرح‌هایی متناسب با رشد کسب‌وکار شما',
    intro: 'سازمان خود را ایجاد کنید تا آزمایش دسترسی کامل ۳۰ روزه را شروع کنید. پس از آزمایش، طرح رایگان دائمی یا طرح پولی را انتخاب کنید. طرح پولی تا تأیید پرداخت در حالت انتظار باقی می‌ماند و فعال نمی‌شود.',
    start: 'شروع آزمایش رایگان', choose: 'انتخاب طرح', recommended: 'پیشنهادی', original: 'قیمت اصلی', final: 'قیمت نهایی',
    tiers: [
      { name: 'رایگان', amount: 0, price: '$0', detail: 'دسترسی محدود دائمی', limits: ['۱ رستوران · ۱ شعبه', '۵ کارمند · ۵ کاربر', '۵۱۲ مگابایت فضا', '۱۰ گزارش PDF · ۱۰ OCR/ماه', 'فروش، خرید و انبار پایه'] },
      { name: 'Starter', amount: 20, price: '$20', detail: 'ماهانه', limits: ['۱ رستوران · ۳ شعبه', '۲۰ کارمند · ۲۰ کاربر', '۵ گیگابایت فضا', '۱۰۰ گزارش PDF · ۱۰۰ OCR/ماه', 'خزانه، تأمین‌کنندگان و گزارش‌ها'] },
      { name: 'Growth', amount: 40, price: '$40', detail: 'ماهانه', limits: ['۳ رستوران · ۱۰ شعبه', '۷۵ کارمند · ۷۵ کاربر', '۲۵ گیگابایت فضا', '۵۰۰ گزارش PDF · ۵۰۰ OCR/ماه', 'تحلیل‌های پیشرفته و زمان‌بندی‌شده'] },
      { name: 'Enterprise', amount: 100, price: '$100', detail: 'ماهانه', limits: ['۱۰ رستوران · ۵۰ شعبه', '۲۵۰ کارمند · ۲۵۰ کاربر', '۱۰۰ گیگابایت فضا', '۲٬۰۰۰ گزارش PDF · ۲٬۰۰۰ OCR/ماه', 'همه ماژول‌های ERP'] },
    ],
  },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogPlans, setCatalogPlans] = useState([]);
  const pricing = PRICING_COPY[lang] || PRICING_COPY.en;

  useEffect(() => {
    let active = true;
    supabase.from('subscription_plans')
      .select('monthly_price_cents, original_price_cents, discount_percent, discount_active, discount_label')
      .eq('is_active', true)
      .eq('is_public', true)
      .then(({ data }) => { if (active && data) setCatalogPlans(data); });
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-black text-white tracking-tight">
                Biz<span className="text-cyan-400">CTRL</span>
              </span>
              <p className="text-[9px] text-slate-500 -mt-0.5 uppercase tracking-widest">Enterprise ERP</p>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#business-types" className="hover:text-white transition-colors">Industries</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>

          {/* Secure ERP entry points */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/erp-login')}
              className="text-slate-300 hover:text-white hover:bg-white/5 text-sm"
            >
              Sign In
            </Button>
            <Button
              onClick={() => navigate('/erp-register?owner=1')}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm px-5"
            >
              Create Organization
            </Button>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setMobileMenuOpen(o => !o)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden px-4 pb-4 space-y-3 border-t border-white/5 pt-4">
            <a href="#features" className="block text-slate-300 hover:text-white text-sm py-1">Features</a>
            <a href="#business-types" className="block text-slate-300 hover:text-white text-sm py-1">Industries</a>
            <a href="#pricing" className="block text-slate-300 hover:text-white text-sm py-1">Pricing</a>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate('/erp-login')} className="flex-1 border-white/20 text-slate-300 text-sm">Sign In</Button>
              <Button onClick={() => navigate('/erp-register?owner=1')} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm">Create Organization</Button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 max-w-7xl mx-auto text-center relative">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6">
            <Zap className="w-3 h-3" />
            <span>The All-in-One Business ERP Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6">
            Run Your Entire Business
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              From One Platform
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            BizCTRL is a multi-tenant ERP SaaS built for restaurants, retail stores, pharmacies, warehouses, factories, and more. Manage inventory, sales, purchasing, HR, finance, and suppliers — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button
              onClick={() => navigate('/erp-register?owner=1')}
              className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-black text-base px-8 py-6 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2"
            >
              Create Organization <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/erp-login')}
              className="w-full sm:w-auto border-white/20 text-slate-300 hover:bg-white/5 font-bold text-base px-8 py-6 rounded-xl flex items-center gap-2"
            >
              <Users className="w-5 h-5" /> Staff sign in
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            {['No credit card required', '30-day free trial', 'Cancel anytime', 'Secure by design'].map(item => (
              <span key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Business Types ── */}
      <section id="business-types" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Built for Every Industry
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Whether you run a restaurant, pharmacy, or factory — BizCTRL adapts to your business type with tailored modules and workflows.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {BUSINESS_TYPES.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
              onClick={() => navigate('/erp-register?owner=1')}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors text-center">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-widest mb-4">
            <BarChart3 className="w-3 h-3" />
            <span>Enterprise Features</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Everything You Need to Run Your Business
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            From inventory to payroll, from supplier management to AI analytics — BizCTRL covers every aspect of your operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div
              key={title}
              className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/20 transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="text-white font-bold mb-2 text-sm">{title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Role Access Section ── */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4">
                <ShieldCheck className="w-3 h-3" />
                <span>Role-Based Access</span>
              </div>
              <h2 className="text-3xl font-black text-white mb-4">
                The Right Access for Every Team Member
              </h2>
              <p className="text-slate-400 mb-6">
                BizCTRL gives each role a dedicated, purpose-built experience. Owners see everything; employees see only what they need.
              </p>
              <Button
                onClick={() => navigate('/erp-login')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2"
              >
                Staff sign in <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { role: 'Owner', desc: 'Full command center with KPIs, P&L, and approvals', color: 'border-cyan-500/30 bg-cyan-500/5' },
                { role: 'Manager', desc: 'Branch operations, staff, inventory, and sales', color: 'border-purple-500/30 bg-purple-500/5' },
                { role: 'Employee', desc: 'Attendance, tasks, payslips, and shift schedule', color: 'border-emerald-500/30 bg-emerald-500/5' },
                { role: 'Supplier', desc: 'Purchase orders, invoices, payments, and balance', color: 'border-amber-500/30 bg-amber-500/5' },
              ].map(({ role, desc, color }) => (
                <div key={role} className={`p-3 rounded-xl border ${color}`}>
                  <p className="text-white font-bold text-sm">{role}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-4">
            <Clock className="w-3 h-3" /> {pricing.trial}
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">{pricing.title}</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">{pricing.intro}</p>
          <Button onClick={() => navigate('/erp-register?owner=1')} className="mt-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold"><Sparkles className="w-4 h-4 me-2" />{pricing.start}</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {pricing.tiers.map((tier, index) => {
            const accents = ['border-white/10', 'border-cyan-500/30', 'border-violet-500/50', 'border-amber-400/40'];
            const featured = index === 2;
            const catalog = catalogPlans.find((item) => Number(item.monthly_price_cents) === tier.amount * 100);
            const finalPrice = catalog ? `$${Number(catalog.monthly_price_cents) / 100}` : tier.price;
            const hasDiscount = Boolean(catalog?.discount_active) && Number(catalog?.original_price_cents) > Number(catalog?.monthly_price_cents);
            return (
            <div key={tier.name} className={`relative p-6 rounded-2xl bg-white/5 border ${accents[index]} flex flex-col ${featured ? 'shadow-xl shadow-violet-950/30' : ''}`}>
              {hasDiscount ? <span className="absolute top-3 end-3 text-[10px] px-2 py-1 rounded-full bg-rose-600 text-white font-bold uppercase tracking-wide">{catalog.discount_label || `-${catalog.discount_percent}%`}</span> : featured && <span className="absolute top-3 end-3 text-[10px] px-2 py-1 rounded-full bg-violet-500 text-white font-bold uppercase tracking-wide">{pricing.recommended}</span>}
              <h3 className="text-xl font-black text-white">{tier.name}</h3>
              <div className="mt-3"><span className="text-4xl font-black text-white">{finalPrice}</span><span className="text-slate-400 text-sm ms-1">{tier.detail}</span></div>
              {hasDiscount && <p className="mt-1 text-xs text-slate-400"><span className="line-through">{pricing.original}: ${Number(catalog.original_price_cents) / 100}</span> · <span className="font-semibold text-emerald-300">{pricing.final}: {finalPrice}</span></p>}
              <ul className="mt-6 space-y-3 flex-1">{tier.limits.map((limit) => <li key={limit} className="flex gap-2 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />{limit}</li>)}</ul>
              <Button onClick={() => navigate('/erp-register?owner=1')} variant={featured ? 'default' : 'outline'} className={featured ? 'mt-6 bg-violet-600 hover:bg-violet-500 font-bold' : 'mt-6 border-white/20 text-slate-200 hover:bg-white/10 font-bold'}><CreditCard className="w-4 h-4 me-2" />{pricing.choose}</Button>
            </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4 sm:px-6 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-500/20 p-10 md:p-16">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-cyan-500/30">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Start your 30-day full-access trial today. No credit card required. Set up in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/erp-register?owner=1')}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-black text-base px-8 py-6 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2"
            >
              Create Organization <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/erp-login')}
              className="border-white/20 text-slate-300 hover:bg-white/5 font-bold text-base px-8 py-6 rounded-xl flex items-center gap-2"
            >
              <Users className="w-5 h-5" /> Staff sign in
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-black">Biz<span className="text-cyan-400">CTRL</span></span>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-500">
            <a href="/erp-login" className="hover:text-white transition-colors">ERP Sign In</a>
            <a href="/erp-register?owner=1" className="hover:text-white transition-colors">Create Organization</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#business-types" className="hover:text-white transition-colors">Industries</a>
          </div>
          <p className="text-slate-600 text-xs">© 2026 BizCTRL. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
