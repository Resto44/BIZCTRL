/**
 * PriceChangesWidget.jsx
 * Dashboard widget showing recent product price changes — BizCTRL
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Link } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────────────
function TrendArrow({ diff }) {
  if (diff > 0) return <span className="text-red-500 text-base font-bold">▲</span>;
  if (diff < 0) return <span className="text-green-500 text-base font-bold">▼</span>;
  return <span className="text-gray-400 text-base font-bold">➜</span>;
}

function pctColor(pct) {
  if (pct > 0) return 'text-red-600';
  if (pct < 0) return 'text-green-600';
  return 'text-gray-500';
}

function relativeDate(dateStr, t) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return t('today_label');
  if (diffDays === 1) return t('yesterday_label');
  if (diffDays < 7) return `${diffDays} ${t('days_ago') || 'days ago'}`;
  return format(d, 'dd MMM');
}

// ── Widget ────────────────────────────────────────────────────────────────────
export default function PriceChangesWidget() {
  const { ownerFilter } = useTenant();
  const { user } = useAuth();
  const { currency, t } = useLanguage();

  const createdBy = user?.email || ownerFilter?.created_by;

  // Fetch last 30 days of price changes, latest first
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['price_changes_widget', createdBy],
    queryFn: async () => {
      if (!createdBy) return [];
      const since = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .eq('created_by', createdBy)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(100);
      if (error) { console.warn('price changes widget error:', error.message); return []; }
      return data || [];
    },
    staleTime: 60000,
    enabled: !!createdBy,
  });

  // Deduplicate: latest change per product
  const latestPerProduct = useMemo(() => {
    const map = {};
    for (const row of history) {
      if (!map[row.product_id]) map[row.product_id] = row;
    }
    return Object.values(map).slice(0, 6);
  }, [history]);

  // Summary stats
  const stats = useMemo(() => {
    const increases = history.filter(r => (r.difference || 0) > 0).length;
    const decreases = history.filter(r => (r.difference || 0) < 0).length;
    const uniqueProducts = new Set(history.map(r => r.product_id)).size;
    return { increases, decreases, uniqueProducts, total: history.length };
  }, [history]);

  if (isLoading) return null;
  if (!history.length) return null;

  return (
    <Card className="p-4 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t('price_changes_title')}</h3>
            <p className="text-xs text-muted-foreground">{t('price_changes_last30')} · {stats.uniqueProducts} {t('products') || 'products'}</p>
          </div>
        </div>
        <Link to="/product-management" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
          {t('view_all')} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 mb-3">
        {stats.increases > 0 && (
          <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> {stats.increases} {t('increases_label')}
          </Badge>
        )}
        {stats.decreases > 0 && (
          <Badge className="bg-green-100 text-green-700 text-xs flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> {stats.decreases} {t('decreases_label')}
          </Badge>
        )}
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {latestPerProduct.map(row => {
          const diff = row.difference || 0;
          const pct = row.pct_change || 0;
          return (
            <div key={row.product_id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <TrendArrow diff={diff} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{row.product_name}</p>
                <div className="flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-muted-foreground mt-0.5">
                  <span>{relativeDate(row.recorded_at, t)}: <strong className="text-foreground">{currency}{(row.previous_price || 0).toFixed(2)}</strong></span>
                  <span>{t('now_label')} <strong className="text-foreground">{currency}{(row.new_price || 0).toFixed(2)}</strong></span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-xs font-bold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  {diff > 0 ? '+' : ''}{currency}{Math.abs(diff).toFixed(2)}
                </p>
                <p className={`text-[10px] font-semibold ${pctColor(pct)}`}>
                  {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {stats.total > 6 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          +{stats.total - 6} {t('more_changes')} ·{' '}
          <Link to="/product-management" className="text-primary hover:underline">{t('view_all_lower')}</Link>
        </p>
      )}
    </Card>
  );
}
