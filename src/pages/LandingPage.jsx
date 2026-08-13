import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Building2, ChefHat, ShoppingBag, Warehouse, Factory,
  Pill, Stethoscope, Package, Wrench, BarChart3,
  Users, DollarSign, ShieldCheck, Globe,
  ArrowRight, CheckCircle2, Zap,
  LayoutDashboard, Truck, Receipt, Star,
  ChevronRight, Menu, X
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

const TESTIMONIALS = [
  {
    name: 'Ahmed Al-Rashidi',
    role: 'Owner, Al-Nakheel Restaurant Group',
    text: 'BizCTRL transformed how we manage 6 branches. The owner dashboard gives me everything I need in seconds.',
    stars: 5,
  },
  {
    name: 'Sara Khalil',
    role: 'Manager, Bloom Pharmacy Chain',
    text: 'The inventory expiry tracking and supplier approval system saved us countless hours every week.',
    stars: 5,
  },
  {
    name: 'Omar Farouk',
    role: 'Director, FastTrack Wholesale',
    text: 'Finally an ERP that works for wholesale. The purchase order and supplier portal features are outstanding.',
    stars: 5,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
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
            <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
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
            <a href="#testimonials" className="block text-slate-300 hover:text-white text-sm py-1">Testimonials</a>
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
            {['No credit card required', 'Free 14-day trial', 'Cancel anytime', 'GDPR compliant'].map(item => (
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

      {/* ── Testimonials ── */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Trusted by Business Owners
          </h2>
          <p className="text-slate-400">Join thousands of businesses already running on BizCTRL.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map(({ name, role, text, stars }) => (
            <div key={name} className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">"{text}"</p>
              <div>
                <p className="text-white font-bold text-sm">{name}</p>
                <p className="text-slate-500 text-xs">{role}</p>
              </div>
            </div>
          ))}
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
            Start your free 14-day trial today. No credit card required. Set up in minutes.
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
