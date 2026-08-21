import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Building2, CreditCard, HelpCircle,
  LockKeyhole, Mail, MessageSquare, Scale, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { usePublicPlanCheckout } from '@/lib/publicPlanCheckout';
import { Button } from '@/components/ui/button';
import PublicPricingCards from '@/components/marketing/PublicPricingCards';
import { ContentSection, PublicHero, PublicLayout, usePublicPageMetadata } from '@/components/marketing/PublicLayout';
import { PUBLIC_PLAN_FIELDS } from '@/lib/pricingCatalog';


function PublicCta({ secondary = true }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Button onClick={() => navigate('/erp-register?owner=1')} className="h-12 bg-cyan-500 px-6 font-bold text-slate-950 hover:bg-cyan-400">
        Start Free <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      {secondary && <Button asChild variant="outline" className="h-12 border-white/20 bg-transparent px-6 font-bold text-slate-100 hover:bg-white/10 hover:text-white"><Link to="/pricing">View Pricing</Link></Button>}
    </div>
  );
}

export function PricingPage() {
  usePublicPageMetadata('BizCTRL Pricing — ERP SaaS Plans', 'Explore BizCTRL launch pricing for multi-tenant ERP software, including the Starter first-month-free 30-day trial and the active public plan catalog.');
  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState('loading');
  const [searchParams, setSearchParams] = useSearchParams();
  const resumedCheckoutPlanId = useRef('');
  const { beginPlanCheckout, contactSales, checkoutNotice, checkoutPlanId, isLoadingAuth, setCheckoutNotice } = usePublicPlanCheckout();

  useEffect(() => {
    let active = true;
    supabase
      .from('subscription_plans')
      .select(PUBLIC_PLAN_FIELDS)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStatus('error');
          return;
        }
        setPlans(Array.isArray(data) ? data : []);
        setStatus('ready');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const planId = String(searchParams.get('checkout_plan') || '').trim();
    if (!planId || status !== 'ready' || isLoadingAuth || resumedCheckoutPlanId.current === planId) return;
    const selectedPlan = plans.find((plan) => plan.id === planId);
    if (!selectedPlan) {
      resumedCheckoutPlanId.current = planId;
      setCheckoutNotice('The selected plan is no longer available.');
      setSearchParams({}, { replace: true });
      return;
    }
    resumedCheckoutPlanId.current = planId;
    setSearchParams({}, { replace: true });
    void beginPlanCheckout(selectedPlan);
  }, [beginPlanCheckout, isLoadingAuth, plans, searchParams, setCheckoutNotice, setSearchParams, status]);

  return (
    <PublicLayout>
      <PublicHero
        eyebrow="Launch Pricing"
        title="Flexible plans for growing businesses"
        description="Clear introductory pricing for BizCTRL’s multi-tenant ERP SaaS. Starter begins with a free first month (a 30-day trial); each plan shows its active monthly price, capabilities, and configured operating limits."
      >
        <PublicCta secondary={false} />
      </PublicHero>
      <ContentSection className="pt-0">
        {status === 'loading' && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading available plans">{[0, 1, 2].map((item) => <div key={item} className="h-[34rem] animate-pulse rounded-3xl border border-white/10 bg-white/5" />)}</div>}
        {status === 'ready' && plans.length > 0 && <PublicPricingCards plans={plans} onStartFree={beginPlanCheckout} onContactSales={contactSales} busyPlanId={checkoutPlanId} disabled={isLoadingAuth} enterpriseContactMode />}
        {checkoutNotice && <p role="status" className="mx-auto mt-6 max-w-3xl rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-4 text-center text-sm leading-6 text-cyan-50">{checkoutNotice}</p>}
        {(status === 'error' || (status === 'ready' && plans.length === 0)) && <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-8 text-center"><CreditCard className="mx-auto h-8 w-8 text-cyan-300" /><h2 className="mt-4 text-2xl font-black text-white">Plan details are being finalized</h2><p className="mt-3 leading-7 text-slate-300">BizCTRL does not publish unverified commercial terms. Please start with a free account or contact the BizCTRL team to discuss the current plan catalog.</p><div className="mt-6"><PublicCta /></div></div>}
      </ContentSection>
      <ContentSection className="pt-0">
        <div className="grid gap-5 md:grid-cols-3">{[
          ['Launch Pricing', 'Promotional prices are clearly shown without artificial urgency or an unconfigured expiry date.'],
          ['Billing clarity', 'Starter begins with a free first month (a 30-day trial). After the free month, the configured recurring monthly price applies unless cancelled.'],
          ['Paddle readiness', 'Each plan carries a centralized product concept and an empty provider-price reference until verified Paddle credentials and price IDs are configured.'],
        ].map(([title, description]) => <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></div>)}</div>
      </ContentSection>
    </PublicLayout>
  );
}

const TERMS = [
  ['Service description', 'BizCTRL is a cloud-based multi-tenant ERP SaaS that helps organizations manage selected business operations, including inventory, sales, purchasing, suppliers, people, finance, reporting, and branches. Available capabilities depend on the customer’s active plan, configuration, permissions, and supported modules.'],
  ['Accounts and access', 'Customers are responsible for providing accurate account information, safeguarding credentials, assigning appropriate permissions, and ensuring that authorized users comply with these terms. Account owners are responsible for activity performed through their organization workspace.'],
  ['Subscriptions, billing, and cancellation', 'Paid functionality, billing periods, and applicable limits are shown in the active plan catalog and the account billing area. Subscription changes and cancellations take effect in accordance with the billing status and plan terms displayed to the authorized account owner.'],
  ['Refunds', 'Refund eligibility is governed by the BizCTRL Refund Policy and any applicable commercial terms presented at the time of purchase. Where a commercial refund period has not been published, BizCTRL does not make an implied refund-period commitment.'],
  ['Acceptable use', 'You may not use BizCTRL to violate law, infringe rights, introduce malicious code, interfere with the service, bypass access controls, or access another organization’s workspace or data without authorization.'],
  ['Customer responsibilities', 'Customers are responsible for the legality, accuracy, quality, and rights associated with data they enter into BizCTRL, including employee, customer, supplier, product, inventory, and financial information. Customers should maintain their own records where required by law or internal policy.'],
  ['Intellectual property', 'BizCTRL and its software, branding, documentation, and service content remain the property of their respective rights holders. Customers retain rights to the data they submit to their own workspace, subject to the permissions and service terms that apply.'],
  ['Availability and changes', 'BizCTRL may maintain, update, suspend, or discontinue parts of the service to protect security, improve functionality, meet operational requirements, or address legal obligations. The service is provided subject to availability and may experience maintenance windows or interruptions.'],
  ['Suspension and termination', 'BizCTRL may suspend or terminate access where reasonably necessary to address non-payment, security risk, misuse, legal requirements, or material violations of these terms. Customers may discontinue use and manage subscriptions through the available account processes.'],
  ['Liability limitations', 'To the extent permitted by applicable law, BizCTRL is not responsible for indirect, incidental, special, consequential, or punitive losses arising from use of the service. BizCTRL does not replace professional accounting, tax, legal, employment, or regulatory advice.'],
  ['Changes to these terms', 'BizCTRL may update these terms to reflect service, legal, or operational changes. The current version will be published on this page. Continued use after a revised version becomes effective constitutes acceptance where permitted by law.'],
];

function LegalPage({ title, eyebrow, description, icon: Icon, children }) {
  usePublicPageMetadata(`${title} | BizCTRL`, description);
  return (
    <PublicLayout>
      <PublicHero eyebrow={eyebrow} title={title} description={description}>
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400"><Icon className="h-4 w-4 text-cyan-300" />BizCTRL public policy</div>
      </PublicHero>
      <ContentSection className="pt-0">
        <article className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10">{children}</article>
      </ContentSection>
    </PublicLayout>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" eyebrow="Legal" description="Terms governing access to the BizCTRL multi-tenant ERP SaaS." icon={Scale}>
    <p className="text-sm leading-7 text-slate-300">These Terms of Service govern access to and use of BizCTRL. They are written to describe the available cloud service without making claims about unverified registrations, certifications, or jurisdiction-specific legal status.</p>
    <div className="mt-8 space-y-8">{TERMS.map(([heading, body], index) => <section key={heading}><h2 className="text-xl font-black text-white">{index + 1}. {heading}</h2><p className="mt-3 leading-7 text-slate-300">{body}</p></section>)}</div>
    <section className="mt-8 border-t border-white/10 pt-8"><h2 className="text-xl font-black text-white">Contact information</h2><p className="mt-3 leading-7 text-slate-300">For terms-related inquiries, use the public <Link to="/contact" className="font-semibold text-cyan-300 hover:text-cyan-200">contact page</Link> or the authenticated Support Center available inside BizCTRL.</p></section>
  </LegalPage>;
}

const PRIVACY = [
  ['Information BizCTRL may process', 'BizCTRL may process account details, organization details, user and employee information, customer and supplier records, products, inventory records, transaction and business information, support requests, and other data that authorized users enter or submit to their workspace.'],
  ['Usage data and cookies', 'BizCTRL may process technical and usage information needed to operate, secure, diagnose, and improve the service. Cookies or similar storage technologies may be used for essential functions such as authentication, preferences, and session continuity.'],
  ['Authentication and access', 'BizCTRL uses configured authentication services and access controls to identify users and apply organization, role, and workspace permissions. Customers are responsible for assigning access carefully and promptly removing access when it is no longer required.'],
  ['Payments and third parties', 'If billing is enabled, payment information is handled through the payment method or provider configured for the applicable account. BizCTRL may use third-party infrastructure or service providers where necessary to operate the platform, subject to their applicable terms and privacy practices.'],
  ['Data storage, isolation, and security', 'BizCTRL is designed so that organizations have their own workspace and data context. Reasonable technical and organizational measures are used to support access control and service security; however, no internet-based service can guarantee absolute security.'],
  ['Data retention', 'BizCTRL retains information for as long as needed to provide the service, comply with legal or operational requirements, resolve disputes, enforce agreements, or meet legitimate business needs. Retention periods may vary by data type and account status.'],
  ['Your rights and choices', 'Depending on applicable law, individuals may have rights to request access, correction, deletion, restriction, portability, or objection in relation to personal information. Workspace administrators should handle requests relating to data their organization controls.'],
  ['International transfers', 'BizCTRL or its service providers may process information in locations other than where a customer or user is located. Where required, appropriate safeguards will be considered for international transfers.'],
  ['Policy updates', 'BizCTRL may update this policy as the service, laws, or operational practices change. The current version will be published on this page.'],
];

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" eyebrow="Legal" description="How BizCTRL may process information while providing its multi-tenant ERP SaaS." icon={LockKeyhole}>
    <p className="text-sm leading-7 text-slate-300">This Privacy Policy explains how BizCTRL may process information in connection with its cloud-based ERP service. It describes categories of processing without asserting use of a provider, certification, or data-handling practice that is not configured for the service.</p>
    <div className="mt-8 space-y-8">{PRIVACY.map(([heading, body], index) => <section key={heading}><h2 className="text-xl font-black text-white">{index + 1}. {heading}</h2><p className="mt-3 leading-7 text-slate-300">{body}</p></section>)}</div>
    <section className="mt-8 border-t border-white/10 pt-8"><h2 className="text-xl font-black text-white">Contact</h2><p className="mt-3 leading-7 text-slate-300">To make a privacy inquiry, use the public <Link to="/contact" className="font-semibold text-cyan-300 hover:text-cyan-200">contact page</Link>. Please do not include sensitive account credentials in a public inquiry.</p></section>
  </LegalPage>;
}

const REFUND_SECTIONS = [
  ['Subscription cancellation', 'Authorized account owners can manage an active subscription through the billing area of BizCTRL. Cancellation ends future renewal according to the plan and payment status shown in the account.'],
  ['Refunds', 'BizCTRL does not publish a universal refund period unless an applicable commercial term is explicitly displayed at the time of purchase. Where a refund policy, refund period, or exception applies to a plan, it must be stated in the relevant order, checkout, or commercial agreement.'],
  ['How to request a review', 'If you believe a charge was made in error or you have a billing concern, submit a request through the authenticated Support Center or the public contact route. Include your organization name, billing reference, and a description of the issue, but do not submit credentials or sensitive payment data.'],
  ['Review outcome', 'BizCTRL will review requests against the applicable subscription and payment records. A review does not guarantee a refund, credit, or specific outcome. Any approved adjustment will be communicated through the relevant support or billing channel.'],
  ['Changes to this policy', 'BizCTRL may update this policy when commercial terms are finalized or operational requirements change. The current version will be published on this page.'],
];

export function RefundPage() {
  return <LegalPage title="Refund Policy" eyebrow="Billing policy" description="BizCTRL subscription cancellation and refund-review information." icon={CreditCard}>
    <p className="text-sm leading-7 text-slate-300">This policy explains how BizCTRL handles subscription cancellation and refund reviews without inventing a refund period or commercial term that has not been finalized.</p>
    <div className="mt-8 space-y-8">{REFUND_SECTIONS.map(([heading, body], index) => <section key={heading}><h2 className="text-xl font-black text-white">{index + 1}. {heading}</h2><p className="mt-3 leading-7 text-slate-300">{body}</p></section>)}</div>
  </LegalPage>;
}

export function ContactPage() {
  usePublicPageMetadata('Contact BizCTRL', 'Contact BizCTRL for business inquiries or technical support for the multi-tenant ERP SaaS.');
  const [inquiryType, setInquiryType] = useState('Business inquiry');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState('');
  const supportChannel = useMemo(() => ({
    subject: `[BizCTRL] ${inquiryType}`,
    body: `Inquiry type: ${inquiryType}\n\n${details}`,
  }), [details, inquiryType]);

  const onSubmit = (event) => {
    event.preventDefault();
    setNotice('Your inquiry details are ready. Please share them through the authenticated Support Center or the business contact channel configured by the account owner.');
  };

  return (
    <PublicLayout>
      <PublicHero eyebrow="Contact" title="Talk to the BizCTRL team" description="Use the right channel for your business inquiry or for help with an existing BizCTRL workspace." />
      <ContentSection className="pt-0">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><Building2 className="h-6 w-6 text-cyan-300" /><h2 className="mt-4 text-xl font-black text-white">Business inquiries</h2><p className="mt-2 text-sm leading-6 text-slate-400">Ask about BizCTRL for your organization, teams, branches, or operating model. Explain your business type and the modules you want to evaluate.</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><ShieldCheck className="h-6 w-6 text-cyan-300" /><h2 className="mt-4 text-xl font-black text-white">Technical support</h2><p className="mt-2 text-sm leading-6 text-slate-400">Existing users can sign in to BizCTRL and open a support ticket from the authenticated Support Center. This preserves account context and helps protect workspace information.</p><Button asChild variant="outline" className="mt-4 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/erp-login">Login to BizCTRL</Link></Button></div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6"><Mail className="h-6 w-6 text-amber-300" /><h2 className="mt-4 text-xl font-black text-white">Public support email</h2><p className="mt-2 text-sm leading-6 text-slate-400">A public support email can be added here by the business owner when a verified support inbox is available. BizCTRL does not publish an unverified contact address.</p></div>
          </div>
          <form onSubmit={onSubmit} className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <div className="flex items-center gap-3"><MessageSquare className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black text-white">Contact form</h2><p className="mt-1 text-sm text-slate-400">Choose the purpose of your inquiry and share the relevant details.</p></div></div>
            <label className="mt-7 block text-sm font-semibold text-slate-200">Inquiry type<select value={inquiryType} onChange={(event) => setInquiryType(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-slate-100 outline-none ring-cyan-400 focus:ring-2"><option>Business inquiry</option><option>Technical support</option><option>Billing question</option><option>Privacy request</option></select></label>
            <label className="mt-5 block text-sm font-semibold text-slate-200">Message<textarea required value={details} onChange={(event) => setDetails(event.target.value)} className="mt-2 min-h-40 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-slate-100 outline-none ring-cyan-400 focus:ring-2" placeholder="Tell us how BizCTRL can help. Do not include passwords or payment-card details." /></label>
            <input type="hidden" value={supportChannel.subject} readOnly />
            <Button type="submit" className="mt-6 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">Prepare inquiry</Button>
            {notice && <p role="status" className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm leading-6 text-cyan-100">{notice}</p>}
          </form>
        </div>
      </ContentSection>
      <ContentSection className="pt-0"><div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center"><HelpCircle className="mx-auto h-7 w-7 text-cyan-300" /><h2 className="mt-3 text-2xl font-black text-white">Need account help?</h2><p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-400">The authenticated Support Center is the best route for users who need help with a BizCTRL account or workspace.</p><Button asChild variant="outline" className="mt-6 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/erp-login">Go to Login</Link></Button></div></ContentSection>
    </PublicLayout>
  );
}

