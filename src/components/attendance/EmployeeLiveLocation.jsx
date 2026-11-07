import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { startShiftLocationSharing } from '@/lib/shiftLocationSharing';

export default function EmployeeLiveLocation({ sessionId }) {
 const {translateLiteral:tr}=useLanguage();
 const [state,setState]=useState('stopped');
 const stopRef=useRef(null);
 useEffect(()=>()=>{stopRef.current?.();},[sessionId]);
 const active=state==='starting'||state==='sharing';
 return <section className="space-y-2 rounded-xl border border-sky-400/30 p-3">
  <h3 className="text-sm font-semibold">{tr('Share live location with owner')}</h3>
  <p className="text-xs">{tr('With your permission, the owner can see your latest precise location during this shift. Only the latest point is kept. Sharing stops when you hide this page, stop sharing, check out or the shift ends.')}</p>
  <p className="text-xs">{tr('Keep this page open. Closing or locking your phone interrupts updates. GPS does not prove who is holding the phone.')}</p>
  <Button className="w-full" variant="secondary" onClick={()=>{
   if(active){stopRef.current?.();stopRef.current=null;setState('stopped');}
   else {stopRef.current?.();stopRef.current=startShiftLocationSharing({sessionId,rpc:(...args)=>supabase.rpc(...args),geolocation:navigator.geolocation,onState:setState});}
  }}>{tr(active?'Stop sharing location':'I agree — share my location with owner')}</Button>
  <p role="status" className="text-xs">{tr(state==='sharing'?'Location sharing is active — fresh GPS requested every 30 seconds.':state==='starting'?'Waiting for location permission and a fresh GPS reading…':state==='error'?'Location sharing stopped. Check GPS, permission and connection before restarting.':'Location sharing is off.')}</p>
 </section>;
}
