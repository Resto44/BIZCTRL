import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPinned, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Owner visits each branch once and saves the on-site geofence for employee personal phones.
 * No location access occurs until the owner explicitly clicks Save location.
 */
export default function BranchAttendanceGeofence() {
  const { role } = useRole();
  const { activeRestaurant, branches } = useTenant();
  const { translateLiteral: tr } = useLanguage();
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [radius, setRadius] = useState('180');
  const [onSite, setOnSite] = useState(false);
  const chosen = useMemo(() => branches.find(b => b.id === branchId), [branches, branchId]);
  const status = useQuery({
    queryKey: ['attendance-geofence-admin', activeRestaurant?.id, branchId],
    enabled: role === 'owner' && !!activeRestaurant?.id && !!chosen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('erp_attendance_geofence_admin_status', { p_branch_id: branchId });
      if (error) throw error;
      return data;
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!chosen?.id || !onSite) throw new Error('Confirm that you are physically at the selected branch.');
      if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('GPS is unavailable.');
      const coords = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        ({ coords: value }) => resolve(value),
        () => reject(new Error('Enable precise location in your browser and retry.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      ));
      if (!Number.isFinite(coords.accuracy) || coords.accuracy > 40) {
        throw new Error('GPS accuracy must be 40 metres or better to set the branch location.');
      }
      const { data, error } = await supabase.rpc('erp_attendance_configure_geofence', {
        p_branch_id: chosen.id,
        p_latitude: coords.latitude,
        p_longitude: coords.longitude,
        p_radius_m: Number(radius),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(tr('Attendance location saved for this branch.'));
      qc.invalidateQueries({ queryKey: ['attendance-geofence-admin'] });
      setOnSite(false);
    },
    onError: e => toast.error(tr(e.message)),
  });
  if (role !== 'owner') return null;
  return <Card className="mb-4 border-primary/20">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm">
        <MapPinned className="h-4 w-4 text-primary" />
        {tr('Personal-phone attendance — branch GPS setup')}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">{tr('Visit the branch and save its precise GPS location once. Employees cannot check in from personal phones until this is configured.')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select value={branchId} onValueChange={id => { setBranchId(id); setOnSite(false); }}>
          <SelectTrigger aria-label={tr('Select branch')}><SelectValue placeholder={tr('Select branch')} /></SelectTrigger>
          <SelectContent>{branches.filter(b => b.id).map(b =>
            <SelectItem key={b.id} value={b.id}>{b.label || b.name || b.key}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={radius} onValueChange={setRadius}>
          <SelectTrigger aria-label={tr('Allowed distance')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {[100,150,180,250,300].map(n => <SelectItem key={n} value={String(n)}>{n} m</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {chosen && (status.isPending ? <p className="text-xs text-muted-foreground">{tr('Loading location settings...')}</p>
        : status.isError ? <p role="alert" className="text-xs text-destructive">{tr('Unable to load location settings.')}</p>
        : <p className="text-xs text-muted-foreground">{status.data?.configured
            ? tr('Location is configured for this branch.') + ' (' + status.data.radius_m + 'm)'
            : tr('Location has not been configured for this branch.')}</p>)}
      <label className="flex items-start gap-2 text-xs">
        <Switch checked={onSite} onCheckedChange={v => setOnSite(v === true)} />
        <span>{tr('I am physically at this branch and will use my current GPS position.')}</span>
      </label>
      <Button type="button" size="sm" className="w-full sm:w-auto"
        disabled={!chosen || !onSite || mutation.isPending}
        onClick={() => mutation.mutate()}>
        {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {tr('Save branch attendance location')}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        {tr('Mobile GPS can be spoofed. Review suspicious entries and keep approved employee accounts and PINs private.')}
      </p>
    </CardContent>
  </Card>;
}
