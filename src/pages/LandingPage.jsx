import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Building2, CheckCircle2, ChevronDown, ClipboardList,
  Factory, Landmark, Package, Pill, Receipt, ShoppingBag, Store, Truck, Users,
  Warehouse, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicPricingCards from '@/components/marketing/PublicPricingCards';
import { supabase } from '@/api/supabaseClient';
import { ContentSection, PRODUCT_DESCRIPTION, PublicHero, PublicLayout, SectionHeading, usePublicPageMetadata } from '@/components/marketing/PublicLayout';
import { PUBLIC_PLAN_FIELDS } from '@/lib/pricingCatalog';
import { usePublicPlanCheckout } from '@/lib/publicPlanCheckout';

const INDUSTRIES = [
  { icon: Store, title: 'Restaurants', description: 'Manage branches, ingredients, inventory, purchasing, sales, expenses, and reports.' },
  { icon: ShoppingBag, title: 'Retail Stores', description: 'Manage products, stock, sales, purchasing, suppliers, and branches.' },
  { icon: Pill, title: 'Pharmacies', description: 'Manage inventory, products, purchasing, suppliers, sales, and business reporting.' },
  { icon: Warehouse, title: 'Warehouses', description: 'Track inventory, transfers, purchasing, receiving, suppliers, and stock levels.' },
  { icon: Factory, title: 'Factories', description: 'Organize inventory, purchasing, supplier relationships, and reporting for factory operations.' },
  { icon: Building2, title: 'More Businesses', description: 'Use configurable modules and permissions to support additional business types as your operation grows.' },
];

const MODULES = [
  { icon: Package, title: 'Inventory Management', description: 'Track products, stock, and inventory activity across your workspace.' },
  { icon: Receipt, title: 'Sales Management', description: 'Record sales activity, invoices, and business performance.' },
  { icon: ClipboardList, title: 'Purchasing', description: 'Manage purchases, purchase orders, and related workflows.' },
  { icon: Truck, title: 'Supplier Management', description: 'Maintain supplier records, orders, balances, and procurement visibility.' },
  { icon: Users, title: 'HR & Employees', description: 'Manage employees, attendance, payroll, and controlled staff access.' },
  { icon: Landmark, title: 'Finance & Expenses', description: 'Work with expenses, treasury, cash flow, and financial reporting tools.' },
  { icon: Building2, title: 'Branch Management', description: 'Organize multiple branches with centralized operational visibility.' },
  { icon: BarChart3, title: 'Reports & Analytics', description: 'Review dashboards, reporting, and business trends from one place.' },
  { icon: Package, title: 'Product Management', description: 'Maintain products and product information used across operations.' },
  { icon: Truck, title: 'Transfers', description: 'Track inventory transfers between business locations.' },
  { icon: Users, title: 'Customer Management', description: 'Manage customer records and related account activity.' },
  { icon: Zap, title: 'Business Dashboard', description: 'Bring essential operational insights together for faster decisions.' },
];

