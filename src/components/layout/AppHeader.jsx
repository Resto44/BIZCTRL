import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Shield, ChevronDown } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import LogoutButton from '@/components/layout/LogoutButton';
import ModeBadge from '@/components/shared/ModeBadge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

const ROLE_BADGE = {
  [ROLES.OWNER]:    { label: { en: 'Owner', ar: 'المالك', fa: 'مالک' }, color: 'bg-violet-100 text-violet-700 border-violet-200' },
  [ROLES.MANAGER]:  { label: { en: 'Manager', ar: 'مدير فرع', fa: 'مدیر' }, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  [ROLES.EMPLOYEE]: { label: { en: 'Employee', ar: 'موظف', fa: 'کارمند' }, color: 'bg-slate-100 text-slate-600 border-slate-200' },
  [ROLES.SPONSOR]:  { label: { en: 'Sponsor', ar: 'كفيل', fa: 'کفیل' }, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  [ROLES.CUSTOMER]: { label: { en: 'Customer', ar: 'عميل', fa: 'مشتری' }, color: 'bg-pink-100 text-pink-700 border-pink-200' },
};

function RestaurantSelector() {
  const { restaurants, activeRestaurant, setActiveRestaurant, loadingRestaurants, branches } = useTenant();
  const { lang } = useLanguage();
  const { isRetail } = useBusinessMode();

  if (loadingRestaurants) {
    return <div className="h-8 w-36 bg-muted animate-pulse rounded-lg" />;
  }

  const activeBranch = branches?.[0];

  if (restaurants.length === 0) {
    return (
      <Link to="/restaurants"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors">
        <Building2 className="w-4 h-4" />
        {lang === 'ar' ? 'إعداد العمل' : lang === 'fa' ? 'راه‌اندازی کسب‌وکار' : 'Setup Business'}
      </Link>
    );
  }

  // Gradient based on mode
  const gradientClass = isRetail
    ? 'from-blue-600 to-indigo-600'
    : 'from-orange-500 to-amber-500';

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Business logo / initial */}
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm`}>
        {activeRestaurant?.name?.charAt(0)?.toUpperCase() || (isRetail ? '🏪' : '🍽')}
      </div>

      <div className="flex flex-col min-w-0">
        {restaurants.length === 1 ? (
          <span className="text-sm font-bold text-foreground truncate max-w-[130px] leading-tight">
            {activeRestaurant?.name}
          </span>
        ) : (
          <Select value={activeRestaurant?.id || ''} onValueChange={setActiveRestaurant}>
            <SelectTrigger className="h-auto border-none shadow-none p-0 gap-1 text-sm font-bold text-foreground focus:ring-0 max-w-[140px]">
              <SelectValue />
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent>
              {restaurants.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeBranch && (
          <span className="text-[11px] text-muted-foreground leading-tight truncate max-w-[130px]">
            {activeBranch.name}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AppHeader() {
  const { user } = useAuth();
  const { role } = useRole();
  const { lang } = useLanguage();
  const badge = ROLE_BADGE[role];
  const isSuperAdmin = user?.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  // Stripped header for sponsor
  const isLimited = role === ROLES.SPONSOR;

  if (isLimited) {
    const limitedTitle = role === ROLES.SPONSOR
      ? { en: 'Sponsor Portal', ar: 'بوابة الكفيل', fa: 'پورتال کفیل' }
      : { en: 'Daily Upload', ar: 'رفع البيانات', fa: 'ثبت روزانه' };
    return (
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">{limitedTitle[lang] || limitedTitle.en}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <LogoutButton variant="icon" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
      <div className="max-w-lg mx-auto px-3 h-16 flex items-center justify-between gap-2">
        {/* Left: Business brand */}
        <RestaurantSelector />

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Business Mode badge */}
          <ModeBadge size="xs" />

          {/* Role badge */}
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${badge.color} hidden xs:inline-flex`}>
              {badge.label[lang] || badge.label.en}
            </span>
          )}

          {/* Super admin link */}
          {isSuperAdmin && (
            <Link
              to="/super-admin"
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200 transition-colors"
            >
              <Shield className="w-3 h-3" />
              SA
            </Link>
          )}

          <NotificationBell />
          <LogoutButton variant="icon" />
        </div>
      </div>
    </header>
  );
}
