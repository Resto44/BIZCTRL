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

  // Quick Shortcuts are only normal dashboard content; they never float above it.
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
    <section className="w-full min-w-0 max-w-full rounded-2xl border border-border/50 bg-card p-3 shadow-sm sm:p-4" aria-label="Quick Shortcuts">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-bold text-foreground">Quick Shortcuts</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Create and review daily ERP records.</p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-background px-2 py-3 text-center transition-colors hover:bg-muted active:scale-[0.98]"
          >
            <div className={`${action.color} rounded-xl p-2.5 text-white shadow-sm`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="w-full break-words text-[11px] font-bold leading-tight text-foreground">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
