import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Plus,
  ShoppingCart,
  Wallet,
  ArrowDownLeft,
  Truck,
  Banknote
} from 'lucide-react';

export default function QuickActionsDock() {
  const { t } = useLanguage();
  const location = useLocation();

  // Only show on Dashboard pages
  const isDashboard = location.pathname === '/owner-command-center' || 
                      location.pathname === '/manager-dashboard' ||
                      location.pathname === '/';

  if (!isDashboard) return null;

  const actions = [
    { to: '/sales', label: t('add_sales') || 'Add Sales', icon: Plus, color: 'bg-emerald-500' },
    { to: '/enterprise-purchases', label: t('add_purchase') || 'Add Purchase', icon: ShoppingCart, color: 'bg-blue-500' },
    { to: '/cash-register', label: t('cash_register') || 'Cash Register', icon: Banknote, color: 'bg-indigo-500' },
    { to: '/expenses', label: t('add_expense') || 'Add Expense', icon: Wallet, color: 'bg-amber-500' },
    { to: '/debts', label: t('receive_debt') || 'Receive Debt', icon: ArrowDownLeft, color: 'bg-cyan-500' },
    { to: '/suppliers', label: t('supplier_payment') || 'Supplier Payment', icon: Truck, color: 'bg-orange-500' },
  ];

  return (
    <div className="fixed inset-x-0 z-[9999] max-w-full pointer-events-none"
         style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="mx-auto w-full max-w-2xl px-3 pointer-events-auto sm:px-4">
        <div className="w-full max-w-full overflow-hidden rounded-t-2xl border-x border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 p-3 sm:flex sm:gap-3 sm:overflow-x-auto sm:snap-x sm:snap-mandatory">
            {actions.map((action, idx) => (
              <Link
                key={idx}
                to={action.to}
                className="flex w-full min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-0.5 text-center transition-transform active:scale-95 sm:w-auto sm:min-w-[72px] sm:snap-center"
              >
                <div className={`${action.color} p-2.5 rounded-xl text-white shadow-lg`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="w-full break-words px-1 text-[10px] font-bold leading-tight">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
