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

function useAppViewportLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;

    const { body, documentElement } = document;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
      rootOverflow: documentElement.style.overflow,
      rootOverscroll: documentElement.style.overscrollBehavior,
      rootTouchAction: documentElement.style.touchAction,
    };

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'pan-y';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    documentElement.style.touchAction = 'pan-y';

    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      body.style.touchAction = previous.bodyTouchAction;
      documentElement.style.overflow = previous.rootOverflow;
      documentElement.style.overscrollBehavior = previous.rootOverscroll;
      documentElement.style.touchAction = previous.rootTouchAction;
    };
  }, [locked]);
}

export default function ERPLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role } = useRole();

  const showSidebar = ERP_SIDEBAR_ROLES.includes(role);

  // The app shell owns the viewport. Individual pages may scroll inside <main>,
  // but the browser document itself should never become the scroller.
  useAppViewportLock(true);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousRootOverflow = documentElement.style.overflow;
    const previousRootOverscrollBehavior = documentElement.style.overscrollBehavior;
    const previousBodyTouchAction = body.style.touchAction;
    const previousRootTouchAction = documentElement.style.touchAction;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'pan-y';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    documentElement.style.touchAction = 'pan-y';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overflow = previousRootOverflow;
      documentElement.style.overscrollBehavior = previousRootOverscrollBehavior;
      documentElement.style.touchAction = previousRootTouchAction;
    };
  }, [mobileMenuOpen]);

  return (
    <div className="erp-layout flex h-dvh max-h-dvh w-full min-w-0 max-w-full overflow-hidden overscroll-none bg-background">
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

      {/* Main content area */}
      <div className="flex h-dvh min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <ERPHeader onMobileMenuToggle={() => setMobileMenuOpen(o => !o)} />

        {/* Page content: this is the only vertical page scroller. */}
        <main
          data-erp-page-viewport="true"
          className={cn(
            'min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain',
            '[-webkit-overflow-scrolling:touch]',
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
