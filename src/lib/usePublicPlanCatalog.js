import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { PUBLIC_PLAN_FIELDS } from '@/lib/pricingCatalog';
import { withPortalReadDeadline } from '@/lib/portalReadDeadline';

export function usePublicPlanCatalog() {
  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    setPlans([]);
    async function load() {
      try {
        const { data, error } = await withPortalReadDeadline(
          supabase.from('subscription_plans').select(PUBLIC_PLAN_FIELDS)
            .eq('is_active', true).eq('is_public', true)
            .order('sort_order', { ascending: true }),
        );
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('INVALID_PLAN_CATALOG');
        if (active) {
          setPlans(data);
          setStatus(data.length ? 'ready' : 'empty');
        }
      } catch {
        if (active) setStatus('error');
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);
  return { plans, status, retry: () => setAttempt(value => value + 1) };
}
