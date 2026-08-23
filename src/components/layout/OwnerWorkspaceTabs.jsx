import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { ERP_NAV_GROUPS } from './ERPSidebar';
import { useRole, ROLES } from '@/lib/RoleContext';
import { cn } from '@/lib/utils';

const DEFAULT_TAB_PATH = '/owner-command-center';
const DEFAULT_TAB = { path: DEFAULT_TAB_PATH, label: 'Dashboard', permanent: true };

const TAB_PATH_ALIASES = {
  '/dashboard': DEFAULT_TAB_PATH,
  '/sales-invoices': '/sales/invoices',
};

const TAB_LABELS = new Map([
  [DEFAULT_TAB_PATH, DEFAULT_TAB.label],
  ['/sales/invoices', 'Sales Invoices'],
  ...ERP_NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.path, item.label])),
]);

function canonicalPath(pathname) {
  return TAB_PATH_ALIASES[pathname] || pathname;
}

function readablePathLabel(pathname) {
  const segment = pathname.split('/').filter(Boolean).at(-1) || 'Dashboard';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createTab(path) {
  return {
    path,
    label: TAB_LABELS.get(path) || readablePathLabel(path),
    permanent: path === DEFAULT_TAB_PATH,
  };
}

function OwnerTabStrip({ tabs, activePath, onActivate, onClose }) {
  return (
    <nav
      className="sticky top-0 z-30 -mx-4 mb-4 w-[calc(100%+2rem)] min-w-0 max-w-none border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6"
      aria-label="Open workspace pages"
    >
      <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 text-sm transition-colors',
                active
                  ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
                  : 'border-transparent bg-muted/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => onActivate(tab.path)}
                className="min-w-0 max-w-40 truncate px-1 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </button>
              {!tab.permanent && (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onClose(tab.path); }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Close ${tab.label} tab`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Keeps opened Owner ERP route elements mounted in hidden panels so module-local
 * state (filters, forms, loaded data, and expanded UI) persists until its tab closes.
 * React Router remains the source of truth for the active location and browser history.
 */
export default function OwnerWorkspaceTabs() {
  const outlet = useOutlet();
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useRole();
  const cacheRef = useRef(new Map());
  const scrollPositionsRef = useRef(new Map());
  const previousActivePathRef = useRef(DEFAULT_TAB_PATH);
  const tabsRef = useRef([DEFAULT_TAB]);
  const mruPathsRef = useRef([DEFAULT_TAB_PATH]);
  const [tabs, setTabs] = useState([DEFAULT_TAB]);
  const [mruPaths, setMruPaths] = useState([DEFAULT_TAB_PATH]);

  const activePath = canonicalPath(location.pathname);
  const ownerWorkspace = role === ROLES.OWNER;

  if (ownerWorkspace && outlet && !cacheRef.current.has(activePath)) {
    cacheRef.current.set(activePath, outlet);
  }

  useEffect(() => {
    if (!ownerWorkspace) return;

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.some((tab) => tab.path === activePath)
        ? currentTabs
        : [...currentTabs, createTab(activePath)];
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    setMruPaths((currentPaths) => {
      const nextPaths = [...currentPaths.filter((path) => path !== activePath), activePath];
      mruPathsRef.current = nextPaths;
      return nextPaths;
    });
  }, [activePath, ownerWorkspace]);

  useLayoutEffect(() => {
    if (!ownerWorkspace) return undefined;
    const viewport = document.querySelector('[data-erp-page-viewport="true"]');
    if (!(viewport instanceof HTMLElement)) return undefined;

    const previousPath = previousActivePathRef.current;
    scrollPositionsRef.current.set(previousPath, viewport.scrollTop);
    viewport.scrollTop = scrollPositionsRef.current.get(activePath) || 0;
    previousActivePathRef.current = activePath;

    return () => {
      scrollPositionsRef.current.set(activePath, viewport.scrollTop);
    };
  }, [activePath, ownerWorkspace]);

  const activateTab = useCallback((path) => {
    if (path !== activePath) navigate(path);
  }, [activePath, navigate]);

  const closeTab = useCallback((path) => {
    if (path === DEFAULT_TAB_PATH) return;

    const remainingTabs = tabsRef.current.filter((tab) => tab.path !== path);
    const remainingPaths = new Set(remainingTabs.map((tab) => tab.path));
    const nextMruPaths = mruPathsRef.current.filter((candidate) => candidate !== path && remainingPaths.has(candidate));
    const nextPath = nextMruPaths.at(-1) || DEFAULT_TAB_PATH;

    tabsRef.current = remainingTabs;
    mruPathsRef.current = nextMruPaths;
    cacheRef.current.delete(path);
    scrollPositionsRef.current.delete(path);
    setTabs(remainingTabs);
    setMruPaths(nextMruPaths);

    if (path === activePath) navigate(nextPath, { replace: true });
  }, [activePath, navigate]);

  const mountedTabs = useMemo(() => tabs.map((tab) => ({
    ...tab,
    element: cacheRef.current.get(tab.path),
  })), [tabs]);

  if (!ownerWorkspace) return outlet;

  return (
    <div className="w-full min-w-0 max-w-full">
      <OwnerTabStrip tabs={tabs} activePath={activePath} onActivate={activateTab} onClose={closeTab} />
      <div className="w-full min-w-0 max-w-full">
        {mountedTabs.map((tab) => (
          <section
            key={tab.path}
            hidden={tab.path !== activePath}
            aria-hidden={tab.path !== activePath}
            className="w-full min-w-0 max-w-full"
            data-owner-workspace-page={tab.path}
          >
            {tab.element}
          </section>
        ))}
      </div>
    </div>
  );
}
