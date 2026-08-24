import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Plus,
  ShoppingCart,
  Wallet,
  ArrowDownLeft,
  Truck,
  Banknote,
  Sparkles,
  Building2,
  Settings2,
} from 'lucide-react';

export default function QuickActionsDock({ onOpenCopilot, onAddBranch, onCustomizeSalesClosing }) {
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
    ...(onAddBranch ? [{ id: 'add-branch', label: 'Add Branch', subtitle: 'Create a branch for this restaurant.', icon: Building2, color: 'bg-violet-500', onClick: onAddBranch }] : []),
    ...(onCustomizeSalesClosing ? [{ id: 'sales-closing-customization', label: 'Customize Closing', subtitle: 'Configure sales-closing sources and fields.', icon: Settings2, color: 'bg-slate-700', onClick: onCustomizeSalesClosing }] : []),
    { to: '/debts', label: t('receive_debt') || 'Receive Debt', icon: ArrowDownLeft, color: 'bg-cyan-500' },
    { to: '/suppliers', label: t('supplier_payment') || 'Supplier Payment', icon: Truck, color: 'bg-orange-500' },
    ...(onOpenCopilot ? [{ id: 'ai-copilot', label: 'AI Copilot', subtitle: 'Ask anything about your business or BizCTRL.', icon: Sparkles, color: 'bg-gradient-to-br from-violet-600 to-cyan-500', onClick: onOpenCopilot }] : []),
  ];

  return (
    <section
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] z-40 w-full max-w-full lg:static lg:mt-4 lg:z-auto"
      aria-label="Quick Shortcuts"
    >
      <div className="pointer-events-auto mx-auto h-[var(--quick-shortcuts-height)] w-full max-w-2xl border-t border-border/70 bg-card/95 px-2 shadow-[0_-8px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:rounded-xl lg:border lg:shadow-sm">
        <h2 className="sr-only">Quick Shortcuts</h2>
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:thin] lg:justify-center lg:overflow-x-visible">
          {actions.map((action) => {
            const content = <>
              <div className={`${action.color} rounded-lg p-2 text-white shadow-sm`}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="w-full truncate text-[10px] font-bold leading-tight text-foreground">{action.label}</span>
              {action.subtitle && <span className="w-full truncate text-[8px] leading-tight text-muted-foreground">{action.subtitle}</span>}
            </>;
            const className = "flex h-full w-[82px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center transition-colors hover:bg-muted active:scale-95";
            return action.onClick ? (
              <button key={action.id} type="button" className={className} onClick={action.onClick} aria-label={`${action.label}: ${action.subtitle}`}>
                {content}
              </button>
            ) : (
              <Link key={action.to} to={action.to} className={className}>{content}</Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
