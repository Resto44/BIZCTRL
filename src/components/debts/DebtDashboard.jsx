import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { buildDebtLedgerSummary } from '@/lib/debtLedgerSummary';
import { useDebtI18n } from '@/lib/debtI18n';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1'];

export default function DebtDashboard({ debts }) {
  const d = useDebtI18n();

  const stats = useMemo(() => buildDebtLedgerSummary(debts), [debts]);

  const agingData = [
    { name: d.aging_current, value: stats.aging.current },
    { name: d.aging_30, value: stats.aging['30d'] },
    { name: d.aging_60, value: stats.aging['60d'] },
    { name: d.aging_90, value: stats.aging['90d+'] },
  ].filter(x => x.value > 0);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700 font-medium">{d.dash_receivable}</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{stats.totalReceivable.toLocaleString()}</div>
            <div className="text-xs text-green-600">{d.currency}</div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-xs text-red-700 font-medium">{d.dash_liability}</span>
            </div>
            <div className="text-2xl font-bold text-red-700">{stats.totalLiability.toLocaleString()}</div>
            <div className="text-xs text-red-600">{d.currency}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-amber-700 font-medium">{d.dash_overdue}</span>
            </div>
            <div className="text-2xl font-bold text-amber-700">{stats.totalOverdue.toLocaleString()}</div>
            <div className="text-xs text-amber-600">{d.records_label(stats.overdue.length)}</div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-700 font-medium">{d.dash_collected}</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{stats.totalCollected.toLocaleString()}</div>
            <div className="text-xs text-blue-600">{d.currency}</div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Chart */}
      {agingData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{d.aging_title}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={agingData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => [`${v.toLocaleString()} ${d.currency}`]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {agingData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Debtors */}
      {stats.topDebtors.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{d.top_debtors}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {stats.topDebtors.map(({id, name, amount: amt}, i) => (
              <div key={id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{name}</div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(100, (amt / stats.totalReceivable) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-xs font-bold text-red-600 shrink-0">{amt.toLocaleString()} {d.currency}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Overdue Alert List */}
      {stats.overdue.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              {d.overdue_alerts}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {stats.overdue.slice(0, 5).map(x => (
              <div key={x.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs font-semibold">{x.party_name}</div>
                  <div className="text-[10px] text-muted-foreground">{d.overdue_since} {x.due_date}</div>
                </div>
                <div className="text-sm font-bold text-red-600">{(x.remaining_amount || 0).toLocaleString()} {d.currency}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}