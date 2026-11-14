import { visibleEmployeeAnnouncement } from '@/lib/verifiedReportRead';
import HelpLink from '@/components/help/HelpLink';
import PortalDataState from '@/components/shared/PortalDataState';
import EmployeeMobileAttendance from '@/components/attendance/EmployeeMobileAttendance';
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  LogOut, GitBranch, Bell, ClipboardList, Home, CheckCircle2, CalendarClock, ListTodo, Megaphone, ArrowRight, RefreshCw, MapPin
} from 'lucide-react';
import { format } from 'date-fns';

export default function EmployeeDashboardERP() {
  const { user, logout } = useAuth();
  const { managerBranchObject } = useTenant();
  const { translateLiteral: tr, isRTL, lang } = useLanguage();
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

  const copy = ({
    en:{
      workspace:'My workspace',signedIn:'Employee account',assignedBranch:'Assigned branch',
      attendanceTitle:'Attendance & location sharing',attendanceHint:'Secure entry and exit · One-time code + branch GPS',
      attendanceAction:'Open attendance',tasksHeading:'Assigned tasks',openTasks:'Open tasks',
      pendingNews:'Announcements',quickAccess:'Overview',today:'My work overview',
      tasksHint:'Your assigned work and due dates',newsHint:'Updates from your organization',
      noTasks:'No tasks assigned.',noNews:'No announcements.',needsBranch:'Your employee account needs an active branch assignment. Ask the Owner to link your employee record.',
      latest100:'Latest 100 assigned tasks',refresh:'Refresh',all:'All',open:'Open',completed:'Completed',
      inProgress:'In progress',pending:'Pending',dueDate:'Due date',moreTasks:'View tasks',moreNews:'View news',reload:'Refresh',
      nextStep:'Use the attendance card below to check in or check out with your approved account.',
      noOpenTasks:'No open tasks',noUnreadPromise:'Latest published news',logout:'Sign out',
    },
    ar:{
      workspace:'مساحة عملي',signedIn:'حساب الموظف',assignedBranch:'الفرع المعيّن',
      attendanceTitle:'الحضور ومشاركة الموقع',attendanceHint:'تسجيل آمن للحضور والانصراف · رمز لمرة واحدة وموقع الفرع',
      attendanceAction:'فتح الحضور',tasksHeading:'المهام المكلّف بها',openTasks:'المهام المفتوحة',
      pendingNews:'الإعلانات',quickAccess:'نظرة عامة',today:'ملخص عملي',
      tasksHint:'المهام والمواعيد المكلّف بها',newsHint:'آخر تحديثات المنشأة',
      noTasks:'لا توجد مهام مسندة.',noNews:'لا توجد إعلانات.',needsBranch:'يحتاج حساب الموظف إلى فرع نشط. اطلب من المالك ربط سجل الموظف.',
      latest100:'آخر ١٠٠ مهمة',refresh:'تحديث',all:'الكل',open:'مفتوحة',completed:'مكتملة',
      inProgress:'قيد التنفيذ',pending:'قيد الانتظار',dueDate:'تاريخ الاستحقاق',moreTasks:'عرض المهام',moreNews:'عرض الأخبار',reload:'تحديث',
      nextStep:'استخدم بطاقة الحضور أدناه للدخول أو الخروج بحسابك الموثّق.',
      noOpenTasks:'لا توجد مهام مفتوحة',noUnreadPromise:'آخر الأخبار المنشورة',logout:'تسجيل الخروج',
    },
    fa:{
      workspace:'محیط کار من',signedIn:'حساب کارمند',assignedBranch:'شعبهٔ تعیین‌شده',
      attendanceTitle:'حضور و اشتراک موقعیت',attendanceHint:'ورود و خروج امن · کد یک‌بارمصرف و GPS شعبه',
      attendanceAction:'بازکردن حضور و غیاب',tasksHeading:'وظایف من',openTasks:'وظایف باز',
      pendingNews:'اطلاعیه‌ها',quickAccess:'نمای کلی',today:'خلاصهٔ کار من',
      tasksHint:'وظایف و موعدهای سپرده‌شده',newsHint:'آخرین اطلاعیه‌های سازمان',
      noTasks:'وظیفه‌ای ثبت نشده است.',noNews:'اطلاعیه‌ای موجود نیست.',needsBranch:'برای حساب کارمند شعبهٔ فعال لازم است. از مالک بخواهید پروندهٔ کارمند را وصل کند.',
      latest100:'آخرین ۱۰۰ وظیفه',refresh:'تازه‌سازی',all:'همه',open:'باز',completed:'تکمیل‌شده',
      inProgress:'در جریان',pending:'در انتظار',dueDate:'موعد',moreTasks:'مشاهده وظایف',moreNews:'مشاهده خبرها',reload:'تازه‌سازی',
      nextStep:'برای ثبت ورود یا خروج، کارت حضور و غیاب زیر را با حساب تأییدشده استفاده کنید.',
      noOpenTasks:'وظیفهٔ باز وجود ندارد',noUnreadPromise:'آخرین اطلاعیه‌های منتشرشده',logout:'خروج',
    },
  })[lang] || ({
    workspace:'My workspace',signedIn:'Employee account',assignedBranch:'Assigned branch',
    attendanceTitle:'Attendance & location sharing',attendanceHint:'Secure entry and exit · One-time code + branch GPS',
    attendanceAction:'Open attendance',tasksHeading:'Assigned tasks',openTasks:'Open tasks',
    pendingNews:'Announcements',quickAccess:'Overview',today:'My work overview',
    tasksHint:'Your assigned work and due dates',newsHint:'Updates from your organization',
    noTasks:'No tasks assigned.',noNews:'No announcements.',needsBranch:'Your employee account needs an active branch assignment. Ask the Owner to link your employee record.',
    latest100:'Latest 100 assigned tasks',refresh:'Refresh',all:'All',open:'Open',completed:'Completed',
    inProgress:'In progress',pending:'Pending',dueDate:'Due date',moreTasks:'View tasks',moreNews:'View news',reload:'Refresh',
    nextStep:'Use the attendance card below to check in or check out with your approved account.',
    noOpenTasks:'No open tasks',noUnreadPromise:'Latest published news',logout:'Sign out',
  });
  const openTasks=myTasks.filter(task=>!['done','completed'].includes(task.status));
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
    <div dir={isRTL ? 'rtl' : 'ltr'} data-testid="employee-erp-workspace"
      className="min-w-0 bg-slate-50/70 px-3 pb-6 pt-3 text-slate-900 dark:bg-slate-950 dark:text-slate-50 sm:px-4 sm:pt-4">
      <div className="mx-auto w-full max-w-6xl space-y-3.5 sm:space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <User className="h-5 w-5" aria-hidden="true"/>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{copy.signedIn}</p>
                <h1 className="truncate text-base font-extrabold text-slate-950 dark:text-white sm:text-lg">
                  {empProfile.full_name || user?.email}
                </h1>
                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true"/>
                  <span className="truncate">{activeBranch?.name || copy.assignedBranch}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <HelpLink guide="employee" />
              <Button type="button" variant="ghost" size="icon"
                aria-label={copy.logout} onClick={logout}
                className="h-10 w-10 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
                <LogOut className="h-4 w-4"/>
              </Button>
            </div>
          </div>
        </header>

        <nav aria-label={tr('Employee portal')} data-testid="employee-erp-tabs"
          className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {tabs.map(item => {
            const Icon=item.icon;
            const label=item.id==='home'?tr('Home'):item.id==='attendance'?tr('Attendance')
              :item.id==='tasks'?tr('Tasks'):tr('News');
            return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
              aria-current={activeTab===item.id?'page':undefined}
              className={`flex min-h-[57px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm ${
                activeTab===item.id
                  ?'bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-white'
                  :'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>
                <span className="max-w-full truncate">{label}</span>
              </button>;
          })}
        </nav>

        <main className="space-y-3.5 sm:space-y-4">
          {activeTab==='home' && (
            <section aria-label={copy.today} className="space-y-3" data-testid="employee-erp-home">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">{copy.today}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{copy.nextStep}</p>
                </div>
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span className="truncate">{activeBranch?.name || copy.assignedBranch}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="employee-erp-kpis">
                {can.recordAttendance && <button type="button" onClick={()=>setActiveTab('attendance')}
                  className="group rounded-2xl border border-sky-200 bg-sky-50 p-3 text-start shadow-sm transition-colors hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-sky-900 dark:bg-sky-950 dark:hover:bg-sky-900">
                  <div className="mb-2 flex items-center justify-between text-blue-700 dark:text-blue-300">
                    <CalendarClock className="h-5 w-5"/>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{tr('Attendance')}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{copy.attendanceAction}</p>
                </button>}
                {can.viewTasks && <button type="button" onClick={()=>setActiveTab('tasks')}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <div className="mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400"><ListTodo className="h-5 w-5"/><span className="text-xl font-extrabold tabular-nums text-slate-950 dark:text-white">{myTasksError||myTasksLoading?'—':openTasks.length}</span></div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{copy.openTasks}</p>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">{copy.tasksHint}</p>
                </button>}
                <button type="button" onClick={()=>setActiveTab('announcements')}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <div className="mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400"><Bell className="h-5 w-5"/><span className="text-xl font-extrabold tabular-nums text-slate-950 dark:text-white">{announcementsError||announcementsLoading?'—':announcements.length}</span></div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{copy.pendingNews}</p>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">{copy.noUnreadPromise}</p>
                </button>
              </div>
            </section>
          )}

          {['home','attendance'].includes(activeTab) && (
            <section aria-labelledby="employee-attendance-heading" data-testid="employee-attendance-section" className="space-y-2">
              {can.recordAttendance && <>
                <div className="flex min-w-0 items-center gap-2 px-0.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true"/>
                  <div className="min-w-0">
                    <h2 id="employee-attendance-heading" className="text-base font-extrabold text-slate-950 dark:text-white">{copy.attendanceTitle}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{copy.attendanceHint}</p>
                  </div>
                </div>
                <EmployeeMobileAttendance userId={user?.id}/>
              </>}
              {!branchId && can.recordAttendance && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{copy.needsBranch}</p>}
            </section>
          )}

          {activeTab==='home' && <Link to="/portal-order-entry" data-testid="employee-customer-order-entry" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"><ClipboardList className="h-5 w-5"/>{lang==='ar'?'طلب العميل':lang==='fa'?'ثبت سفارش مشتری':'Customer order intake'}</Link>}
          {activeTab==='home' && (can.viewTasks||announcements.length>0) && (
            <section className="grid gap-3 md:grid-cols-2" aria-label={copy.quickAccess}>
              {can.viewTasks && <Card className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><ListTodo className="h-4 w-4 text-blue-600"/>{copy.tasksHeading}</h3>
                    <Button type="button" variant="ghost" size="sm" onClick={()=>setActiveTab('tasks')} className="h-9 text-blue-700 dark:text-blue-300">{copy.moreTasks}</Button>
                  </div>
                  {myTasksError ? <PortalDataState onRetry={retryMyTasks}/> : myTasksLoading ? <PortalDataState loading/> :
                    openTasks.length===0?<p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">{copy.noOpenTasks}</p>:
                    openTasks.slice(0,3).map(task=><div key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2.5 text-xs dark:border-slate-700">
                      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"/>
                      <span className="min-w-0 flex-1 break-words font-medium text-slate-700 dark:text-slate-200">{task.title}</span>
                      {task.due_date && <span className="shrink-0 text-slate-500 dark:text-slate-400" dir="ltr">{task.due_date}</span>}
                    </div>)}
                </CardContent>
              </Card>}
              <Card className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Megaphone className="h-4 w-4 text-blue-600"/>{copy.pendingNews}</h3>
                    <Button type="button" variant="ghost" size="sm" onClick={()=>setActiveTab('announcements')} className="h-9 text-blue-700 dark:text-blue-300">{copy.moreNews}</Button>
                  </div>
                  {announcementsError ? <PortalDataState onRetry={retryAnnouncements}/> : announcementsLoading ? <PortalDataState loading/> :
                    announcements.length===0?<p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">{copy.noNews}</p>:
                    announcements.slice(0,2).map(ann=><div key={ann.id} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-700">
                      <p className="break-words text-xs font-semibold text-slate-800 dark:text-slate-100">{ann.title}</p>
                      {ann.content && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{ann.content}</p>}
                    </div>)}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === 'tasks' && can.viewTasks && (
            <section className="space-y-3" data-testid="employee-tasks-section">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div><h2 className="text-lg font-extrabold text-slate-950 dark:text-white">{tr('My Tasks')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{copy.latest100}</p></div>
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl"
                  onClick={()=>retryMyTasks()}><RefreshCw className="me-1.5 h-4 w-4"/>{copy.refresh}</Button>
              </div>
              <div className="flex gap-2" role="group" aria-label={copy.tasksHeading}>
                {[['all',copy.all],['open',copy.open],['done',copy.completed]].map(([value,label])=>
                  <button type="button" key={value} aria-pressed={taskFilter===value} onClick={()=>setTaskFilter(value)}
                    className={`min-h-10 flex-1 rounded-xl border px-2 text-xs font-semibold sm:flex-none sm:px-4 sm:text-sm ${taskFilter===value
                      ?'border-blue-600 bg-blue-600 text-white'
                      :'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{label}</button>)}
              </div>
              {myTasksError ? <PortalDataState onRetry={retryMyTasks}/> : myTasksLoading ? <PortalDataState loading/> : filteredTasks.length===0 ?
                <p className="rounded-xl border bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{tr(taskFilter==='all'?'No tasks assigned.':'No tasks match this filter.')}</p> :
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {filteredTasks.map(task=><Card key={task.id} className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <CardContent className="p-3.5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-slate-900 dark:text-white">{task.title}</p>
                          {task.description && <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{task.description}</p>}
                          {task.due_date && <p className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"><CalendarClock className="h-3.5 w-3.5"/>{copy.dueDate}: <span dir="ltr">{task.due_date}</span></p>}
                        </div>
                        <Badge className={`shrink-0 border-0 text-[11px] ${completed(task)?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300':task.status==='in_progress'?'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>{completed(task)?copy.completed:task.status==='in_progress'?copy.inProgress:copy.pending}</Badge>
                      </div>
                    </CardContent>
                  </Card>)}
                </div>}
            </section>
          )}

          {activeTab==='announcements' && (
            <section className="space-y-3" data-testid="employee-announcements-section">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">{copy.pendingNews}</h2>
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" onClick={()=>retryAnnouncements()}><RefreshCw className="me-1.5 h-4 w-4"/>{copy.refresh}</Button>
              </div>
              {announcementsError ? <PortalDataState onRetry={retryAnnouncements}/> : announcementsLoading ? <PortalDataState loading/> : announcements.length===0?
                <p className="rounded-xl border bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{copy.noNews}</p> :
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {announcements.map(ann=><Card key={ann.id} className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <CardContent className="space-y-2 p-3.5">
                      <p className="flex items-start gap-2 break-words text-sm font-bold text-slate-900 dark:text-white"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"/>{ann.title}</p>
                      {ann.content && <p className="break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{ann.content}</p>}
                      {ann.created_date && !Number.isNaN(new Date(ann.created_date).getTime()) &&
                        <p className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(ann.created_date),'MMM d, yyyy')}</p>}
                    </CardContent>
                  </Card>)}
                </div>}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