const FAQS = [
  ['What is BizCTRL?', 'BizCTRL is a cloud-based, multi-tenant ERP SaaS that brings key business operations—including inventory, sales, purchasing, suppliers, people, finance, branches, and reporting—into one platform.'],
  ['Which businesses can use BizCTRL?', 'BizCTRL is positioned for restaurants, retail stores, pharmacies, warehouses, factories, and other businesses that need configurable operational modules and centralized control.'],
  ['Is BizCTRL multi-tenant?', 'BizCTRL is designed as a multi-tenant platform, where each business has its own workspace and data context.'],
  ['Can I manage multiple branches?', 'BizCTRL includes branch management and related operational visibility for businesses with multiple locations, subject to the capabilities and limits of the active plan.'],
  ['What modules are available?', 'Available modules include inventory, sales, purchasing, suppliers, customers, expenses, finance, employee tools, branches, product management, transfers, reports, and dashboards. Availability may depend on permissions and plan configuration.'],
  ['Does BizCTRL support subscriptions?', 'BizCTRL includes an account billing area for subscription management. Public plan details are shown on the Pricing page when they are active in the public catalog.'],
  ['Can I cancel my subscription?', 'Authorized account owners can manage subscription cancellation through the BizCTRL billing area. See the Refund Policy for refund-review information.'],
  ['How does billing work?', 'Billing terms, price, plan limits, and billing period are shown in the active plan catalog and within the account billing area. BizCTRL does not publish commercial terms that are not configured.'],
  ['How can I contact support?', 'Existing users can access the authenticated Support Center after logging in. For business or public inquiries, visit the Contact page.'],
];

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left" aria-expanded={open}>
        <span className="font-bold text-white">{question}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-cyan-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="border-t border-white/10 px-5 py-5 leading-7 text-slate-300">{answer}</p>}
    </article>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-3 shadow-2xl shadow-cyan-950/30 sm:p-5">
      <div className="flex items-center gap-2 border-b border-white/10 pb-4"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-3 text-xs font-medium text-slate-500">BizCTRL dashboard</span></div>
      <div className="grid gap-3 pt-5 sm:grid-cols-[0.26fr_1fr]">
        <aside className="hidden rounded-2xl border border-white/10 bg-slate-950 p-4 sm:block"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Workspace</p><div className="mt-4 space-y-3">{['Dashboard', 'Inventory', 'Sales', 'Purchasing', 'Reports'].map((item, index) => <div key={item} className={`rounded-lg px-3 py-2 text-xs ${index === 0 ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-500'}`}>{item}</div>)}</div></aside>
        <div className="space-y-3"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Business overview</p><p className="mt-1 text-sm font-bold text-white">Centralized operating view</p></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-200">Live workspace</span></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{['Sales', 'Expenses', 'Inventory', 'Branches'].map((item) => <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="h-2 w-14 rounded bg-slate-700" /><p className="mt-3 text-xs font-semibold text-slate-200">{item}</p><div className="mt-2 h-2 w-full rounded bg-gradient-to-r from-cyan-500/70 to-blue-500/30" /></div>)}</div><div className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold text-slate-300">Business trends</p><div className="mt-5 flex h-28 items-end gap-2">{[35, 58, 45, 70, 60, 82, 74, 95].map((height, index) => <span key={index} className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/25 to-cyan-300" style={{ height: `${height}%` }} />)}</div></div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold text-slate-300">Recent activity</p><div className="mt-4 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" /><span className="h-2 flex-1 rounded bg-slate-700" /></div>)}</div></div></div></div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  usePublicPageMetadata('BizCTRL — Multi-Tenant ERP SaaS', PRODUCT_DESCRIPTION);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalogPlans, setCatalogPlans] = useState([]);
  const resumedCheckoutPlanId = useRef('');
  const { beginPlanCheckout, contactSales, checkoutNotice, checkoutPlanId, isLoadingAuth, setCheckoutNotice } = usePublicPlanCheckout();

  useEffect(() => {
    let active = true;
    supabase.from('subscription_plans')
      .select(PUBLIC_PLAN_FIELDS)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (active) setCatalogPlans(Array.isArray(data) ? data : []); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const planId = String(searchParams.get('checkout_plan') || '').trim();
    if (!planId || catalogPlans.length === 0 || isLoadingAuth || resumedCheckoutPlanId.current === planId) return;

    const selectedPlan = catalogPlans.find((plan) => plan.id === planId);
    resumedCheckoutPlanId.current = planId;
    setSearchParams({}, { replace: true });
    if (!selectedPlan) {
      setCheckoutNotice('The selected plan is no longer available.');
      return;
    }
    void beginPlanCheckout(selectedPlan);
  }, [beginPlanCheckout, catalogPlans, isLoadingAuth, searchParams, setCheckoutNotice, setSearchParams]);

  return (
    <PublicLayout>
      <PublicHero
        eyebrow="Cloud-based business management"
        title={<><span>Run Your Entire Business</span><br /><span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">From One Platform</span></>}
        description={PRODUCT_DESCRIPTION}
      >
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button onClick={() => navigate('/erp-register?owner=1')} className="h-13 min-h-13 w-full bg-cyan-500 px-7 py-3 text-base font-black text-slate-950 hover:bg-cyan-400 sm:w-auto">Start Free <ArrowRight className="ml-2 h-5 w-5" /></Button>
          <Button asChild variant="outline" className="h-13 min-h-13 w-full border-white/20 bg-transparent px-7 py-3 text-base font-bold text-white hover:bg-white/10 hover:text-white sm:w-auto"><a href="#pricing">View Pricing</a></Button>
        </div>
        <p className="mt-7 flex items-center justify-center gap-2 text-sm font-medium text-slate-400"><CheckCircle2 className="h-4 w-4 text-emerald-400" />One platform. Multiple branches. Complete business control.</p>
      </PublicHero>

      <ContentSection className="pt-0" id="industries">
        <SectionHeading eyebrow="Industries" title="Built for Your Business" description="BizCTRL adapts its ERP foundation to different business operations. Restaurants are one supported industry—not the entire identity of the platform." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{INDUSTRIES.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6 transition duration-200 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.07]"><span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Icon className="h-6 w-6" /></span><h3 className="mt-5 text-xl font-black text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p></article>)}</div>
      </ContentSection>

      <ContentSection id="features" className="border-y border-white/10 bg-slate-900/30">
        <SectionHeading eyebrow="Core ERP modules" title="Everything Your Business Needs" description="BizCTRL brings together the modules already available across the application. Access is governed by your plan and workspace permissions." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{MODULES.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"><Icon className="h-5 w-5 text-cyan-300" /><h3 className="mt-4 font-bold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></article>)}</div>
      </ContentSection>

      <ContentSection>
        <div className="grid gap-12 rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-blue-500/10 p-7 lg:grid-cols-2 lg:p-12">
          <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">Multi-tenant SaaS</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">One Platform for Multiple Businesses</h2><p className="mt-5 max-w-xl leading-7 text-slate-300">BizCTRL is designed as a multi-tenant platform so each business can work from its own workspace and data context, while giving authorized users the tools they need for their role.</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{['Business-level data isolation', 'Role-based access', 'Multiple branches', 'Centralized reporting', 'User permissions', 'Secure authentication'].map((item) => <p key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-100"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />{item}</p>)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6"><p className="text-sm font-bold text-white">Designed for controlled access</p><div className="mt-6 space-y-4">{[['Organization workspace', 'A distinct business context for each organization'], ['User roles', 'Permissions help control what each user can access'], ['Branch operations', 'Manage locations from a central business workspace']].map(([title, description]) => <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="font-semibold text-slate-100">{title}</p><p className="mt-1 text-sm leading-6 text-slate-400">{description}</p></div>)}</div></div>
        </div>
      </ContentSection>

      <ContentSection className="border-y border-white/10 bg-slate-900/30">
        <div className="grid items-center gap-12 lg:grid-cols-2"><div><SectionHeading align="left" eyebrow="Multi-branch operations" title="Control Every Branch From One Dashboard" description="Keep a clearer view of operations across locations. BizCTRL provides a centralized workspace for branch-aware sales, inventory, expenses, transfers, employee access, reporting, and performance review where those modules are enabled." /><Button onClick={() => navigate('/erp-register?owner=1')} className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2">{['Monitor sales', 'Track inventory', 'Manage expenses', 'Transfer stock', 'Manage employees', 'Review branch performance'].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5"><CheckCircle2 className="h-5 w-5 text-cyan-300" /><p className="mt-4 font-bold text-white">{item}</p></div>)}</div></div>
      </ContentSection>

      <ContentSection>
        <SectionHeading eyebrow="Dashboard and analytics" title="See Your Business Clearly" description="Use BizCTRL’s existing dashboards and reporting modules to centralize visibility into the areas that matter to your operation, without fabricated statistics or performance claims." />
        <DashboardPreview />
        <div className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3 text-sm font-semibold text-slate-300">{['Sales', 'Expenses', 'Inventory', 'Profit and performance', 'Branch activity', 'Customers', 'Suppliers', 'Business trends'].map((item) => <span key={item} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-cyan-300" />{item}</span>)}</div>
      </ContentSection>

      <ContentSection id="pricing" className="border-y border-white/10 bg-gradient-to-b from-slate-900/40 to-slate-950">
        <SectionHeading eyebrow="Launch Pricing" title="Simple promotional pricing, clearly disclosed" description="Every public price comes from BizCTRL’s active plan catalog. Starter includes a free first month (a 30-day trial), then renews at its displayed monthly price unless cancelled." />
        {catalogPlans.length > 0 && <PublicPricingCards plans={catalogPlans} compact onStartFree={beginPlanCheckout} onContactSales={contactSales} busyPlanId={checkoutPlanId} disabled={isLoadingAuth} enterpriseContactMode />}
        {checkoutNotice && <p role="status" className="mx-auto mt-6 max-w-3xl rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-4 text-center text-sm leading-6 text-cyan-50">{checkoutNotice}</p>}

      </ContentSection>

      <ContentSection>
        <SectionHeading eyebrow="Frequently asked questions" title="Answers for modern business operators" description="Learn how BizCTRL is positioned, which businesses it supports, and how subscriptions and support work." />
        <div className="mx-auto max-w-3xl space-y-3">{FAQS.map(([question, answer]) => <FaqItem key={question} question={question} answer={answer} />)}</div>
      </ContentSection>

      <ContentSection className="pt-0">
        <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/15 to-blue-600/15 px-6 py-12 text-center sm:px-12"><Zap className="mx-auto h-8 w-8 text-cyan-300" /><h2 className="mt-5 text-3xl font-black text-white sm:text-4xl">Run your business with more control.</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">Create an organization to begin with BizCTRL, or explore the current public pricing catalog first.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button onClick={() => navigate('/erp-register?owner=1')} className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">Start Free <ArrowRight className="ml-2 h-4 w-4" /></Button><Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/contact">Contact BizCTRL</Link></Button></div></div>
      </ContentSection>
    </PublicLayout>
  );
}
