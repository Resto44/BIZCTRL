import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { ALL_BRANCHES, useBranchScope } from '@/lib/BranchScopeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { restaurantRpc, isRestaurantPOSPortal } from '@/lib/restaurantPOS';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsSection } from './ERPSettingsUI';

const copy = {
 en: {
  title: 'POS tax readiness', scope: 'Select one branch to configure its legal tax jurisdiction.',
  description: 'Preparation only. Existing product rates and checkout calculations remain in effect.',
  country: 'Country of business registration (ISO code, e.g. SA)', name: 'Registered legal name',
  registration: 'Tax registration', unknown: 'Not reviewed', registered: 'Registered', not_registered: 'Not registered',
  number: 'Tax registration number', mode: 'Observation mode', disabled: 'Disabled', shadow: 'Record future payment snapshots',
  disconnected: 'Government connection: not connected', notice: 'Live submission is unavailable. Country-specific invoice signing, device onboarding and authority verification must be implemented before activation. Do not enter passwords or API keys here.',
  zero: 'Active products with zero tax require classification review; zero does not establish exemption.',
  save: 'Save branch tax profile', saving: 'Saving…', loading: 'Loading…', retry: 'Retry',
  saved: 'Branch tax profile saved.', error: 'Tax configuration could not be loaded. Check access and database migration.',
  history: 'Recent payment observations (not tax invoices)', empty: 'No payment observations recorded.',
  status: 'Not submitted', invalid: 'Enter a two-letter country code, legal name and registration number when registered.',
 },
 fa: {
  title: 'آمادگی مالیاتی صندوق', scope: 'برای تنظیم کشور ثبت قانونی، یک شعبه را انتخاب کنید.',
  description: 'این بخش برای آماده‌سازی است. نرخ فعلی محصولات و محاسبهٔ صندوق همچنان برقرار است.',
  country: 'کد کشور ثبت کسب‌وکار؛ مثلاً SA', name: 'نام قانونی ثبت‌شده', registration: 'ثبت مالیاتی',
  unknown: 'بررسی نشده', registered: 'ثبت‌شده', not_registered: 'ثبت نشده', number: 'شماره ثبت مالیاتی',
  mode: 'ثبت اطلاعات آزمایشی', disabled: 'غیرفعال', shadow: 'ثبت نسخهٔ اطلاعات پرداخت‌های آینده',
  disconnected: 'اتصال اداره مالیات: متصل نیست', notice: 'ارسال دولتی فعال نیست. امضای صورتحساب، ثبت دستگاه و تأیید اداره مالیات هر کشور باید پیش از فعال‌سازی پیاده‌سازی شود. رمز عبور یا کلید API را اینجا وارد نکنید.',
  zero: 'محصولات فعال با مالیات صفر نیاز به بررسی دارند؛ صفر بودن به معنی معافیت نیست.',
  save: 'ذخیره تنظیمات مالیاتی شعبه', saving: 'در حال ذخیره…', loading: 'در حال بارگذاری…', retry: 'تلاش دوباره',
  saved: 'تنظیمات مالیاتی شعبه ذخیره شد.', error: 'بارگذاری تنظیمات ممکن نشد. دسترسی و به‌روزرسانی پایگاه داده را بررسی کنید.',
  history: 'اطلاعات پرداخت‌های اخیر؛ نه صورتحساب مالیاتی', empty: 'هنوز اطلاعات پرداختی ثبت نشده است.', status: 'ارسال نشده',
  invalid: 'کد دوحرفی کشور، نام قانونی و در صورت ثبت مالیاتی، شماره ثبت را وارد کنید.',
 },
 ar: {
  title: 'جاهزية ضريبة نقاط البيع', scope: 'اختر فرعاً واحداً لتحديد بلد التسجيل القانوني.',
  description: 'للإعداد فقط. تستمر نسب المنتجات وحسابات الصندوق الحالية.',
  country: 'رمز بلد تسجيل المنشأة؛ مثال SA', name: 'الاسم القانوني المسجل', registration: 'التسجيل الضريبي',
  unknown: 'لم تتم المراجعة', registered: 'مسجل', not_registered: 'غير مسجل', number: 'رقم التسجيل الضريبي',
  mode: 'وضع المراقبة', disabled: 'معطل', shadow: 'حفظ نسخة من بيانات المدفوعات المستقبلية',
  disconnected: 'الاتصال بالهيئة الضريبية: غير متصل', notice: 'الإرسال الحكومي غير متاح. يلزم تنفيذ توقيع الفواتير وتسجيل الأجهزة والتحقق من الهيئة لكل بلد قبل التفعيل. لا تدخل كلمات المرور أو مفاتيح API هنا.',
  zero: 'تحتاج المنتجات النشطة ذات الضريبة الصفرية إلى مراجعة التصنيف؛ الصفر لا يعني الإعفاء.',
  save: 'حفظ الملف الضريبي للفرع', saving: 'جارٍ الحفظ…', loading: 'جارٍ التحميل…', retry: 'إعادة المحاولة',
  saved: 'تم حفظ الملف الضريبي للفرع.', error: 'تعذر تحميل الإعدادات. تحقق من الصلاحيات وتحديث قاعدة البيانات.',
  history: 'ملاحظات المدفوعات الأخيرة؛ ليست فواتير ضريبية', empty: 'لم تسجل ملاحظات بعد.', status: 'لم ترسل',
  invalid: 'أدخل رمز البلد المكون من حرفين والاسم القانوني ورقم التسجيل عند اختيار مسجل.',
 },
};
const emptyProfile = { country_code: '', legal_name: '', registration_status: 'unknown', registration_number: '', mode: 'disabled', version: 0 };

