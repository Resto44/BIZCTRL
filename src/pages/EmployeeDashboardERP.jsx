import { visibleEmployeeAnnouncement } from '@/lib/verifiedReportRead';
import HelpLink from '@/components/help/HelpLink';
import PortalDataState from '@/components/shared/PortalDataState';
import EmployeeMobileAttendance from '@/components/attendance/EmployeeMobileAttendance';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  LogOut, GitBranch, Bell, ClipboardList, Home
} from 'lucide-react';
import { format } from 'date-fns';

export default function EmployeeDashboardERP() {
  const { user, logout } = useAuth();
  const { managerBranchObject } = useTenant();
  const { translateLiteral: tr, isRTL } = useLanguage();
  const { can } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [taskFilter, setTaskFilter] = useState('all');
  const activeTab = location.pathname === '/tasks' ? 'tasks'
    : ['/employee-attendance', '/staff-attendance'].includes(location.pathname) ? 'attendance'
    : new URLSearchParams(location.search).get('tab') === 'announcements' ? 'announcements' : 'home';
  const setActiveTab = (tab) => navigate(tab === 'tasks' ? '/tasks'
    : tab === 'attendance' ? '/employee-attendance'
    : tab === 'announcements' ? '/employee-dashboard?tab=announcements' : '/employee-dashboard');
  const activeBranch = managerBranchObject || (user?.branch_id
    ? { id: user.branch_id, name: user.branch_name || 'Assigned Branch' }
    : null);
  const branchId = activeBranch?.id;

  // Identity comes from the authenticated session. Employees must not need
  // viewEmployees (which exposes the management directory) to see their own name.
  const empProfile = { full_name: user?.full_name || user?.name || user?.email,
    email: user?.email, position: tr('Employee') };

  // My tasks
  const { data: myTasks = [], isError: myTasksError, refetch: retryMyTasks, isLoading: myTasksLoading } = useQuery({
    queryKey: ['emp-tasks', user?.id, user?.email, user?.restaurant_id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('branch_id', branchId)
        .eq('restaurant_id', user.restaurant_id)
        .in('assigned_to', [user.id, user.email].filter(Boolean))
        .order('created_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!user?.id && !!user?.restaurant_id && can.viewTasks,
  });

  // Announcements
  const { data: announcements = [], isError: announcementsError, refetch: retryAnnouncements, isLoading: announcementsLoading } = useQuery({
    queryKey: ['emp-announcements', user?.restaurant_id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .or('target_role.is.null,target_role.eq.all,target_role.eq.employee')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_date', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).filter(row => visibleEmployeeAnnouncement(row));
    },
    enabled: !!branchId && !!user?.restaurant_id,
  });

  const completed = task => ['done', 'completed'].includes(task.status);
  const filteredTasks = myTasks.filter(task => taskFilter === 'all' || (taskFilter === 'done' ? completed(task) : !completed(task)));

  // Attendance RPC independently checks the approved membership and employee UUID.
  // A failed tasks/announcements read must never hide the attendance clock.
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    ...(can.recordAttendance ? [{ id: 'attendance', label: 'Attendance', icon: ClipboardList }] : []),
    ...(can.viewTasks ? [{ id: 'tasks', label: 'Tasks', icon: ClipboardList }] : []),
    { id: 'announcements', label: 'News', icon: Bell },
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-w-0 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-6 text-white">
      {/* Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 min-h-16 py-3 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-white font-bold text-sm">{empProfile?.full_name || user?.email}</p>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <GitBranch className="w-3 h-3" />
                {activeBranch?.name}
              </div>
            </div>
          </div>
          <HelpLink guide="employee" />
          <Button variant="ghost" size="sm" aria-label={tr('Sign out')} onClick={logout} className="text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <nav aria-label={tr('Employee portal')} className="mx-auto flex max-w-5xl flex-wrap gap-2 border-b border-white/10 px-4 pb-3">
        {tabs.map(item => <button key={item.id} onClick={() => setActiveTab(item.id)}
          aria-current={activeTab === item.id ? 'page' : undefined}
          className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${activeTab === item.id ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
          {tr(item.label)}
        </button>)}
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {can.recordAttendance && <details open={['home','attendance'].includes(activeTab)} className="rounded-xl border border-white/10">
          <summary className="cursor-pointer p-3 text-sm text-white">{tr('Attendance & location sharing')}</summary>
          <EmployeeMobileAttendance userId={user?.id}/>
        </details>}
        {['home', 'attendance'].includes(activeTab) && (
          <>
            {/* All attendance mutations now use the authenticated employee's server-side identity. */}
            {!branchId && <p role="alert" className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              Your employee account needs an active branch assignment. Ask the Owner to link your employee record.
            </p>}
            {/* Profile Summary */}
            {activeTab === 'home' && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white font-bold text-lg">
                      {(empProfile.full_name || 'E')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-bold">{empProfile.full_name}</p>
                      <p className="text-slate-400 text-sm">{empProfile.position || 'Employee'}</p>
                      <p className="text-slate-500 text-xs">{empProfile.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-white text-xl font-bold">{tr('My Tasks')}</h2>
              <Button variant="outline" className="border-white/20 bg-transparent" onClick={() => retryMyTasks()}>{tr('Refresh')}</Button>
            </div>
            <p className="text-xs text-slate-400">{tr('Latest 100 assigned tasks')}</p>
            <div className="flex flex-wrap gap-2">
              {[['all', 'All'], ['open', 'Open'], ['done', 'Completed']].map(([value, label]) =>
                <button key={value} aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}
                  className={`min-h-11 rounded-lg border px-4 text-sm ${taskFilter === value ? 'border-amber-400 text-amber-300' : 'border-white/15 text-slate-300'}`}>{tr(label)}</button>)}
            </div>
            {myTasksError ? <PortalDataState onRetry={retryMyTasks}/> : myTasksLoading ? <PortalDataState loading/> : filteredTasks.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">{tr(taskFilter === 'all' ? 'No tasks assigned.' : 'No tasks match this filter.')}</p>
            ) : (
              filteredTasks.map(task => (
                <Card key={task.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-white text-sm font-medium">{task.title}</p>
                        {task.due_date && <p className="mt-1 text-xs text-slate-400">{tr('Due date')}: {task.due_date}</p>}
                        {task.description && (
                          <p className="text-slate-400 text-xs mt-1">{task.description}</p>
                        )}
                      </div>
                      <Badge className={`text-[10px] ${
                        completed(task) ? 'bg-emerald-500/20 text-emerald-400' :
                        task.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {tr(completed(task) ? 'Completed' : task.status === 'in_progress' ? 'In progress' : 'Pending')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="space-y-3">
            <h2 className="text-white font-bold">Announcements</h2>
            {announcementsError ? <PortalDataState onRetry={retryAnnouncements}/> : announcementsLoading ? <PortalDataState loading/> : announcements.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No announcements.</p>
            ) : (
              announcements.map(ann => (
                <Card key={ann.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <p className="text-white text-sm font-medium">{ann.title}</p>
                    {ann.content && <p className="text-slate-400 text-xs mt-1">{ann.content}</p>}
                    <p className="text-slate-600 text-xs mt-2">
                      {ann.created_date && !Number.isNaN(new Date(ann.created_date).getTime()) ? format(new Date(ann.created_date), 'MMM d, yyyy') : ''}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>


    </div>
  );
}
