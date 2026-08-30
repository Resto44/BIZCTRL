import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User, Clock, CheckCircle2, XCircle,
  LogOut, GitBranch, Bell, ClipboardList, Home
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function EmployeeDashboardERP() {
  const { user, logout } = useAuth();
  const { managerBranchObject, loadingRestaurants } = useTenant();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('home');
  const today = format(new Date(), 'yyyy-MM-dd');
  const activeBranch = managerBranchObject || (user?.branch_id
    ? { id: user.branch_id, name: user.branch_name || 'Assigned Branch' }
    : null);
  const branchId = activeBranch?.id;

  // Employee profile
  const { data: empProfile } = useQuery({
    queryKey: ['emp-profile', user?.id, user?.linked_entity_id],
    queryFn: async () => {
      let query = supabase.from('employees').select('*');
      if (user?.linked_entity_id) {
        query = query.eq('id', user.linked_entity_id);
      } else {
        query = query
          .eq('restaurant_id', user?.restaurant_id)
          .eq('branch_id', branchId)
          .eq('email', user?.email);
      }
      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: !!branchId && (!!user?.linked_entity_id || !!user?.email),
  });

  // Today's attendance
  const { data: todayAttendance } = useQuery({
    queryKey: ['emp-attendance', user?.id, today],
    queryFn: async () => {
      if (!empProfile?.id) return null;
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', empProfile.id)
        .eq('date', today)
        .single();
      return data;
    },
    enabled: !!empProfile?.id,
  });

  // My tasks
  const { data: myTasks = [] } = useQuery({
    queryKey: ['emp-tasks', user?.id, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('branch_id', branchId)
        .eq('assigned_to', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!branchId && !!user?.id,
  });

  // Announcements
  const { data: announcements = [] } = useQuery({
    queryKey: ['emp-announcements', branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!branchId,
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!empProfile?.id) throw new Error('Employee profile not found');
      const { error } = await supabase.from('attendance').insert({
        employee_id: empProfile.id,
        date: today,
        check_in: new Date().toISOString(),
        status: 'present',
        branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Checked in successfully!');
      qc.invalidateQueries({ queryKey: ['emp-attendance'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!todayAttendance?.id) throw new Error('No check-in record found');
      const { error } = await supabase
        .from('attendance')
        .update({ check_out: new Date().toISOString() })
        .eq('id', todayAttendance.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Checked out successfully!');
      qc.invalidateQueries({ queryKey: ['emp-attendance'] });
    },
    onError: (err) => toast.error(err.message),
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
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {activeTab === 'home' && (
          <>
            {/* Attendance Card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Today's Attendance
                  <span className="text-slate-500 text-xs font-normal ml-auto">{format(new Date(), 'MMM d, yyyy')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!todayAttendance ? (
                  <div className="space-y-3">
                    <p className="text-slate-400 text-sm">You haven't checked in yet today.</p>
                    <Button
                      onClick={() => checkInMutation.mutate()}
                      disabled={checkInMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {checkInMutation.isPending ? 'Checking in…' : 'Check In'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <div>
                        <p className="text-white text-sm font-medium">Checked In</p>
                        <p className="text-slate-500 text-xs">
                          {todayAttendance.check_in
                            ? format(new Date(todayAttendance.check_in), 'h:mm a')
                            : '—'}
                        </p>
                      </div>
                      {todayAttendance.check_out && (
                        <>
                          <div className="w-2 h-2 rounded-full bg-red-400 ml-4" />
                          <div>
                            <p className="text-white text-sm font-medium">Checked Out</p>
                            <p className="text-slate-500 text-xs">
                              {format(new Date(todayAttendance.check_out), 'h:mm a')}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {!todayAttendance.check_out && (
                      <Button
                        onClick={() => checkOutMutation.mutate()}
                        disabled={checkOutMutation.isPending}
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 w-full"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        {checkOutMutation.isPending ? 'Checking out…' : 'Check Out'}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

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
                      {ann.created_at ? format(new Date(ann.created_at), 'MMM d, yyyy') : ''}
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