export default function POSTaxReadiness() {
 const { activeRestaurant } = useTenant();
 const { selectedBranchId } = useBranchScope();
 const { lang } = useLanguage();
 const c = copy[lang] || copy.en;
 const enabled = isRestaurantPOSPortal(activeRestaurant) && Boolean(selectedBranchId && selectedBranchId !== ALL_BRANCHES);
 if (!isRestaurantPOSPortal(activeRestaurant)) return null;
 return <SettingsSection title={c.title} description={c.description}>
  {enabled ? <BranchProfile key={`${activeRestaurant.id}:${selectedBranchId}`} restaurantId={activeRestaurant.id} branchId={selectedBranchId} c={c} lang={lang} /> : <SettingsCard className="p-4 text-sm">{c.scope}</SettingsCard>}
 </SettingsSection>;
}

function BranchProfile({ restaurantId, branchId, c, lang }) {
 const client = useQueryClient();
 const key = ['restaurant-tax-profile', restaurantId, branchId];
 const [draft, setDraft] = useState(null);
 const [saving, setSaving] = useState(false);
 const [message, setMessage] = useState('');
 const args = { p_restaurant_id: restaurantId, p_branch_id: branchId };
 const query = useQuery({ queryKey: key, queryFn: () => restaurantRpc('tax_settings', args), retry: false });
 const profile = draft || query.data?.profile || emptyProfile;
 const patch = (field, value) => { setMessage(''); setDraft({ ...profile, [field]: value }); };
 const save = async () => {
  if (!/^[A-Z]{2}$/.test(profile.country_code) || !profile.legal_name.trim() || (profile.registration_status === 'registered' && !profile.registration_number.trim())) { setMessage(c.invalid); return; }
  setSaving(true); setMessage('');
  try {
   const payload = Object.fromEntries(Object.keys(emptyProfile).map(field => [field, profile[field]]));
   const data = await restaurantRpc('tax_settings', { ...args, p_profile: payload });
   client.setQueryData(key, data); setDraft(null); setMessage(c.saved);
  } catch (error) { setMessage(error.message || c.error); }
  finally { setSaving(false); }
 };
 if (query.isPending) return <p role="status">{c.loading}</p>;
 if (query.isError) return <SettingsCard className="p-4"><p role="alert">{c.error}</p><Button variant="outline" onClick={() => query.refetch()}>{c.retry}</Button></SettingsCard>;
 const selectClass = 'mt-1 min-h-11 w-full rounded-xl border bg-background p-2';
 return <SettingsCard className="space-y-4 p-4" >
  <div role="status" className="rounded-xl bg-amber-50 p-3 text-amber-950"><strong>{c.disconnected}</strong><p className="mt-1 text-sm">{c.notice}</p></div>
  <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
   <label className="text-sm">{c.country}<Input value={profile.country_code} maxLength={2} dir="ltr" onChange={e => patch('country_code', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /></label>
   <label className="text-sm">{c.name}<Input value={profile.legal_name} maxLength={200} onChange={e => patch('legal_name', e.target.value)} /></label>
   <label className="text-sm">{c.registration}<select className={selectClass} value={profile.registration_status} onChange={e => patch('registration_status', e.target.value)}>{['unknown','registered','not_registered'].map(v => <option key={v} value={v}>{c[v]}</option>)}</select></label>
   <label className="text-sm">{c.number}<Input value={profile.registration_number} maxLength={40} dir="ltr" onChange={e => patch('registration_number', e.target.value)} /></label>
   <label className="text-sm sm:col-span-2">{c.mode}<select className={selectClass} value={profile.mode} onChange={e => patch('mode', e.target.value)}>{['disabled','shadow'].map(v => <option key={v} value={v}>{c[v]}</option>)}</select></label>
  </fieldset>
  <p className="text-sm">{c.zero} <strong>{query.data.menu_review.zero_rate_count} / {query.data.menu_review.active_count}</strong></p>
  <Button onClick={save} disabled={saving || !draft}>{saving ? c.saving : c.save}</Button>
  {message && <p role="status" className="break-words text-sm">{message}</p>}
  <h3 className="font-bold">{c.history}</h3>
  {!query.data.observations.length ? <p className="text-sm">{c.empty}</p> : <ul className="space-y-2 text-sm">{query.data.observations.map(o => <li className="break-words rounded-lg border p-2" key={o.order_id}><span dir="ltr">{o.order_id}</span> · {new Date(o.recorded_at).toLocaleString(lang)} · {c.status}</li>)}</ul>}
 </SettingsCard>;
}
