import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, LogOut, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { calcHours } from '@/lib/payrollEngine';

export default function AttendanceLiveBoard({ employees, todayAttendance, onCheckOut, checkOutLoading }) {
  const { translateLiteral: tr } = useLanguage();
  const employeeStatus = employees.map(emp => {
    const record = todayAttendance.find(r => r.employee_id === emp.id);
    return { ...emp, record, isIn: !!record?.check_in, isOut: !!record?.check_out };
  });

  const present = employeeStatus.filter(e => e.isIn && !e.isOut);
  const checkedOut = employeeStatus.filter(e => e.isIn && e.isOut);
  const absent = employeeStatus.filter(e => !e.isIn);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-green-700">{present.length}</div>
            <div className="text-xs text-green-600 font-medium mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {tr('Present')}
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-red-700">{absent.length}</div>
            <div className="text-xs text-red-600 font-medium mt-1 flex items-center justify-center gap-1">
              <XCircle className="w-3 h-3" /> {tr('Not checked in')}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-slate-600">{checkedOut.length}</div>
            <div className="text-xs text-slate-500 font-medium mt-1 flex items-center justify-center gap-1">
              <LogOut className="w-3 h-3" /> {tr('Done')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee rows */}
      <div className="space-y-2">
        {employeeStatus.map(emp => {
          const hrs = emp.record?.hours_worked || calcHours(emp.record?.check_in, emp.record?.check_out);
          let statusColor = 'bg-red-100 text-red-700 border-red-200';
          let statusLabel = 'Not checked in';
          let StatusIcon = XCircle;
          if (emp.isIn && !emp.isOut) { statusColor = 'bg-green-100 text-green-700 border-green-200'; statusLabel = 'Present'; StatusIcon = CheckCircle2; }
          if (emp.isIn && emp.isOut) { statusColor = 'bg-slate-100 text-slate-600 border-slate-200'; statusLabel = 'Done'; StatusIcon = LogOut; }
          if (emp.record?.status === 'late') { statusColor = 'bg-amber-100 text-amber-700 border-amber-200'; statusLabel = 'Late'; StatusIcon = AlertCircle; }

          return (
            <Card key={emp.id} className="p-3 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {emp.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{emp.full_name}</div>
                <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                  {emp.position && <span>{emp.position}</span>}
                  {emp.record?.check_in && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {emp.record.check_in}</span>}
                  {emp.record?.check_out && <span>→ {emp.record.check_out}</span>}
                  {hrs && <span className="text-primary font-semibold">{Number(hrs).toFixed(1)}h</span>}
                  {emp.record?.late_minutes > 0 && <span className="text-amber-600">{emp.record.late_minutes}m late</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`${statusColor} border text-xs font-medium`}>
                  <StatusIcon className="w-3 h-3 mr-1" />{tr(statusLabel)}
                </Badge>
                {Boolean(onCheckOut) && emp.isIn && !emp.isOut && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onCheckOut(emp)}
                    disabled={checkOutLoading}
                  >
                    <LogOut className="w-3 h-3 mr-1" /> Out
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {employeeStatus.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {tr('No employees found for this branch.')}
          </div>
        )}
      </div>
    </div>
  );
}