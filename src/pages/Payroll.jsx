import React from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, CalendarCheck, DollarSign, BarChart3, Settings2, TrendingUp, Calendar } from 'lucide-react';
import AttendanceTab from '@/components/payroll/AttendanceTab';
import AttendanceAnalytics from '@/components/payroll/AttendanceAnalytics';
import PayrollDashboard from '@/components/payroll/PayrollDashboard';
import PayrollReport from '@/components/payroll/PayrollReport';
import BonusDeductionTab from '@/components/payroll/BonusDeductionTab';
import DeductionRulesSettings from '@/components/payroll/DeductionRulesSettings';
import WeeklyRosterView from '@/components/staff/WeeklyRosterView';

export default function Payroll({ embedded = false }) {
  const { t } = useLanguage();
  const { role } = useRole();
  const isOwner = role === 'owner';
  const isManager = role === 'owner' || role === 'manager';

  if (!isManager) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Access restricted.</p>
      </div>
    );
  }

  return (
    <div>
      {!embedded && <PageHeader title={t('payroll')} />}
      <Tabs defaultValue="attendance">
        <div className="mb-4 max-w-full overflow-x-auto overscroll-x-contain pb-2" role="region" aria-label="Payroll sections" tabIndex={0}>
        <TabsList className="flex w-max min-w-full flex-nowrap justify-start gap-1">
          <TabsTrigger value="attendance" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
            <CalendarCheck className="w-3 h-3" /> {t('attendance')}
          </TabsTrigger>
          <TabsTrigger value="roster" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
            <Calendar className="w-3 h-3" /> {t('shift')}
          </TabsTrigger>
          <TabsTrigger value="bonuses" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
            <DollarSign className="w-3 h-3" /> {t('bonuses')}
          </TabsTrigger>
          <TabsTrigger value="report" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
            <Users className="w-3 h-3" /> {t('payroll_report')}
          </TabsTrigger>
          <TabsTrigger value="perf" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
            <TrendingUp className="w-3 h-3" /> {t('performance')}
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="analytics" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
              <BarChart3 className="w-3 h-3" /> {t('analytics')}
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger value="settings" className="shrink-0 gap-1 whitespace-nowrap px-3 text-xs">
              <Settings2 className="w-3 h-3" /> {t('rules')}
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        <TabsContent value="roster"><WeeklyRosterView /></TabsContent>
        <TabsContent value="bonuses"><BonusDeductionTab /></TabsContent>
        <TabsContent value="report"><PayrollReport /></TabsContent>
        <TabsContent value="perf"><AttendanceAnalytics /></TabsContent>
        {isOwner && <TabsContent value="analytics"><PayrollDashboard /></TabsContent>}
        {isOwner && <TabsContent value="settings"><DeductionRulesSettings /></TabsContent>}
      </Tabs>
    </div>
  );
}