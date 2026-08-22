import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Plus,
  ShoppingCart,
  Wallet,
  ArrowDownLeft,
  Truck,
  Banknote,
} from 'lucide-react';

export default function QuickActionsDock() {
  const { t } = useLanguage();
  const location = useLocation();

  const isDashboard = location.pathname === '/owner-command-center'
    || location.pathname === '/manager-dashboard'
    || location.pathname === '/';

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
    <section
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] z-40 w-full max-w-full lg:static lg:mt-4 lg:z-auto"
      aria-label="Quick Shortcuts"
    >
      <div className="pointer-events-auto mx-auto h-[var(--quick-shortcuts-height)] w-full max-w-2xl border-t border-border/70 bg-card/95 px-2 shadow-[0_-8px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:rounded-xl lg:border lg:shadow-sm">
        <h2 className="sr-only">Quick Shortcuts</h2>
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:thin] lg:justify-center lg:overflow-x-visible">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex h-full w-[82px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center transition-colors hover:bg-muted active:scale-95"
            >
              <div className={`${action.color} rounded-lg p-2 text-white shadow-sm`}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="w-full truncate text-[10px] font-bold leading-tight text-foreground">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
