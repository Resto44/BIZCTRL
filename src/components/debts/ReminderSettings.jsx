import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bell, MessageCircle, Loader2, CheckCircle, Phone } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { collectionActionPayload } from '@/lib/debtCollection';
import { useDebtI18n } from '@/lib/debtI18n';

const SETTING_KEY = 'debt_reminder_settings';
const DEFAULT_SETTINGS = {
  enabled: true,
  days_before: 3,
  days_after: 1,
  message_template: 'عزيزي {name}، نذكّركم بأن لديكم مبلغ {amount} ر.س مستحق السداد بتاريخ {due_date}. يُرجى التواصل معنا لتسوية الأمر. شكراً.',
};

export default function ReminderSettings({ debts, onLogAction }) {
  const { user } = useAuth();
  const d = useDebtI18n();
  const [logError, setLogError] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState({});
  const [sentLog, setSentLog] = useState({});

  // Load settings from AppSettings
  useEffect(() => {
    base44.entities.AppSettings.filter({ key: SETTING_KEY }, '-created_date', 1).then(rows => {
      if (rows[0]?.value) {
        try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) }); } catch {}
      }
    });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    const existing = await base44.entities.AppSettings.filter({ key: SETTING_KEY }, '-created_date', 1);
    const payload = { key: SETTING_KEY, value: JSON.stringify(settings) };
    if (existing[0]) await base44.entities.AppSettings.update(existing[0].id, payload);
    else await base44.entities.AppSettings.create(payload);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const buildMessage = (debt) => settings.message_template
    .replace('{name}', debt.party_name)
    .replace('{amount}', (debt.remaining_amount || 0).toLocaleString())
    .replace('{due_date}', debt.due_date || 'غير محدد');

  // Get debts eligible for reminder
  const eligible = debts.filter(d => {
    if (d.status === 'paid' || d.status === 'written_off') return false;
    if (!d.party_phone && !d.party_name) return false;
    if (!d.due_date) return false;
    const diff = differenceInDays(parseISO(d.due_date), new Date());
    return diff <= settings.days_before && diff >= -30; // within window
  });

  const sendWhatsApp = (debt) => {
    const msg = encodeURIComponent(buildMessage(debt));
    const phone = (debt.party_phone || '').replace(/\D/g, '');
    if (!phone) { alert('لا يوجد رقم هاتف لهذا العميل'); return; }
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    logSent(debt, 'whatsapp');
  };

  const sendSMS = (debt) => {
    const phone = (debt.party_phone || '').replace(/\D/g, '');
    if (!phone) { alert('لا يوجد رقم هاتف لهذا العميل'); return; }
    window.open(`sms:${phone}?body=${encodeURIComponent(buildMessage(debt))}`, '_blank');
    logSent(debt, 'sms');
  };

  const logSent = async (debt, channel) => {
    setSending(s => ({ ...s, [debt.id]: true }));
    setLogError(false);
    try {
      await base44.entities.CollectionAction.create(collectionActionPayload(debt, {
        action_type: 'message',
        outcome: `Reminder opened via ${channel}: ${buildMessage(debt)}`,
      }, user?.email));
      setSentLog(s => ({ ...s, [debt.id]: channel }));
      onLogAction?.();
    } catch { setLogError(true); }
    finally { setSending(s => ({ ...s, [debt.id]: false })); }

  };

  return (
    <div className="space-y-4">
      {logError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{d.action_error}</p>}
      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            إعدادات التذكيرات التلقائية
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">تفعيل التذكيرات</Label>
            <Switch checked={settings.enabled} onCheckedChange={v => setSettings(s => ({ ...s, enabled: v }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">التذكير قبل الاستحقاق (أيام)</Label>
              <Input
                type="number" min="0" max="30"
                value={settings.days_before}
                onChange={e => setSettings(s => ({ ...s, days_before: parseInt(e.target.value) || 0 }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">التذكير بعد التأخر (أيام)</Label>
              <Input
                type="number" min="0" max="30"
                value={settings.days_after}
                onChange={e => setSettings(s => ({ ...s, days_after: parseInt(e.target.value) || 0 }))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">نص الرسالة</Label>
            <p className="text-[10px] text-muted-foreground">متغيرات: {'{name}'}, {'{amount}'}, {'{due_date}'}</p>
            <Textarea
              rows={3}
              value={settings.message_template}
              onChange={e => setSettings(s => ({ ...s, message_template: e.target.value }))}
              className="text-sm"
            />
          </div>

          <Button size="sm" className="w-full gap-2" onClick={saveSettings} disabled={saving}>
            {saved ? <CheckCircle className="w-4 h-4 text-green-500" /> : saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saved ? 'تم الحفظ!' : saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </CardContent>
      </Card>

      {/* Eligible Debts for Reminder */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-600" />
            تذكيرات جاهزة للإرسال
          </h3>
          <Badge className="bg-amber-100 text-amber-700 text-xs">{eligible.length}</Badge>
        </div>

        {eligible.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm">لا توجد تذكيرات مطلوبة حالياً</p>
          </div>
        ) : (
          <div className="space-y-3">
            {eligible.map(debt => {
              const diff = differenceInDays(parseISO(debt.due_date), new Date());
              const isOverdue = diff < 0;
              const isSent = sentLog[debt.id];

              return (
                <Card key={debt.id} className={`${isOverdue ? 'border-red-200' : 'border-amber-200'} ${isSent ? 'opacity-70' : ''}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{debt.party_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {debt.party_phone || 'لا يوجد هاتف'}
                        </div>
                        <Badge className={`text-[10px] mt-1 ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isOverdue ? `متأخر ${Math.abs(diff)} يوم` : `يستحق خلال ${diff} يوم`}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-red-600">{(debt.remaining_amount || 0).toLocaleString()} ر.س</div>
                        {isSent && <div className="text-[10px] text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> تم الإرسال</div>}
                      </div>
                    </div>

                    {/* Preview message */}
                    <div className="bg-slate-50 rounded-lg p-2 text-[11px] text-muted-foreground">
                      {buildMessage(debt)}
                    </div>

                    {debt.party_phone ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 gap-1"
                          onClick={() => sendWhatsApp(debt)}
                          disabled={sending[debt.id]}
                        >
                          {sending[debt.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : '📱'}
                          واتساب
                        </Button>
                        <Button
                          size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1"
                          onClick={() => sendSMS(debt)}
                          disabled={sending[debt.id]}
                        >
                          <Phone className="w-3 h-3" />
                          SMS
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center">أضف رقم الهاتف لتفعيل الإرسال</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}