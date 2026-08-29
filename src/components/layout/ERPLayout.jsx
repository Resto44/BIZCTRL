/**
 * ERPLayout — Enterprise app shell.
 *
 * Desktop:  ERPSidebar (left) + ERPHeader (top) + content
 * Mobile:   ERPHeader (top) + content + BottomNav (bottom)
 *
 * The sidebar is hidden on mobile; BottomNav handles mobile navigation.
 */
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import ERPSidebar from './ERPSidebar';
import ERPHeader from './ERPHeader';
import BottomNav from './BottomNav';
import { useRole, ROLES } from '@/lib/RoleContext';

// Roles that use the full ERP sidebar layout
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

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousRootOverflow = documentElement.style.overflow;
    const previousRootOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overflow = previousRootOverflow;
      documentElement.style.overscrollBehavior = previousRootOverscrollBehavior;
    };
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-dvh w-full min-w-0 max-w-full bg-background">
      {/* Desktop Sidebar */}
      {showSidebar && (
        <ERPSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
        />
      )}

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default touch-none overscroll-none bg-black/50 lg:hidden"
            aria-label="Close navigation drawer"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[110] w-[min(90vw,440px)] max-w-full min-w-0 animate-in slide-in-from-left duration-200 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation drawer">
            <ERPSidebar
              collapsed={false}
              mobile
              onToggle={() => setMobileMenuOpen(false)}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex min-h-dvh min-w-0 max-w-full flex-1 flex-col">
        <ERPHeader onMobileMenuToggle={() => setMobileMenuOpen(o => !o)} />

        {/* Page content */}
        <main
          data-erp-page-viewport="true"
          className={cn(
            'flex-1 min-w-0 max-w-full overflow-y-auto',
            // Bottom padding on mobile accounts for BottomNav and iPhone safe-area.
            'pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)] lg:pb-0'
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile BottomNav */}
      <BottomNav />
    </div>
  );
}
