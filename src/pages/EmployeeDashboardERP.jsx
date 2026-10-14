import HelpLink from '@/components/help/HelpLink';
import PortalDataState from '@/components/shared/PortalDataState';
import EmployeeMobileAttendance from '@/components/attendance/EmployeeMobileAttendance';
import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  LogOut, GitBranch, Bell, ClipboardList, Home
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function EmployeeDashboardERP() {
  const { user, logout } = useAuth();
  const { managerBranchObject, loadingRestaurants } = useTenant();
  const [activeTab, setActiveTab] = useState('home');
  const activeBranch = managerBranchObject || (user?.branch_id
    ? { id: user.branch_id, name: user.branch_name || 'Assigned Branch' }
    : null);
  const branchId = activeBranch?.id;

  // Employee profile
  const { data: empProfile, isError: empProfileError, refetch: retryEmpProfile, isLoading: empProfileLoading } = useQuery({
    queryKey: ['emp-profile', user?.id, user?.linked_entity_id, user?.restaurant_id, branchId],
    queryFn: async () => {
      let query = supabase.from('employees').select('id,restaurant_id,branch_id,full_name,email,position,is_active');
      if (user?.linked_entity_id) {
        query = query.eq('id', user.linked_entity_id).eq('restaurant_id',user.restaurant_id).eq('branch_id',branchId);
      } else {
        query = query
          .eq('restaurant_id', user?.restaurant_id)
          .eq('branch_id', branchId)
          .eq('email', user?.email);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!branchId && (!!user?.linked_entity_id || !!user?.email),
  });

  // My tasks
  const { data: myTasks = [], isError: myTasksError, refetch: retryMyTasks, isLoading: myTasksLoading } = useQuery({
    queryKey: ['emp-tasks', user?.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('branch_id', branchId)
        .eq('assigned_to', user?.id)
        .order('created_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!user?.id,
  });

  // Announcements
  const { data: announcements = [], isError: announcementsError, refetch: retryAnnouncements, isLoading: announcementsLoading } = useQuery({
    queryKey: ['emp-announcements', branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_date', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  if (!branchId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div>
          <GitBranch className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="font-semibold">{loadingRestaurants ? 'Loading assigned branch…' : 'No active branch assignment'}</p>
          <p className="mt-1 text-sm text-slate-400">Ask the Store Owner to assign your employee portal to an active branch.</p>
        </div>
      </div>
    );
  }

  if (empProfileError || myTasksError || announcementsError) return <PortalDataState onRetry={() => { retryEmpProfile(); retryMyTasks(); retryAnnouncements(); }}/>;
  if (empProfileLoading || myTasksLoading || announcementsLoading) return <PortalDataState loading/>;
  if (!empProfile) return <PortalDataState missing onRetry={retryEmpProfile}/>;
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList },
    { id: 'announcements', label: 'News', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{empProfile?.full_name || user?.email}</p>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <GitBranch className="w-3 h-3" />
                {activeBranch?.name}
              </div>
            </div>
          </div>
          <HelpLink guide="employee" />
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {activeTab === 'home' && (
          <>
            {/* All attendance mutations now use the authenticated employee's server-side identity. */}
            <EmployeeMobileAttendance userId={user?.id} />

            {/* Profile Summary */}
            {empProfile && (
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
            <h2 className="text-white font-bold">My Tasks</h2>
            {myTasks.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No tasks assigned.</p>
            ) : (
              myTasks.map(task => (
                <Card key={task.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-slate-400 text-xs mt-1">{task.description}</p>
                        )}
                      </div>
                      <Badge className={`text-[10px] ${
                        task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        task.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {task.status || 'pending'}
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
            {announcements.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No announcements.</p>
            ) : (
              announcements.map(ann => (
                <Card key={ann.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <p className="text-white text-sm font-medium">{ann.title}</p>
                    {ann.content && <p className="text-slate-400 text-xs mt-1">{ann.content}</p>}
                    <p className="text-slate-600 text-xs mt-2">
                      {ann.created_date ? format(new Date(ann.created_date), 'MMM d, yyyy') : ''}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-2xl mx-auto px-4 flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                  activeTab === tab.id ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
