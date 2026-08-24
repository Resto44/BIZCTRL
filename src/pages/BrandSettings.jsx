import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Palette } from 'lucide-react';

const ui = {
  en: {
    brand: 'Brand Settings', brand_name: 'Brand Name', logo: 'Logo', upload_logo: 'Upload Logo', currency: 'Currency', timezone: 'Timezone', color: 'Primary Color (reports)', address: 'Address', save: 'Save Changes', saved: 'Saved!',
  },
  ar: {
    brand: 'إعدادات العلامة التجارية', brand_name: 'اسم العلامة التجارية', logo: 'الشعار', upload_logo: 'رفع شعار', currency: 'العملة', timezone: 'المنطقة الزمنية', color: 'اللون الرئيسي (التقارير)', address: 'العنوان', save: 'حفظ التغييرات', saved: 'تم الحفظ!',
  },
  fa: {
    brand: 'تنظیمات برند', brand_name: 'نام برند', logo: 'لوگو', upload_logo: 'آپلود لوگو', currency: 'ارز', timezone: 'منطقه زمانی', color: 'رنگ اصلی (گزارش‌ها)', address: 'آدرس', save: 'ذخیره تغییرات', saved: 'ذخیره شد!',
  },
};

const defaultForm = {
  brand_name: '',
  logo_url: '',
  currency: 'SAR',
  timezone: 'Asia/Riyadh',
  primary_color: '#2563EB',
  address: '',
};

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function toForm(record) {
  if (!record) return { ...defaultForm };
  return {
    brand_name: record.brand_name || '',
    logo_url: record.logo_url || '',
    currency: record.currency || 'SAR',
    timezone: record.timezone || 'Asia/Riyadh',
    primary_color: record.primary_color || '#2563EB',
    address: record.address || '',
  };
}

function formatDatabaseError(error) {
  if (!error) return 'Unable to save brand settings.';
  return [error.message, error.details, error.hint].filter(Boolean).join(' — ') || 'Unable to save brand settings.';
}

function validateAndNormalizeForm(form) {
  const primaryColor = String(form.primary_color || '').trim();
  if (!HEX_COLOR_PATTERN.test(primaryColor)) {
    throw new Error('Primary Color must be a six-digit hex color, for example #2563EB.');
  }

  const currency = String(form.currency || 'SAR').trim().toUpperCase() || 'SAR';
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new Error('Currency must be a three-letter ISO code, for example SAR.');
  }

  const timezone = String(form.timezone || 'Asia/Riyadh').trim() || 'Asia/Riyadh';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error('Timezone must be a valid IANA timezone, for example Asia/Riyadh.');
  }

  return {
    brand_name: String(form.brand_name || '').trim(),
    address: String(form.address || '').trim() || null,
    logo_url: String(form.logo_url || '').trim() || null,
    currency,
    timezone,
    primary_color: primaryColor,
  };
}

