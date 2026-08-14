import React from 'react';
import { BadgeCheck, Clock3, CreditCard, FlaskConical, ShieldCheck, Users } from 'lucide-react';

const plans = [
  ['Free', '$0', '1 restaurant · 1 branch', '5 employees · 5 users'],
  ['Starter', '$20', '1 restaurant · 3 branches', '20 employees · 20 users'],
  ['Growth', '$40', '3 restaurants · 10 branches', '75 employees · 75 users'],
  ['Enterprise', '$100', '10 restaurants · 50 branches', '250 employees · 250 users'],
];

export default function BillingVisualHarness() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-10" data-testid="non-production-billing-harness">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><FlaskConical className="me-2 inline h-4 w-4" /><strong>TEST ONLY — Non-production visual validation.</strong> This route creates no account, calls no payment provider, and is omitted from the production route registry.</div>
        <section className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-5 shadow-xl shadow-cyan-950/30 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Billing & Subscription · TEST OWNER VIEW</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Growth <span className="ms-2 inline-flex rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">ACTIVE</span></h1><p className="mt-2 text-sm text-slate-400">Owner controls are server-authorized in the real interface. This visual fixture contains no live actions.</p></div><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div><p className="text-slate-500">Trial</p><p className="font-semibold">30 days</p></div><div><p className="text-slate-500">Renewal</p><p className="font-semibold">In 30 days</p></div><div><p className="text-slate-500">Access</p><p className="font-semibold text-emerald-300">Available</p></div></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Restaurants','1 / 3'],['Branches','3 / 10'],['Employees','20 / 75'],['PDF reports','120 / 500']].map(([label,value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>
        </section>
        <section><div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-bold">Available plans</h2></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{plans.map(([name, price, scope, users]) => <article key={name} className={`rounded-2xl border p-5 ${name === 'Growth' ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-slate-900'}`}><h3 className="font-bold">{name}</h3><p className="mt-2 text-3xl font-black">{price}<span className="text-sm font-normal text-slate-400"> / month</span></p><ul className="mt-4 space-y-2 text-sm text-slate-400"><li>{scope}</li><li>{users}</li><li>Server-enforced feature limits</li></ul><button type="button" disabled className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300"><BadgeCheck className="h-4 w-4" />TEST FIXTURE ONLY</button></article>)}</div></section>
        <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-emerald-300" />Owner versus Manager</h2><p className="mt-3 text-sm text-slate-400">The live backend accepts billing actions only from an approved owner. A Manager receives `BILLING_OWNER_REQUIRED` and cannot use TEST MODE procedures.</p></div><div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="flex items-center gap-2 font-bold"><Users className="h-5 w-5 text-cyan-300" />TEST MODE safety</h2><p className="mt-3 text-sm text-slate-400">The production setting defaults to disabled. Simulations are labeled TEST ONLY, are retained as test records, and never call an external provider.</p></div></section>
        <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" />Visual validation fixture: responsive only, no credentials and no real payment access.</p>
      </div>
    </main>
  );
}
