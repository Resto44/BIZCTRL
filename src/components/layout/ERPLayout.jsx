/**
 * ERPLayout — Enterprise app shell.
 *
 * Desktop:  ERPSidebar (left) + ERPHeader (top) + content
 * Mobile:   ERPHeader (top) + content + BottomNav (bottom)
 *
 * The sidebar is hidden on mobile; BottomNav handles mobile navigation.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import ERPSidebar from './ERPSidebar';
import ERPHeader from './ERPHeader';
import BottomNav from './BottomNav';
import { useRole, ROLES } from '@/lib/RoleContext';

const ERP_SIDEBAR_ROLES = [
  ROLES.OWNER,
  ROLES.GENERAL_MANAGER,
  ROLES.MANAGER,
  'cashier',
  'accountant',
  'procurement',
  'warehouse',
  'auditor',
  'read_only',
];

export default function ERPLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role } = useRole();
  const showSidebar = ERP_SIDEBAR_ROLES.includes(role);

  return (
    <div className="erp-layout flex h-dvh max-h-dvh w-full min-w-0 max-w-full overflow-hidden overscroll-none bg-background">
      {showSidebar && (
        <ERPSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
        />
      )}

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default bg-black/50 lg:hidden"
            aria-label="Close navigation drawer"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[110] h-dvh w-[min(86vw,420px)] max-w-full min-w-0 overflow-hidden lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation drawer">
            <ERPSidebar
              collapsed={false}
              mobile
              onToggle={() => setMobileMenuOpen(false)}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex h-dvh min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <ERPHeader onMobileMenuToggle={() => setMobileMenuOpen(o => !o)} />
        <main
          data-erp-page-viewport="true"
          className={cn(
            'min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain',
            '[-webkit-overflow-scrolling:touch]',
            'pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem) lg:pb-0]'
          )}
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
