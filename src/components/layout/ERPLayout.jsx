/**
 * ERPLayout — Enterprise app shell.
 *
 * Desktop:  ERPSidebar (left) + ERPHeader (top) + content
 * Mobile:   ERPHeader (top) + content + BottomNav (bottom)
 *
 * The sidebar is hidden on mobile; BottomNav handles mobile navigation.
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ERPSidebar from './ERPSidebar';
import ERPHeader from './ERPHeader';
import BottomNav from './BottomNav';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { getWorkspaceModuleForPath, isWorkspacePathEnabled } from '@/lib/workspaceCustomization';

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
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role } = useRole();
  const { configuration, canCustomize } = useWorkspaceCustomization();

  const showSidebar = ERP_SIDEBAR_ROLES.includes(role);
  const activeModule = getWorkspaceModuleForPath(location.pathname);
  const moduleEnabled = isWorkspacePathEnabled(configuration, location.pathname);

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
          {moduleEnabled ? children : (
            <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center p-4 text-center sm:p-8" aria-labelledby="disabled-module-title">
              <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Settings2 className="h-7 w-7" /></span>
                <h1 id="disabled-module-title" className="mt-4 text-xl font-black text-slate-950 dark:text-white">{activeModule?.label || 'This module'} is not enabled</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">This organization removed the module from its active ERP workspace. Existing records remain preserved and permissions are unchanged.</p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  <Link to="/owner-command-center" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Return to dashboard</Link>
                  {canCustomize && <Link to="/customize-workspace" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Configure workspace</Link>}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Mobile BottomNav */}
      <BottomNav />
    </div>
  );
}
