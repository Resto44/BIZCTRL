import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/base44Client';
import EmployeeRecord360 from '@/components/employees/EmployeeRecord360';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Archive, Eye, UserRound, Phone, Mail, Building2, UserPlus, Bell, Megaphone } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { formatCurrency } from '@/lib/helpers';
import { useTenant } from '@/lib/TenantContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage, subscriptionLimitMessage } from '@/lib/subscriptionLimits';
import { toast } from 'sonner';

const emptyForm = { full_name: '', employee_id: '', branch: '', position: '', base_salary: '', joining_date: '', phone: '', email: '', is_active: true, notes: '' };

export default function Employees({ embedded = false }) {
  const { currency, translateLiteral: tr } = useLanguage();
  const { role, user, can } = useRole();
  const mayEdit = role === 'owner' || can?.manageEmployees === true;
  const mayViewPayroll = role === 'owner' || can?.viewPayroll === true;
  const qc = useQueryClient();
  const { activeRestaurant, branches, managerBranch } = useTenant();
  const branchScope = role === 'manager' ? (typeof managerBranch === 'string'
    ? managerBranch : (managerBranch?.key || managerBranch?.branch_key || managerBranch?.id || '')) : '';
  const managerBranchRecord = role === 'manager'
    ? branches.find(branch => [branch.id, branch.key, branch.branch_key].includes(branchScope))
    : null;
  const managerBranchKey = managerBranchRecord?.key || managerBranchRecord?.branch_key || '';
  const { withinLimit, usage, limits, planName } = useSubscription();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [activeTab, setActiveTab] = useState('list');
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [annForm, setAnnForm] = useState({ title: '', body: '', branch_key: 'all' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: employees = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['employee-center-directory', activeRestaurant?.id, branchScope, mayViewPayroll],
    queryFn: async () => {
      const publicFields = 'id,restaurant_id,branch_id,full_name,employee_id,branch,position,phone,email,joining_date,hire_date,notes,is_active';
      const selectedFields = mayViewPayroll ? `${publicFields},base_salary,salary` : publicFields;
      let query = supabase.from('employees').select(selectedFields)
        .eq('restaurant_id', activeRestaurant.id).order('full_name').limit(1000);
      if (role === 'manager') {
        const managerBranchRecord = branches.find(b => b.key === branchScope || b.branch_key === branchScope || b.id === branchScope);
        if (!managerBranchRecord) return [];
        query = query.or(`branch_id.eq.${managerBranchRecord.id},and(branch_id.is.null,branch.eq.${managerBranchRecord.key || managerBranchRecord.branch_key})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(activeRestaurant?.id) && (role !== 'manager' || Boolean(branchScope)),
  });
  const selectedEmployee = employees.find(e => e.id === profileEmployeeId);

  const saveMut = useMutation({
    mutationFn: async d => {
      if (!mayEdit || !activeRestaurant?.id) throw new Error('Employee edit permission required.');
      const matchedBranch = branches.find(b => b.key === d.branch || b.branch_key === d.branch);
      if (!matchedBranch?.id) throw new Error('Choose a registered branch.');
      if (role === 'manager' && ![matchedBranch.key, matchedBranch.branch_key, matchedBranch.id].includes(branchScope)) {
        throw new Error('Cannot edit employees outside your assigned branch.');
      }
      const payload = { ...d, branch_id: matchedBranch.id };
      if (!mayViewPayroll) delete payload.base_salary;
      if (editing) {
        const { data, error } = await supabase.from('employees').update(payload)
          .eq('id', editing.id).eq('restaurant_id', activeRestaurant.id).select('id').single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('employees')
        .insert({ ...payload, restaurant_id: activeRestaurant.id, created_by: user?.email || null })
        .select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-center-directory'] });
      qc.invalidateQueries({ queryKey: ['kiosk-employee-list'] });
      qc.invalidateQueries({ queryKey: ['payroll-employees'] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      setShowForm(false); setEditing(null); setForm(emptyForm);
      toast.success(tr('Employee saved'));
    },
    onError: (error) => toast.error(subscriptionLimitErrorMessage(error, 'Unable to save employee.')),
  });

  const deleteMut = useMutation({
    // Archive rather than deleting payroll/attendance foreign keys or historical records.
    mutationFn: async id => {
      if (!mayEdit || !activeRestaurant?.id) throw new Error('Employee edit permission required.');
      const { data, error } = await supabase.from('employees')
        .update({ is_active: false }).eq('id', id).eq('restaurant_id', activeRestaurant.id)
        .select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-center-directory'] });
      qc.invalidateQueries({ queryKey: ['kiosk-employee-list'] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      setDeleteId(null); toast.success(tr('Employee archived; historical records preserved'));
    },
    onError: error => toast.error(error.message),
  });

  const announceMut = useMutation({
    mutationFn: async data => {
      if (!mayEdit || !activeRestaurant?.id) throw new Error('Employee management permission required.');
      const branch = branches.find(b => b.key === data.branch_key || b.branch_key === data.branch_key);
      if (role === 'manager' && (!branch || branch.id !== managerBranchRecord?.id)) {
        throw new Error('Only your assigned branch may receive announcements.');
      }
      const { error } = await supabase.from('announcements').insert({
        restaurant_id: activeRestaurant.id,
        branch_id: branch?.id || null,
        branch: branch?.key || branch?.branch_key || null,
        title: data.title.trim(),
        message: data.body.trim(),
        target_role: 'employee',
        is_active: true,
        created_by: user?.email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Announcement posted!');
      setAnnForm({ title: '', body: '', branch_key: 'all' });
      setShowAnnouncementForm(false);
      qc.invalidateQueries({ queryKey: ['employee-center-announcements'] });
    },
    onError: error => toast.error(error.message || tr('Unable to post announcement')),
  });

  const { data: announcements = [], isError: announcementsError } = useQuery({
    queryKey: ['employee-center-announcements', activeRestaurant?.id, branchScope],
    queryFn: async () => {
      let query = supabase.from('announcements').select('*')
        .eq('restaurant_id', activeRestaurant.id).eq('is_active', true)
        .order('created_date', { ascending: false }).limit(100);
      if (role === 'manager' && branchScope) {
        const managerBranchRecord = branches.find(b => b.id === branchScope || b.key === branchScope || b.branch_key === branchScope);
        const branchKey = managerBranchRecord?.key || managerBranchRecord?.branch_key || branchScope;
        query = query.or(`branch.is.null,branch.eq.${branchKey}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurant?.id,
  });

  const deleteAnnMut = useMutation({
    mutationFn: async id => {
      if (!mayEdit || !activeRestaurant?.id) throw new Error('Employee management permission required.');
      const { error } = await supabase.from('announcements').update({ is_active: false })
        .eq('restaurant_id', activeRestaurant.id).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-center-announcements'] }),
    onError: error => toast.error(error.message),
  });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, branch: managerBranchKey || '' }); setShowForm(true); };
  const openEdit = (e) => {
    setEditing(e);
    setForm({ full_name: e.full_name || e.name || '', employee_id: e.employee_id || '', branch: e.branch, position: e.position || '', base_salary: e.base_salary ?? e.salary ?? '', joining_date: e.joining_date || '', phone: e.phone || '', email: e.email || '', is_active: e.is_active !== false, notes: e.notes || '' });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!mayEdit || !form.full_name?.trim() || !form.branch || !activeRestaurant?.id) return;
    if (!editing && Number(limits?.employees || 0) > 0 && !withinLimit('employees')) {
      toast.error(subscriptionLimitMessage({
        resource: 'employees',
        used: usage?.employees,
        limit: limits?.employees,
        planName,
      }));
      return;
    }
    saveMut.mutate({ ...form, full_name: form.full_name.trim(), ...(mayViewPayroll ? { base_salary: Number(form.base_salary) || 0 } : {}) });
  };

  const filtered = employees.filter(e =>
    (filterBranch === 'all' || e.branch === filterBranch) &&
    (!search || [e.full_name, e.employee_id, e.position, e.phone].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())))
  );

  if (role === 'cashier') {
    return <div className="text-center py-20 text-muted-foreground text-sm">Access restricted.</div>;
  }

  return (
    <div>
      {!embedded && <PageHeader title={tr('Employees')} action={
        <div className="flex gap-2">
          {mayEdit && <Button size="sm" variant="outline" onClick={() => setShowAnnouncementForm(true)}>
            <Megaphone className="w-3.5 h-3.5 mr-1" /> Announce
          </Button>}
          {mayEdit && <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>}
        </div>
      } />}
      {embedded && mayEdit && <div className="mb-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAnnouncementForm(true)}>
          <Megaphone className="me-1 h-4 w-4" />{tr('Announce')}
        </Button>
        <Button size="sm" onClick={openAdd}><Plus className="me-1 h-4 w-4" />{tr('Add Employee')}</Button>
      </div>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-3">
        <TabsList className={`grid w-full ${embedded ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="list" className="text-xs flex items-center gap-1">
            <UserRound className="w-3.5 h-3.5" /> {tr('Employees')}
          </TabsTrigger>
          {!embedded && <TabsTrigger value="invite" className="text-xs flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Staff access
          </TabsTrigger>}
          <TabsTrigger value="announcements" className="text-xs flex items-center gap-1">
            <Bell className="w-3.5 h-3.5" /> {tr('Announcements')}
            {announcements.length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-primary">{announcements.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="mb-3 mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll disabled={role === 'manager'} />
            <Input aria-label={tr('Search employees')} placeholder={tr('Search name, ID, position or phone')}
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isError && <Card role="alert" className="mb-3 border-red-300 p-3 text-sm text-red-700">
            {tr('Employee records could not be loaded.')} <Button size="sm" variant="outline" onClick={() => refetch()}>{tr('Retry')}</Button>
          </Card>}
          <div className="space-y-2">
            {isError ? null : isLoading ? <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p> :
              filtered.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <UserRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No employees yet</p>
                  {mayEdit && <Button size="sm" className="mt-3" onClick={openAdd}>{tr('Add First Employee')}</Button>}
                </div>
              ) : filtered.map(e => (
                <Card key={e.id} className={`p-3 ${e.is_active === false ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserRound className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{e.full_name || e.name}</p>
                          {e.is_active === false && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.position && <span className="text-xs text-muted-foreground">{e.position}</span>}
                          <Badge variant="outline" className="text-xs flex items-center gap-0.5">
                            <Building2 className="w-2.5 h-2.5" /> {e.branch}
                          </Badge>
                          {mayViewPayroll && e.base_salary > 0 && (
                            <span className="text-xs font-semibold text-primary">{formatCurrency(e.base_salary, currency)}/mo</span>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          {e.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{e.phone}</span>}
                          {e.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-2.5 h-2.5" />{e.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button aria-label={tr('View employee records')} size="icon" variant="outline" className="h-8 w-8" onClick={() => setProfileEmployeeId(e.id)}><Eye className="h-4 w-4" /></Button>
                      {mayEdit && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(e)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>}
                      {mayEdit && e.is_active !== false && <Button aria-label={tr('Archive employee')} size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setDeleteId(e.id)}>
                        <Archive className="w-3.5 h-3.5" />
                      </Button>}
                    </div>
                  </div>
                </Card>
              ))
            }
          </div>
        </TabsContent>

        {!embedded && <TabsContent value="invite" className="mt-3">
          <Card className="border-primary/20 bg-primary/[0.03] p-5 text-center">
            <UserPlus className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Staff access is provisioned by the Owner</h2>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              Staff accounts are created only from the Owner Dashboard using secure, single-use invitations. Organization, branch, role, and permissions are assigned automatically after activation.
            </p>
            {role === 'owner' && (
              <Button asChild size="sm" className="mt-4">
                <a href="/owner-command-center">Open Owner Dashboard</a>
              </Button>
            )}
          </Card>
        </TabsContent>}

        <TabsContent value="announcements" className="mt-3 space-y-3">
          {mayEdit && <Button className="w-full gap-2 bg-primary" onClick={() => setShowAnnouncementForm(true)}>
            <Megaphone className="w-4 h-4" /> Post New Announcement
          </Button>}
          {announcementsError && <p role="alert" className="text-sm text-destructive">{tr('Unable to load announcements.')}</p>}
          {!announcementsError && announcements.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No announcements posted
            </div>
          )}
          {!announcementsError && announcements.map(ann => (
            <Card key={ann.id} className="p-3 border-0 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span>📢</span>
                    <p className="font-semibold text-sm">{ann.title}</p>
                    <Badge variant="outline" className="text-xs">{tr('Staff')}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{ann.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ann.branch ? `${tr('Branch')}: ${ann.branch}` : tr('All branches')}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => deleteAnnMut.mutate(ann.id)} disabled={!mayEdit}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedEmployee)} onOpenChange={open => !open && setProfileEmployeeId(null)}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{tr('Employee complete record')}</DialogTitle></DialogHeader>
          {selectedEmployee && <EmployeeRecord360 key={selectedEmployee.id} employee={selectedEmployee} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Full Name *</Label><Input value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
              <div><Label className="text-xs">Employee ID</Label><Input value={form.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="EMP-001" /></div>
            </div>
            <div><Label className="text-xs">Branch *</Label><BranchSelect value={form.branch} onChange={v => set('branch', v)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Position</Label><Input value={form.position} onChange={e => set('position', e.target.value)} placeholder="Cashier, Chef..." /></div>
              {mayViewPayroll && <div><Label className="text-xs">{tr('Base Salary')} ({currency})</Label><Input type="number" min="0" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} /></div>}
            </div>
            <div><Label className="text-xs">Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => set('joining_date', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              Active Employee
            </label>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={saveMut.isPending || !form.full_name || !form.branch}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{tr('Archive this employee? Attendance and payroll history will be kept.')}</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(deleteId)}>{tr('Archive')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Announcement Dialog */}
      <Dialog open={showAnnouncementForm} onOpenChange={setShowAnnouncementForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Post Announcement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title *</Label>
              <Input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Shift change tomorrow" />
            </div>
            <div><Label className="text-xs">Message *</Label>
              <Textarea value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} placeholder="Announcement details…" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Branch</Label>
                <BranchSelect value={role === 'manager' ? managerBranchKey : annForm.branch_key} disabled={role === 'manager'} onChange={v => setAnnForm(f => ({ ...f, branch_key: v }))} includeAll={role !== 'manager'} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAnnouncementForm(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!annForm.title || !annForm.body || announceMut.isPending}
                onClick={() => announceMut.mutate(annForm)}>
                {announceMut.isPending ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}