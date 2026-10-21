import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import HelpCenter, { HELP_COPY } from '@/components/help/HelpCenter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole, ROLE_HOME } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SupportTicketForm from '@/components/support/SupportTicketForm';
import {
  HeadphonesIcon, Plus, Clock, CheckCircle2, MessageSquare,
  Paperclip, Mic, ChevronRight, RefreshCw
} from 'lucide-react';

const STATUS_CONFIG = {
  open:        { label: 'Open',        cls: 'bg-blue-100 text-blue-700',    icon: Clock },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700',  icon: RefreshCw },
  resolved:    { label: 'Resolved',    cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  closed:      { label: 'Closed',      cls: 'bg-gray-100 text-gray-600',    icon: CheckCircle2 },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      cls: 'bg-gray-100 text-gray-600' },
  medium:   { label: 'Medium',   cls: 'bg-blue-100 text-blue-700' },
  high:     { label: 'High',     cls: 'bg-amber-100 text-amber-700' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
};

const CATEGORY_LABELS = {
  bug: '🐛 Bug', feature_request: '💡 Feature', billing: '💳 Billing',
  urgent: '🚨 Urgent', general: '💬 General',
};

const LABELS = {
  en: {
    title: 'Support Center', new_ticket: 'New Ticket', my_tickets: 'My Tickets',
    no_tickets: 'No support tickets yet', loading: 'Loading...',
    view_details: 'View Details', subject: 'Subject', category: 'Category',
    priority: 'Priority', status: 'Status', created: 'Created',
    attachments: 'Attachments', voice: 'Voice Message',
  },
  ar: {
    title: 'مركز الدعم', new_ticket: 'تذكرة جديدة', my_tickets: 'تذاكري',
    no_tickets: 'لا توجد تذاكر دعم بعد', loading: 'جاري التحميل...',
    view_details: 'عرض التفاصيل', subject: 'الموضوع', category: 'التصنيف',
    priority: 'الأولوية', status: 'الحالة', created: 'تاريخ الإنشاء',
    attachments: 'المرفقات', voice: 'رسالة صوتية',
  },
  fa: {
    title: 'مرکز پشتیبانی', new_ticket: 'تیکت جدید', my_tickets: 'تیکت‌های من',
    no_tickets: 'هنوز تیکتی ندارید', loading: 'در حال بارگذاری...',
    view_details: 'مشاهده جزئیات', subject: 'موضوع', category: 'دسته‌بندی',
    priority: 'اولویت', status: 'وضعیت', created: 'تاریخ ایجاد',
    attachments: 'پیوست‌ها', voice: 'پیام صوتی',
  },
};

export function parseTicketAttachments(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) : [];
  } catch { return []; }
}

function TicketCard({ ticket, onClick }) {
  const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
  const StatusIcon = status.icon;
  const attachments = parseTicketAttachments(ticket.attachments);

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground">{ticket.ticket_number}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
              <StatusIcon className="w-2.5 h-2.5 inline mr-0.5" />{status.label}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priority.cls}`}>
              {priority.label}
            </span>
            {ticket.category && (
              <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[ticket.category]}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{ticket.subject}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{ticket.message}</p>
          <div className="flex items-center gap-3 mt-2">
            {attachments.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Paperclip className="w-3 h-3" />{attachments.length}
              </span>
            )}
            {ticket.voice_url && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Mic className="w-3 h-3" />Voice
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ms-auto">
              {ticket.created_date ? new Date(ticket.created_date).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Card>
  );
}

function TicketDetail({ ticket, onClose }) {
  const attachments = parseTicketAttachments(ticket.attachments);
  const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.cls}`}>{status.label}</span>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${priority.cls}`}>{priority.label}</span>
        <span className="text-xs bg-secondary px-2 py-1 rounded-full">{CATEGORY_LABELS[ticket.category]}</span>
        <span className="text-xs font-mono text-muted-foreground self-center">{ticket.ticket_number}</span>
      </div>

      <div className="bg-muted/50 rounded-xl p-4">
        <p className="text-sm font-semibold mb-2">{ticket.subject}</p>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.message}</p>
      </div>

      {ticket.voice_url && (
        <div className="bg-primary/5 rounded-xl p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Mic className="w-3.5 h-3.5" /> Voice Message
          </p>
          <audio controls src={ticket.voice_url} className="w-full h-10" />
        </div>
      )}

      {attachments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Paperclip className="w-3.5 h-3.5" /> Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((att, i) => (
              <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity">
                {att.type?.startsWith('image') ? (
                  <img src={att.url} alt={att.name} className="w-full h-20 object-cover" />
                ) : (
                  <div className="h-20 flex items-center justify-center bg-secondary">
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground ms-1 truncate px-1">{att.name}</span>
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {ticket.admin_notes && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Support Response
          </p>
          <p className="text-sm text-emerald-800">{ticket.admin_notes}</p>
        </div>
      )}
    </div>
  );
}

export default function Support() {
  const { user } = useAuth();
  const { role } = useRole();
  const dashboardPath = ROLE_HOME[role] || (user?.role ? ROLE_HOME[user.role] : null);
  const { lang: language, dir } = useLanguage();
  const [params, setParams] = useSearchParams();
  const showTickets = params.get("tab") === "tickets";
  const helpCopy = HELP_COPY[language] || HELP_COPY.en;
  const lbl = LABELS[language] || LABELS.en;
  const qc = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const { data: tickets = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['support_tickets', user?.email],
    queryFn: () => base44.entities.SupportTicket.filter({ submitted_by: user?.email }, '-created_date', 100),
    enabled: !!user?.email && showTickets,
    staleTime: 30000,
  });

  const handleClose = () => {
    setShowNew(false);
    setParams({ tab: 'tickets' });
    qc.invalidateQueries({ queryKey: ['support_tickets'] });
  };

  return (
    <div dir={dir} className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HeadphonesIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{helpCopy.title}</h1>
            <p className="text-xs text-muted-foreground">{lbl.my_tickets}</p>
          </div>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />{lbl.new_ticket}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={helpCopy.title}>
        {[['guides', helpCopy.title], ['tickets', lbl.my_tickets]].map(([tab, label]) => <Button key={tab} variant={(showTickets ? 'tickets' : 'guides') === tab ? 'default' : 'outline'} aria-pressed={(showTickets ? 'tickets' : 'guides') === tab} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true })}>{label}</Button>)}
      </div>
      {!showTickets ? <HelpCenter dashboardPath={dashboardPath} /> : isError ? <div role="alert" className="rounded-xl border p-4"><p>{language === 'fa' ? 'تیکت‌ها دریافت نشد.' : language === 'ar' ? 'تعذر تحميل التذاكر.' : 'Could not load support tickets.'}</p><Button className="mt-3" onClick={() => refetch()}>{language === 'fa' ? 'تلاش دوباره' : language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button></div> : isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-8">{lbl.loading}</p>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <HeadphonesIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">{lbl.no_tickets}</p>
          <Button className="mt-4" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1" />{lbl.new_ticket}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <TicketCard key={t.id} ticket={t} onClick={() => setSelected(t)} />
          ))}
        </div>
      )}

      {/* New ticket dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeadphonesIcon className="w-5 h-5 text-primary" />{lbl.title}
            </DialogTitle>
          </DialogHeader>
          <SupportTicketForm lang={language} onClose={handleClose} />
        </DialogContent>
      </Dialog>

      {/* Ticket detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
          </DialogHeader>
          {selected && <TicketDetail ticket={selected} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}