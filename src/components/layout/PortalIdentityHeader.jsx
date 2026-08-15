import React from 'react';
import { Building2, Crown } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import { useLanguage } from '@/lib/LanguageContext';

export default function PortalIdentityHeader() {
  const { portalIdentity, loadingPortalIdentity } = useTenant();
  const { modeIcon, modeLabel } = useBusinessMode();
  const { translateLiteral, t } = useLanguage();

  if (loadingPortalIdentity || !portalIdentity?.restaurant_id) return null;

  const portalName = translateLiteral(modeLabel || portalIdentity.portal_name);
  const ownerName = portalIdentity.owner_name || '—';

  return (
    <section className="min-w-0 max-w-[44vw] sm:max-w-none" aria-label={`${portalName} ${t('owner')}`}>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm" aria-hidden="true">
          {modeIcon}
        </span>
        <span className="truncate text-xs font-semibold text-foreground sm:text-sm">{portalName}</span>
        <span className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <Crown className="mr-1 h-3 w-3" aria-hidden="true" />{t('owner')}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
        <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0">{t('owner')}:</span>
        <span className="truncate font-medium text-foreground">{ownerName}</span>
      </div>
    </section>
  );
}
