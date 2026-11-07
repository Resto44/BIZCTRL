import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Send, MessageSquare, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { calcTotal } from '@/lib/roster';
import { toast } from 'sonner';

const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

export default function RosterCard({ roster, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);

  // DB stores shifts as jsonb (already an array); fall back to JSON.parse for legacy string values
  const shifts = (() => {
    if (Array.isArray(roster.shifts)) return roster.shifts;
    try { return JSON.parse(roster.shifts || '[]'); } catch { return []; }
  })();
  // DB column names: week_starting (not week_start), email (not staff_email), whatsapp (not staff_phone)
  const weekLabel = roster.week_starting || roster.week_start;
  const staffEmail = roster.email || roster.staff_email;
  const staffPhone = roster.whatsapp || roster.staff_phone;

  const sendReminder = async (via) => {
    setSending(true);
    try {
      if (via === 'email' && staffEmail) {
        const shiftText = shifts.map(s => `${DAY_SHORT[s.day]}: ${s.start}–${s.end}${s.note ? ` (${s.note})` : ''}`).join('\n');
        await base44.integrations.Core.SendEmail({
          to: staffEmail,
          subject: `Your Schedule — Week of ${weekLabel}`,
          body: `Hi ${roster.staff_name},\n\nHere is your schedule for the week starting ${weekLabel} at branch ${roster.branch}:\n\n${shiftText}\n\nTotal: ${calcTotal(roster.shifts).toFixed(1) || '?'}h\n\n${roster.notes ? `Notes: ${roster.notes}\n\n` : ''}Please confirm receipt of this message.\n\nThank you!`,
        });
        toast.success('Shift reminder sent via email');
      } else if (via === 'whatsapp' && staffPhone) {
        const shiftText = shifts.map(s => `${DAY_SHORT[s.day]}: ${s.start}–${s.end}`).join(', ');
        const msg = encodeURIComponent(`Hi ${roster.staff_name}! Your schedule for week of ${weekLabel} (${roster.branch}): ${shiftText}. Total: ${calcTotal(roster.shifts).toFixed(1) || '?'}h.`);
        window.open(`https://wa.me/${staffPhone.replace(/\D/g, '')}?text=${msg}`, '_blank');
      } else {
        toast.error(`No ${via} contact available`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{roster.staff_name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className="text-xs">{roster.branch}</Badge>
            <span className="text-xs text-muted-foreground">w/o {weekLabel}</span>
            {calcTotal(roster.shifts) > 0 && <Badge variant="secondary" className="text-xs">{calcTotal(roster.shifts).toFixed(1)}h</Badge>}
          </div>
          {shifts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {shifts.slice(0, expanded ? shifts.length : 3).map((s, i) => (
                <span key={i} className="text-xs bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                  {DAY_SHORT[s.day]} {s.start}–{s.end}
                </span>
              ))}
              {!expanded && shifts.length > 3 && (
                <button className="text-xs text-primary" onClick={() => setExpanded(true)}>+{shifts.length - 3} more</button>
              )}
            </div>
          )}
          {expanded && shifts.length > 3 && (
            <button className="text-xs text-muted-foreground mt-1 flex items-center gap-1" onClick={() => setExpanded(false)}>
              <ChevronUp className="w-3 h-3" /> Show less
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(roster)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(roster.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" title="Send email reminder" onClick={() => sendReminder('email')} disabled={sending || !staffEmail}>
              <Send className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7 text-green-600 border-green-200" title="WhatsApp reminder" onClick={() => sendReminder('whatsapp')} disabled={sending || !staffPhone}>
              <MessageSquare className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}