import React, { Suspense, lazy, useState } from 'react';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import HelpLink from '@/components/help/HelpLink';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Users, CalendarCheck, Wallet, UserCog, ShieldCheck } from 'lucide-react';

// Only the active workspace section is mounted; permissions still govern the
// underlying data and mutations. Legacy deep links remain valid for bookmarks.
const OwnerPushSettings = lazy(() => import('@/components/notifications/OwnerPushSettings'));
const Employees = lazy(() => import('@/pages/Employees'));
const EmployeeAttendance = lazy(() => import('@/pages/EmployeeAttendance'));
const OwnerLiveLocations = lazy(() => import('@/components/attendance/OwnerLiveLocations'));
const BranchAttendanceGeofence = lazy(() => import('@/components/attendance/BranchAttendanceGeofence'));
const Payroll = lazy(() => import('@/pages/Payroll'));
const StaffInvitations = lazy(() => import('@/pages/StaffInvitations'));

export default function EmployeeManagementCenter() {
  const { role, can } = useRole();
  const { activeRestaurant } = useTenant();
  const { translateLiteral: tr } = useLanguage();
  const sections = [
    ...(role === 'owner' || can?.viewEmployees ? [{ id: 'records', title: 'Employee records', icon: Users }] : []),
    ...(role === 'owner' || can?.viewAttendance || can?.recordAttendance || can?.viewStaffAttendance || can?.viewEmployeeControl
      ? [{ id: 'attendance', title: 'Attendance & live staff', icon: CalendarCheck }] : []),
    ...((role === 'owner' || role === 'manager') && (role === 'owner' || can?.viewPayroll)
      ? [{ id: 'payroll', title: 'Payroll, shifts & adjustments', icon: Wallet }] : []),
    ...(role === 'owner' && can?.manageUsers ? [{ id: 'access', title: 'Staff access & invitations', icon: ShieldCheck }] : []),
  ];
  const [activeSection, setActiveSection] = useState('records');
  const selected = sections.some(section => section.id === activeSection)
    ? activeSection : sections[0]?.id;

  return <main className="mx-auto w-full min-w-0 max-w-7xl space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <PageHeader title={tr('Employee Management Center')}
      subtitle={tr('Employee profiles, attendance, shifts, payroll and access in one workspace')} />
    <div className="flex justify-end"><HelpLink guide="employee-management"/></div>
    {role==='owner'&&<details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">{tr('Attendance push notifications')}</summary><p className="my-2 text-xs text-muted-foreground">{tr('Enable this owner device and keep People, Insert and your branches selected. Missing check-in after 15 minutes is a review alert, not confirmed absence.')}</p><Suspense fallback={null}><OwnerPushSettings/></Suspense></details>}
    {!activeRestaurant?.id ? <Card role="alert" className="p-4 text-sm text-amber-700">
      {tr('Select a business to manage its employees.')}
    </Card> : sections.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">
      {tr('You do not have permission to view employee records.')}
    </Card> :
      <Tabs value={selected} onValueChange={setActiveSection}>
        <div className="max-w-full overflow-x-auto pb-2" role="region" aria-label={tr('Employee Management sections')} tabIndex={0}>
          <TabsList className="flex h-auto w-max min-w-full flex-nowrap justify-start gap-1 p-1">
            {sections.map(({ id, title, icon: Icon }) =>
              <TabsTrigger key={id} value={id} className="flex shrink-0 items-center gap-2 px-3 py-2 text-xs sm:text-sm">
                <Icon className="h-4 w-4" /><span>{tr(title)}</span>
              </TabsTrigger>)}
          </TabsList>
        </div>
        <Suspense fallback={<Card className="p-8 text-center text-sm text-muted-foreground">{tr('Loading...')}</Card>}>
          {selected === 'records' && <TabsContent forceMount value="records"><Employees embedded /></TabsContent>}
          {selected === 'attendance' && <TabsContent forceMount value="attendance">
            {role === 'owner' && <><OwnerLiveLocations restaurantId={activeRestaurant.id} /><BranchAttendanceGeofence /></>}
            <EmployeeAttendance />
          </TabsContent>}
          {selected === 'payroll' && <TabsContent forceMount value="payroll"><Payroll embedded /></TabsContent>}
          {selected === 'access' && <TabsContent forceMount value="access"><StaffInvitations embedded /></TabsContent>}
        </Suspense>
      </Tabs>}
    <Card className="flex items-start gap-2 border-border/70 p-3 text-xs text-muted-foreground">
      <UserCog className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{tr('All sections use the same employee ID and business scope. Historical pay records are never removed when an employee is archived.')}</p>
    </Card>
  </main>;
}
