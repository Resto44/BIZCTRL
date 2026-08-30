import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Calculator, CalendarRange, FileText, Landmark, LockKeyhole,
  Percent, RotateCcw, Save, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import useERPSettings from '@/hooks/useERPSettings';
import { financeControlIssues } from '@/lib/erpSettings';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SavedBadge, SettingRow, SettingsCard, SettingsPageFrame, SettingsScopeSelector,
  SettingsSection, SettingsSkeleton,
} from '@/components/settings/ERPSettingsUI';
import { cn } from '@/lib/utils';

const TABS = ['General', 'Tax', 'Documents', 'Periods'];
const CURRENCIES = {
  SAR: { label: 'Saudi Riyal', symbol: 'SAR' },
  USD: { label: 'US Dollar', symbol: '$' },
  EUR: { label: 'Euro', symbol: '€' },
  AFN: { label: 'Afghan Afghani', symbol: '؋' },
};

function InlineSelect({ value, onValueChange, children, className }) {
  return (
    <Select value={String(value)} onValueChange={onValueChange}>
      <SelectTrigger className={cn('h-10 min-w-32 rounded-xl border-slate-200 bg-white text-sm font-bold shadow-none dark:border-slate-700 dark:bg-slate-900', className)}><SelectValue /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export default function FinanceTaxSettings() {
  const { setCurrency } = useLanguage();
  const {
    settings, updateSection, resetSection, discard, save, isDirty, isLoading, isSaving, saveError,
  } = useERPSettings();
  const [activeTab, setActiveTab] = useState('General');
  const finance = settings.finance || {};
  const issues = useMemo(() => financeControlIssues(finance), [finance]);
  const patchFinance = (patch) => updateSection('finance', patch);

  const handleCurrency = (code) => {
    const currency = CURRENCIES[code] || CURRENCIES.SAR;
    patchFinance({ currencyCode: code, currencySymbol: currency.symbol });
  };

  const handleSave = async () => {
    try {
      await save();
      setCurrency(finance.currencyCode || finance.currencySymbol || 'SAR');
      toast.success('Finance and tax settings saved.');
    } catch (error) {
      toast.error(error?.message || 'Finance settings could not be saved.');
    }
  };

  return (
    <SettingsPageFrame
      title="Finance & Tax"
      subtitle="Control currency, VAT, fiscal periods and ERP document numbering."
      badge={<SavedBadge isDirty={isDirty} isSaving={isSaving} />}
      actions={(
        <>
          <Button variant="outline" className="min-h-11 rounded-xl sm:min-w-32" onClick={discard} disabled={!isDirty || isSaving}>Discard</Button>
          <Button className="min-h-11 rounded-xl bg-blue-600 px-6 hover:bg-blue-700 sm:min-w-56" onClick={handleSave} disabled={!isDirty || isSaving || issues.length > 0}><Save className="mr-2 h-4 w-4" />{isSaving ? 'Saving…' : 'Save finance settings'}</Button>
        </>
      )}
    >
      <SettingsScopeSelector />
      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn('min-h-10 rounded-xl px-2 text-xs font-bold transition sm:text-sm', activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800')}>{tab}</button>)}
      </div>

      {isLoading ? <div className="mt-4"><SettingsSkeleton /></div> : (
        <div className="mt-5 space-y-6">
          {(activeTab === 'General' || activeTab === 'Tax') && (
            <div className="grid gap-5 xl:grid-cols-2">
              <SettingsSection title="Base currency" description="Used by financial reports, invoices and dashboard totals.">
                <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
                  <SettingRow icon={Landmark} title="Currency" description="Organization reporting currency">
                    <InlineSelect value={finance.currencyCode || 'SAR'} onValueChange={handleCurrency} className="w-40">{Object.entries(CURRENCIES).map(([code, meta]) => <SelectItem key={code} value={code}>{code} — {meta.label}</SelectItem>)}</InlineSelect>
                  </SettingRow>
                  <SettingRow title="Currency symbol"><Input value={finance.currencySymbol || ''} onChange={(event) => patchFinance({ currencySymbol: event.target.value.slice(0, 8) })} className="h-10 w-24 rounded-xl text-right font-bold" aria-label="Currency symbol" /></SettingRow>
                  <SettingRow title="Decimal precision"><InlineSelect value={finance.decimalPrecision ?? 2} onValueChange={(value) => patchFinance({ decimalPrecision: Number(value) })} className="w-24"><SelectItem value="0">0</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem></InlineSelect></SettingRow>
                  <SettingRow title="Exchange rates" description="Enable multi-currency reference rates"><Switch checked={Boolean(finance.exchangeRates)} onCheckedChange={(value) => patchFinance({ exchangeRates: value })} /></SettingRow>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection title="VAT & tax" description="Tax controls apply to new transactions after saving.">
                <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
                  <SettingRow icon={Percent} title="VAT enabled"><Switch checked={Boolean(finance.vatEnabled)} onCheckedChange={(value) => patchFinance({ vatEnabled: value })} /></SettingRow>
                  <SettingRow title="Default VAT rate"><div className="relative"><Input type="number" min="0" max="100" step="0.01" value={finance.defaultVatRate ?? 0} onChange={(event) => patchFinance({ defaultVatRate: Number(event.target.value) })} className="h-10 w-28 rounded-xl pr-8 text-right font-bold" aria-label="Default VAT rate" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span></div></SettingRow>
                  <SettingRow title="Tax-inclusive pricing" description="Entered prices already include VAT"><Switch checked={Boolean(finance.taxInclusivePricing)} onCheckedChange={(value) => patchFinance({ taxInclusivePricing: value })} /></SettingRow>
                  <div className="p-4"><label className="text-xs font-bold text-slate-600 dark:text-slate-300" htmlFor="vat-registration">VAT registration number</label><Input id="vat-registration" value={finance.vatRegistrationNumber || ''} onChange={(event) => patchFinance({ vatRegistrationNumber: event.target.value.replace(/\s/g, '').slice(0, 24) })} placeholder="Enter registered VAT number" className="mt-2 h-11 rounded-xl" inputMode="numeric" /></div>
                </SettingsCard>
              </SettingsSection>
            </div>
          )}

          {(activeTab === 'General' || activeTab === 'Periods') && (
            <SettingsSection title="Fiscal controls" description="Protect posted records and enforce consistent accounting behavior.">
              <SettingsCard className="grid gap-0 divide-y divide-slate-100 dark:divide-slate-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <SettingRow icon={CalendarRange} title="Fiscal year"><InlineSelect value={finance.fiscalYear || 'jan-dec'} onValueChange={(value) => patchFinance({ fiscalYear: value })}><SelectItem value="jan-dec">January — December</SelectItem><SelectItem value="apr-mar">April — March</SelectItem><SelectItem value="jul-jun">July — June</SelectItem></InlineSelect></SettingRow>
                  <SettingRow icon={Calculator} title="Accounting method"><InlineSelect value={finance.accountingMethod || 'accrual'} onValueChange={(value) => patchFinance({ accountingMethod: value })}><SelectItem value="accrual">Accrual</SelectItem><SelectItem value="cash">Cash basis</SelectItem></InlineSelect></SettingRow>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <SettingRow icon={LockKeyhole} title="Lock closed periods" description="Prevent edits after final closing"><Switch checked={Boolean(finance.lockClosedPeriods)} onCheckedChange={(value) => patchFinance({ lockClosedPeriods: value })} /></SettingRow>
                  <SettingRow icon={ShieldCheck} title="Negative stock posting"><InlineSelect value={finance.negativeStockPosting || 'blocked'} onValueChange={(value) => patchFinance({ negativeStockPosting: value })}><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="warning">Warning only</SelectItem><SelectItem value="allowed">Allowed</SelectItem></InlineSelect></SettingRow>
                </div>
              </SettingsCard>
            </SettingsSection>
          )}

          {(activeTab === 'General' || activeTab === 'Documents') && (
            <SettingsSection title="Document numbering" description="Prefixes are applied to newly generated ERP documents.">
              <SettingsCard className="grid gap-3 p-4 md:grid-cols-3">
                {[['salesInvoicePrefix', 'Sales invoice', 'SAL'], ['purchaseInvoicePrefix', 'Purchase invoice', 'PUR'], ['creditNotePrefix', 'Credit note', 'CRN']].map(([key, label, fallback]) => (
                  <label key={key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><FileText className="h-4 w-4 text-blue-600" />{label}</span><div className="mt-2 flex min-w-0 items-center gap-2"><Input value={finance[key] || ''} onChange={(event) => patchFinance({ [key]: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) })} placeholder={fallback} className="h-10 min-w-0 rounded-xl bg-white font-bold dark:bg-slate-900" /><span className="shrink-0 text-xs text-slate-400">-2026-0001</span></div></label>
                ))}
              </SettingsCard>
            </SettingsSection>
          )}

          {issues.length > 0 && (
            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><p className="font-black">{issues.length} control{issues.length === 1 ? '' : 's'} need review</p><p className="mt-0.5 text-xs leading-5 opacity-80">{issues[0]}</p></div>
            </div>
          )}
          {saveError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError.message}</p>}
          <button type="button" onClick={() => resetSection('finance')} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600"><RotateCcw className="h-3.5 w-3.5" />Reset finance defaults</button>
        </div>
      )}
    </SettingsPageFrame>
  );
}
