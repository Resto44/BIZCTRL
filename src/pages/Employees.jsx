import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, UserRound, Phone, Mail, Building2, UserPlus, Bell, Megaphone } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { formatCurrency } from '@/lib/helpers';
import { useTenant } from '@/lib/TenantContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage, subscriptionLimitMessage } from '@/lib/subscriptionLimits';
import { toast } from 'sonner';

const emptyForm = { full_name: '', employee_id: '', branch: '', position: '', base_salary: '', joining_date: '', phone: '', email: '', is_active: true, notes: '' };

export default function Employees() {
  const { currency } = useLanguage();
  const { role, user } = useRole();
  const qc = useQueryClient();
  const { ownerFilter, activeRestaurant } = useTenant();
  const { withinLimit, usage, limits, planName } = useSubscription();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [filterBranch, setFilterBranch] = useState('all');
  const [activeTab, setActiveTab] = useState('list');
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [annForm, setAnnForm] = useState({ title: '', body: '', priority: 'normal', branch_key: 'all', target_roles: '["employee","driver"]' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', ownerFilter],
    queryFn: () => base44.entities.Employee.filter(ownerFilter || {}, 'full_name', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
  });

  const saveMut = useMutation({
    mutationFn: d => editing
      ? base44.entities.Employee.update(editing.id, d)
      : base44.entities.Employee.create({ ...d, restaurant_id: activeRestaurant?.id || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setShowForm(false); setEditing(null); setForm(emptyForm); },
    onError: (error) => toast.error(subscriptionLimitErrorMessage(error, 'Unable to save employee.')),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Employee.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setDeleteId(null); },
  });

  const announceMut = useMutation({
    mutationFn: data => base44.entities.Announcement.create(data),
    onSuccess: () => {
      toast.success('Announcement posted!');
      setAnnForm({ title: '', body: '', priority: 'normal', branch_key: 'all', target_roles: '["employee","driver"]' });
      setShowAnnouncementForm(false);
    },
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements-mgr'],
    queryFn: () => base44.entities.Announcement.filter({ is_active: true }, '-created_date', 30),
  });

  const deleteAnnMut = useMutation({
    mutationFn: id => base44.entities.Announcement.update(id, { is_active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements-mgr'] }),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (e) => {
    setEditing(e);
    setForm({ full_name: e.full_name || e.name || '', employee_id: e.employee_id || '', branch: e.branch, position: e.position || '', base_salary: e.base_salary || '', joining_date: e.joining_date || '', phone: e.phone || '', email: e.email || '', is_active: e.is_active !== false, notes: e.notes || '' });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.full_name || !form.branch) return;
    if (!editing && Number(limits?.employees || 0) > 0 && !withinLimit('employees')) {
      toast.error(subscriptionLimitMessage({
        resource: 'employees',
        used: usage?.employees,
        limit: limits?.employees,
        planName,
      }));
      return;
    }
    saveMut.mutate({ ...form, full_name: form.full_name, base_salary: Number(form.base_salary) || 0 });
  };

  const filtered = employees.filter(e => filterBranch === 'all' || e.branch === filterBranch);

  if (role === 'cashier') {
    return <div className="text-center py-20 text-muted-foreground text-sm">Access restricted.</div>;
  }

  return (
    <div>
      <PageHeader title="Employees" action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAnnouncementForm(true)}>
            <Megaphone className="w-3.5 h-3.5 mr-1" /> Announce
          </Button>
          <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
        </div>
      } />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-3">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="list" className="text-xs flex items-center gap-1">
            <UserRound className="w-3.5 h-3.5" /> Employees
          </TabsTrigger>
          <TabsTrigger value="invite" className="text-xs flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Staff access
          </TabsTrigger>
          <TabsTrigger value="announcements" className="text-xs flex items-center gap-1">
            <Bell className="w-3.5 h-3.5" /> Announcements
            {announcements.length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-primary">{announcements.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="mb-3 mt-3">
            <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />
          </div>
          <div className="space-y-2">
            {isLoading ? <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p> :
              filtered.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <UserRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No employees yet</p>
                  <Button size="sm" className="mt-3" onClick={openAdd}>Add First Employee</Button>
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
                          {e.base_salary > 0 && (
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
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(e)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setDeleteId(e.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="invite" className="mt-3">
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
        </TabsContent>

        <TabsContent value="announcements" className="mt-3 space-y-3">
          <Button className="w-full gap-2 bg-primary" onClick={() => setShowAnnouncementForm(true)}>
            <Megaphone className="w-4 h-4" /> Post New Announcement
          </Button>
          {announcements.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No announcements posted
            </div>
          )}
          {announcements.map(ann => (
            <Card key={ann.id} className="p-3 border-0 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span>{ann.priority === 'urgent' ? '🚨' : ann.priority === 'important' ? '⚠️' : '📢'}</span>
                    <p className="font-semibold text-sm">{ann.title}</p>
                    <Badge variant="outline" className="text-xs">{ann.priority}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{ann.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ann.branch_key && ann.branch_key !== 'all' ? `Branch: ${ann.branch_key}` : 'All branches'}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => deleteAnnMut.mutate(ann.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

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
              <div><Label className="text-xs">Base Salary (SAR)</Label><Input type="number" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} /></div>
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
          <AlertDialogHeader><AlertDialogTitle>Delete this employee?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
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
              <div><Label className="text-xs">Priority</Label>
                <Select value={annForm.priority} onValueChange={v => setAnnForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Branch</Label>
                <BranchSelect value={annForm.branch_key} onChange={v => setAnnForm(f => ({ ...f, branch_key: v }))} includeAll />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAnnouncementForm(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!annForm.title || !annForm.body || announceMut.isPending}
                onClick={() => announceMut.mutate({
                  ...annForm,
                  posted_by: user?.email,
                  posted_by_name: user?.full_name || user?.email,
                  is_active: true,
                })}>
                {announceMut.isPending ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}