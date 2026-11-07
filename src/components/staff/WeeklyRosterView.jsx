import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { useTenant } from '@/lib/TenantContext';
import { calcTotal, rosterPayload } from '@/lib/roster';
import { toast } from 'sonner';
import RosterForm from './RosterForm';
import RosterCard from './RosterCard';
import { format, startOfWeek, addDays, subDays } from 'date-fns';

export default function WeeklyRosterView() {
  const qc = useQueryClient();
  const { activeRestaurant, branches } = useTenant();
  const [saveError, setSaveError] = useState('');
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [branch, setBranch] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: rosters = [], isLoading } = useQuery({
    queryKey: ['staff_rosters', activeRestaurant?.id],
    enabled: !!activeRestaurant?.id,
    queryFn: () => base44.entities.StaffRoster.filter({ restaurant_id: activeRestaurant.id }, '-week_starting', 500),
  });

  const createMut = useMutation({
    mutationFn: d => base44.entities.StaffRoster.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff_rosters'] }); setShowForm(false); toast.success('Roster saved'); },
    onError: (error) => { setSaveError(error.message || 'Unable to save roster. Please try again.'); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StaffRoster.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff_rosters'] }); setEditing(null); },
    onError: (error) => { setSaveError(error.message || 'Unable to save roster. Please try again.'); },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.StaffRoster.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff_rosters'] }),
  });

  // DB column is week_starting (not week_start)
  const filtered = useMemo(() => rosters.filter(r =>
    (r.week_starting || r.week_start) === weekStart && (branch === 'all' || r.branch === branch)
  ), [rosters, weekStart, branch]);


  const totalHours = filtered.reduce((s, r) => s + calcTotal(r.shifts), 0);

  const prevWeek = () => setWeekStart(format(subDays(new Date(weekStart), 7), 'yyyy-MM-dd'));
  const nextWeek = () => setWeekStart(format(addDays(new Date(weekStart), 7), 'yyyy-MM-dd'));

  const handleEdit = (r) => { setSaveError(''); setEditing(r); setShowForm(false); };
  const handleSubmit = (data) => {
    setSaveError('');
    try {
      const payload = rosterPayload(data, activeRestaurant?.id, branches);
      setWeekStart(payload.week_starting);
      setBranch(payload.branch);
      if (editing) updateMut.mutate({ id: editing.id, data: payload });
      else createMut.mutate(payload);
    } catch (error) { setSaveError(error.message); }
  };

  return (
    <div className="space-y-4">
      {/* Week Navigator */}
      <Card className="p-3 flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={prevWeek}><ChevronLeft className="w-4 h-4" /></Button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold">Week of {weekStart}</p>
          <p className="text-xs text-muted-foreground">{format(addDays(new Date(weekStart), 6), 'MMM d')}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={nextWeek}><ChevronRight className="w-4 h-4" /></Button>
      </Card>

      <div className="flex gap-2">
        <div className="flex-1"><BranchSelect value={branch} onChange={setBranch} includeAll /></div>
        <Button size="sm" onClick={() => { setSaveError(''); setShowForm(true); setEditing(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {filtered.length > 0 && (
        <Card className="p-3 flex items-center justify-between bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{filtered.length} staff scheduled</span>
          </div>
          <span className="text-sm font-bold text-primary">{totalHours.toFixed(1)}h total</span>
        </Card>
      )}

      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">Loading rosters...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No roster for this week</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => { setSaveError(''); setShowForm(true); setEditing(null); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Create Roster
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <RosterCard key={r.id} roster={r} onEdit={handleEdit} onDelete={id => deleteMut.mutate(id)} />
          ))}
        </div>
      )}

      <Dialog open={showForm || !!editing} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Roster' : 'New Roster Entry'}</DialogTitle></DialogHeader>
          <RosterForm
            initial={editing || { week_starting: weekStart, branch: branch === 'all' ? '' : branch }}
            saving={createMut.isPending || updateMut.isPending}
            error={saveError}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}