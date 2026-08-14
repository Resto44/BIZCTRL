/**
 * ERPHeader — Enterprise top header bar.
 *
 * Features:
 *   - Breadcrumb navigation
 *   - Global search (cmd+k)
 *   - Notification center bell
 *   - Favorite toggle for current page
 *   - Dark mode toggle
 *   - Restaurant / branch selector
 *   - User avatar + role badge
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search, Star, Sun, Moon, ChevronRight, Settings, Menu, X,
} from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useERPNavigation } from '@/hooks/useERPNavigation';
import { ERP_NAV_GROUPS } from './ERPSidebar';
import ModeBadge from '@/components/shared/ModeBadge';
import LogoutButton from './LogoutButton';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function ERPBreadcrumb() {
  const location = useLocation();
  const { translateLiteral } = useLanguage();
  const allItems = useMemo(() => ERP_NAV_GROUPS.flatMap(g => g.items), []);

  const crumbs = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean);
    const result = [{ label: translateLiteral('Home'), path: '/' }];
    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      const match = allItems.find(i => i.path === accumulated || i.path.startsWith(accumulated));
      if (match) {
        result.push({ label: translateLiteral(match.label), path: accumulated });
      } else {
        result.push({
          label: part.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          path: accumulated,
        });
      }
    }
    return result;
  }, [location.pathname, allItems, translateLiteral]);

  if (crumbs.length <= 1) return null;

  return (
    <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={crumb.path}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-40" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium capitalize">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="hover:text-foreground transition-colors capitalize"
            >
              {crumb.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ─── Global Search ────────────────────────────────────────────────────────────
function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const { translateLiteral } = useLanguage();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const { can } = useRole();

  const allItems = useMemo(
    () => ERP_NAV_GROUPS.flatMap(g => g.items).filter(i => !i.permission || can[i.permission]),
    [can]
  );

  const results = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 8);
    const q = query.toLowerCase();
    return allItems.filter(i => i.label.toLowerCase().includes(q)).slice(0, 10);
  }, [query, allItems]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery('');
  }, [open]);

  const handleSelect = useCallback((path) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-muted-foreground w-48 justify-start text-xs h-8"
      >
        <Search className="w-3.5 h-3.5" />
        <span>{translateLiteral('Search...')}</span>
        <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border font-mono">
          ⌘K
        </kbd>
      </Button>

      {/* Mobile search icon */}
      <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setOpen(true)}>
        <Search className="w-4 h-4" />
      </Button>

      {/* Search overlay */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={translateLiteral('Search pages, modules, actions...')}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{translateLiteral('No results found')}</p>
              ) : (
                results.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleSelect(item.path)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-foreground">{translateLiteral(item.label)}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">{item.path}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
              <span><kbd className="bg-muted px-1 rounded">↑↓</kbd> {translateLiteral('navigate')}</span>
              <span><kbd className="bg-muted px-1 rounded">↵</kbd> {translateLiteral('open')}</span>
              <span><kbd className="bg-muted px-1 rounded">esc</kbd> {translateLiteral('close')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Favorite toggle ──────────────────────────────────────────────────────────
function FavoriteToggle() {
  const location = useLocation();
  const { translateLiteral } = useLanguage();
  const { favorites, toggleFavorite } = useERPNavigation();
  const allItems = useMemo(() => ERP_NAV_GROUPS.flatMap(g => g.items), []);

  const currentItem = useMemo(
    () => allItems.find(i => i.path !== '/' && location.pathname.startsWith(i.path)),
    [location.pathname, allItems]
  );

  if (!currentItem) return null;

  const isFav = favorites.some(f => f.path === currentItem.path);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-warning"
      onClick={() => toggleFavorite(currentItem)}
      title={translateLiteral(isFav ? 'Remove from favorites' : 'Add to favorites')}
    >
      {isFav
        ? <Star className="w-4 h-4 fill-warning text-warning" />
        : <Star className="w-4 h-4" />
      }
    </Button>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark'
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />
      }
    </Button>
  );
}

// ─── User menu ────────────────────────────────────────────────────────────────
function UserMenu() {
  const { user } = useAuth();
  const { t, translateLabel } = useLanguage();
  const { role } = useRole();
  const navigate = useNavigate();

  const initials = useMemo(() => {
    const name = user?.full_name || user?.email || '';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }, [user]);

  const ROLE_COLORS = {
    owner: 'bg-violet-500',
    general_manager: 'bg-blue-500',
    manager: 'bg-emerald-500',
    cashier: 'bg-cyan-500',
    accountant: 'bg-indigo-500',
    procurement: 'bg-orange-500',
    warehouse: 'bg-amber-500',
    delivery: 'bg-sky-500',
  };

  const avatarColor = ROLE_COLORS[role] || 'bg-primary';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted transition-colors">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
            avatarColor
          )}>
            {initials}
          </div>
          <div className="hidden md:flex flex-col items-start">
            <span className="text-xs font-medium text-foreground leading-tight truncate max-w-[100px]">
              {user?.full_name || user?.email?.split('@')[0] || 'User'}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{translateLabel(role, role)}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings className="w-3.5 h-3.5 mr-2" /> {t('settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <LogoutButton variant="menu-item" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main ERPHeader ───────────────────────────────────────────────────────────
export default function ERPHeader({ onMobileMenuToggle }) {
  const { role } = useRole();
  const { user } = useAuth();
  const isSuperAdmin = user?.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  return (
    <header className="sticky top-0 z-50 h-[60px] bg-card/95 backdrop-blur-md border-b border-border flex items-center px-4 gap-3 shrink-0">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-8 w-8"
        onClick={onMobileMenuToggle}
      >
        <Menu className="w-4 h-4" />
      </Button>

      {/* Breadcrumb */}
      <ERPBreadcrumb />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <GlobalSearch />
        <FavoriteToggle />
        <LanguageSwitcher />
        <ThemeToggle />
        <ModeBadge size="xs" />
        {isSuperAdmin && (
          <Link
            to="/super-admin"
            className="hidden md:flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200 transition-colors dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800"
          >
            SA
          </Link>
        )}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
