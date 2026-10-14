import React, { useMemo } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Clock, AlertTriangle, UserCheck } from 'lucide-react';

export default function AttendanceAnalyticsPanel({ records, employees }) {
  const { translateLiteral: tr } = useLanguage();
  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const late = records.filter(r => r.status === 'late').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const totalHours = records.reduce((s, r) => s + (Number(r.hours_worked) || 0), 0);
    const avgHours = total > 0 ? (totalHours / Math.max(present, 1)).toFixed(1) : 0;
    const attendanceRate = total > 0 ? ((present / total) * 100).toFixed(0) : 0;
    return { total, present, late, absent, totalHours: totalHours.toFixed(1), avgHours, attendanceRate };
  }, [records]);

  // Per-employee hours breakdown
  const empHours = useMemo(() => {
    const map = {};
    records.forEach(r => {
      if (!r.employee_id) return;
      if (!map[r.employee_id]) map[r.employee_id] = { name: r.employee_name || '', hours: 0 };
      map[r.employee_id].hours += Number(r.hours_worked) || 0;
    });
    return Object.values(map)
      .map(({ name, hours }) => ({ name: name.split(' ')[0], hours: +hours.toFixed(1) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);
  }, [records]);

  // Daily attendance trend
  const dailyTrend = useMemo(() => {
    const map = {};
    records.forEach(r => {
      if (!r.date) return;
      if (!map[r.date]) map[r.date] = { date: r.date, present: 0, absent: 0 };
      if (r.status === 'present' || r.status === 'late') map[r.date].present++;
      else if (r.status === 'absent') map[r.date].absent++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [records]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">{tr('Attendance Rate')}</span>
            </div>
            <div className="text-2xl font-bold text-primary">{stats.attendanceRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">{tr('Avg Hours/Day')}</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{stats.avgHours}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">{tr('Late Arrivals')}</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.late}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-muted-foreground font-medium">{tr('Total Hours')}</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalHours}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend Chart */}
      {dailyTrend.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{tr('Daily Attendance Trend')}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={dailyTrend} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="present" fill="#10b981" radius={[2,2,0,0]} name={tr("Present")} />
                <Bar dataKey="absent" fill="#ef4444" radius={[2,2,0,0]} name={tr("Absent")} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Employee Hours Chart */}
      {empHours.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{tr('Hours by Employee (period)')}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={empHours} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="hours" radius={[0,2,2,0]} name={tr("Hours")}>
                  {empHours.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}