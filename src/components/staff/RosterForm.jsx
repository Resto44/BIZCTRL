import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BranchSelect from '@/components/shared/BranchSelect';
import { format, startOfWeek } from 'date-fns';
import { getWeekDates, calcTotal } from '@/lib/roster';
import { Plus, Trash2 } from 'lucide-react';

export default function RosterForm({ initial, onSubmit, onCancel, saving, error }) {
  const monday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const [validation, setValidation] = useState('');
  const [form, setForm] = useState({
    // Support both DB column names (week_starting, email, whatsapp) and legacy names for edits
    week_start: initial?.week_starting || initial?.week_start || monday,
    branch: initial?.branch || '',
    staff_name: initial?.staff_name || '',
    staff_email: initial?.email || initial?.staff_email || '',
    staff_phone: initial?.whatsapp || initial?.staff_phone || '',
    notes: initial?.notes || '',
    // DB stores shifts as jsonb (array); fall back to JSON.parse for legacy string values
    shifts: Array.isArray(initial?.shifts)
      ? initial.shifts
      : (initial?.shifts ? (() => { try { return JSON.parse(initial.shifts); } catch { return []; } })() : []),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShift = () => setForm(f => ({ ...f, shifts: [...f.shifts, { day: getWeekDates(f.week_start)[0]?.day || 'monday', start: '09:00', end: '17:00', note: '' }] }));
  const removeShift = (i) => setForm(f => ({ ...f, shifts: f.shifts.filter((_, idx) => idx !== i) }));
  const updateShift = (i, key, val) => setForm(f => {
    const shifts = [...f.shifts];
    shifts[i] = { ...shifts[i], [key]: val };
    return { ...f, shifts };
  });

  const total = calcTotal(form.shifts);
  const weekDates = getWeekDates(form.week_start);

  const handleSubmit = () => {
    if (!form.branch || !form.staff_name.trim() || !form.week_start || !form.shifts.length) { setValidation('Select a branch, date, staff name and at least one shift.'); return; }
    if (form.shifts.some(s => !s.start || !s.end || s.start === s.end)) { setValidation('Enter different start and end times for every shift.'); return; }
    setValidation('');
    onSubmit({ ...form, staff_name: form.staff_name.trim(), shifts: form.shifts, total_hours: total });
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 [&>div]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full">
        <div><Label className="text-xs">Week Starting</Label><Input type="date" value={form.week_start} onChange={e => set('week_start', e.target.value)} /></div>
        <div><Label className="text-xs">Branch</Label><BranchSelect value={form.branch} onChange={v => set('branch', v)} /></div>
      </div>
      <div><Label className="text-xs">Staff Name *</Label><Input value={form.staff_name} onChange={e => set('staff_name', e.target.value)} placeholder="Full name" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 [&>div]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full">
        <div><Label className="text-xs">Email</Label><Input type="email" value={form.staff_email} onChange={e => set('staff_email', e.target.value)} /></div>
        <div><Label className="text-xs">WhatsApp</Label><Input value={form.staff_phone} onChange={e => set('staff_phone', e.target.value)} placeholder="+1234..." /></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold">Shifts</Label>
          {total > 0 && <Badge variant="secondary" className="text-xs">{total.toFixed(1)}h total</Badge>}
        </div>
        <div className="space-y-2">
          {form.shifts.map((sh, i) => (
            <Card key={i} className="p-2 space-y-1.5">
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_6rem_auto_6rem_auto] items-center gap-1.5">
                <select
                  value={sh.day}
                  onChange={e => updateShift(i, 'day', e.target.value)}
                  className="col-span-2 sm:col-span-1 min-w-0 text-xs h-8 rounded-md border border-input bg-transparent px-2"
                >
                  {weekDates.map(({ day, date }) => (
                    <option key={day} value={day}>{day.charAt(0).toUpperCase() + day.slice(1, 3)} ({date})</option>
                  ))}
                </select>
                <Input type="time" value={sh.start} onChange={e => updateShift(i, 'start', e.target.value)} className="w-full min-w-0 text-xs h-8" />
                <span className="hidden sm:block text-xs text-muted-foreground">–</span>
                <Input type="time" value={sh.end} onChange={e => updateShift(i, 'end', e.target.value)} className="w-full min-w-0 text-xs h-8" />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeShift(i)}><Trash2 className="w-3 h-3" /></Button>
              </div>
              <Input value={sh.note} onChange={e => updateShift(i, 'note', e.target.value)} placeholder="Shift note (optional)" className="text-xs h-7" />
            </Card>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full mt-2" onClick={addShift}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Shift
        </Button>
      </div>

      <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => set('notes', e.target.value)} /></div>

      {(validation || error) && <p role="alert" className="text-sm text-destructive">{validation || error}</p>}
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" disabled={saving} onClick={handleSubmit}>{saving ? 'Saving...' : 'Save Roster'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}