async function fetchBrandSettings(restaurantId) {
  const { data, error } = await supabase
    .from('brand_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default function BrandSettings() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { activeRestaurantId, orgId } = useTenant();
  const m = ui[lang] || ui.en;
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultForm);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [existingId, setExistingId] = useState(null);

  const {
    data: brand,
    isLoading: isLoadingBrand,
    error: loadError,
  } = useQuery({
    queryKey: ['brand_settings', activeRestaurantId],
    queryFn: () => fetchBrandSettings(activeRestaurantId),
    enabled: Boolean(activeRestaurantId),
  });

  useEffect(() => {
    if (!brand || brand.restaurant_id !== activeRestaurantId) {
      setExistingId(null);
      setForm({ ...defaultForm });
      return;
    }

    setExistingId(brand.id);
    setForm(toForm(brand));
  }, [activeRestaurantId, brand]);

  const saveMutation = useMutation({
    mutationFn: async (rawForm) => {
      if (!activeRestaurantId) {
        throw new Error('Select a restaurant before saving brand settings.');
      }

      const fields = validateAndNormalizeForm(rawForm);
      const payload = {
        ...fields,
        restaurant_id: activeRestaurantId,
        org_id: orgId || null,
        updated_date: new Date().toISOString(),
      };

      let writeError = null;
      if (existingId) {
        const { error } = await supabase
          .from('brand_settings')
          .update(payload)
          .eq('id', existingId)
          .eq('restaurant_id', activeRestaurantId);
        writeError = error;
      } else {
        const { error } = await supabase
          .from('brand_settings')
          .insert({ ...payload, created_by: user?.email || null });
        writeError = error;

        // A unique restaurant_id constraint makes simultaneous first saves safe.
        // If another request inserted first, load the row and update it instead.
        if (writeError?.code === '23505') {
          const current = await fetchBrandSettings(activeRestaurantId);
          if (!current?.id) throw writeError;

          const { error: updateError } = await supabase
            .from('brand_settings')
            .update(payload)
            .eq('id', current.id)
            .eq('restaurant_id', activeRestaurantId);
          writeError = updateError;
        }
      }

      if (writeError) throw writeError;

      // The displayed values must be the data actually persisted by Supabase.
      const savedRecord = await fetchBrandSettings(activeRestaurantId);
      if (!savedRecord) {
        throw new Error('Brand Settings saved, but the saved record could not be read back.');
      }
      return savedRecord;
    },
    onSuccess: async (savedRecord) => {
      setExistingId(savedRecord.id);
      setForm(toForm(savedRecord));
      qc.setQueryData(['brand_settings', activeRestaurantId], savedRecord);
      await qc.invalidateQueries({ queryKey: ['brand_settings', activeRestaurantId] });
      setSaveError('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
    onError: (error) => {
      const message = formatDatabaseError(error);
      console.error('[BrandSettings] save failed', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
      setSaveError(message);
    },
  });

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSaveError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((current) => ({ ...current, logo_url: file_url || '' }));
    } catch (error) {
      console.error('[BrandSettings] logo upload failed', error);
      setSaveError(formatDatabaseError(error));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    setSaved(false);
    setSaveError('');
    saveMutation.mutate(form);
  };

  return (
    <div>
      <PageHeader title={m.brand} />

      <div className="space-y-4">
        {form.logo_url && (
          <Card className="p-4 flex items-center gap-4">
            <img src={form.logo_url} alt="logo" className="h-16 w-16 object-contain rounded-lg border" />
            <div>
              <p className="font-medium text-sm">{form.brand_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{form.address}</p>
            </div>
          </Card>
        )}

        <Card className="p-4 space-y-4">
          <div>
            <Label className="text-xs">{m.brand_name}</Label>
            <Input value={form.brand_name} onChange={(event) => setForm((current) => ({ ...current, brand_name: event.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">{m.address}</Label>
            <Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">{m.logo}</Label>
            <div className="flex items-center gap-2 mt-1">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <span><Upload className="w-4 h-4" />{uploading ? '...' : m.upload_logo}</span>
                </Button>
              </label>
              {form.logo_url && <span className="text-xs text-emerald-600">✓ Uploaded</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{m.currency}</Label>
              <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{m.timezone}</Label>
              <Input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} placeholder="Asia/Riyadh" />
            </div>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-2"><Palette className="w-3 h-3" />{m.color}</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.primary_color} onChange={(event) => setForm((current) => ({ ...current, primary_color: event.target.value }))} className="w-10 h-9 rounded border cursor-pointer" />
              <Input value={form.primary_color} onChange={(event) => setForm((current) => ({ ...current, primary_color: event.target.value }))} className="w-28" />
            </div>
          </div>
          {loadError && <p className="text-sm text-destructive" role="alert">{formatDatabaseError(loadError)}</p>}
          {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
          <Button className="w-full" onClick={handleSave} disabled={saveMutation.isPending || uploading || isLoadingBrand || !activeRestaurantId}>
            {saved ? m.saved : m.save}
          </Button>
        </Card>
      </div>
    </div>
  );
}
