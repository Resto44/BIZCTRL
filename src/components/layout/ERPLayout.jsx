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

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop Sidebar */}
      {showSidebar && (
        <ERPSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
        />
      )}

      {/* Mobile sidebar overlay */}
      {showSidebar && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/50 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-[110] lg:hidden">
            <ERPSidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-dvh">
        <ERPHeader onMobileMenuToggle={() => setMobileMenuOpen(o => !o)} />

        {/* Page content */}
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            // Bottom padding on mobile for BottomNav
            'pb-[var(--bottom-nav-height)] lg:pb-0'
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
