/**
 * useNotify — React hook that pre-fills orgId, restaurantId, actorEmail, actorName
 * so pages don't need to pass them manually.
 */
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import { notify } from '@/lib/notificationEngine';

export function useNotify() {
  const { orgId, activeRestaurant } = useTenant();
  const { user } = useAuth();
  const { currency, translateLiteral } = useLanguage();

  const base = {
    orgId,
    restaurantId: activeRestaurant?.id,
    actorEmail: user?.email,
    actorName: user?.full_name,
    currency,
  };

  return {
    success: (message) => toast.success(translateLiteral(message)),
    error: (message) => toast.error(translateLiteral(message)),
    info: (message) => toast.info(translateLiteral(message)),
    warning: (message) => toast.warning(translateLiteral(message)),
    sale:              (opts) => notify.sale({ ...base, ...opts }),
    purchase:          (opts) => notify.purchase({ ...base, ...opts }),
    expense:           (opts) => notify.expense({ ...base, ...opts }),
    salaryAdvance:     (opts) => notify.salaryAdvance({ ...base, ...opts }),
    salaryPayment:     (opts) => notify.salaryPayment({ ...base, ...opts }),
    lowStock:          (opts) => notify.lowStock({ ...base, ...opts }),
    creditCollection:  (opts) => notify.creditCollection({ ...base, ...opts }),
    branchToOwner:     (opts) => notify.branchToOwner({ ...base, ...opts }),
    ownerToBranch:     (opts) => notify.ownerToBranch({ ...base, ...opts }),
    priceChange:       (opts) => notify.priceChange({ ...base, ...opts }),
    profitDrop:        (opts) => notify.profitDrop({ ...base, ...opts }),
    pdfExport:         (opts) => notify.pdfExport({ ...base, ...opts }),
    suspiciousActivity:(opts) => notify.suspiciousActivity({ ...base, ...opts }),
    expenseSpike:      (opts) => notify.expenseSpike({ ...base, ...opts }),
    inventoryUpdate:   (opts) => notify.inventoryUpdate({ ...base, ...opts }),
    transfer:          (opts) => notify.transfer({ ...base, ...opts }),
    loginAlert:        (opts) => notify.loginAlert({ ...base, ...opts }),
  };
}