import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { startShiftLocationSharing } from '@/lib/shiftLocationSharing';

const statusMessages = {
 sharing: 'Location sharing is active — fresh GPS requested every 30 seconds.',
 starting: 'Waiting for location permission and a fresh GPS reading…',
 retrying: 'GPS temporarily unavailable. Retrying automatically; keep this page open.',
 paused: 'Sharing paused because this page was hidden. Keep the employee page open and view the owner portal on another device. Tap Share to restart.',
 'permission-denied': 'Location permission was denied. On iPhone, allow Location for this website in Safari website settings and enable Precise Location in Settings → Privacy & Security → Location Services → Safari Websites.',
 'gps-timeout': 'GPS timed out after three attempts. Move near a window or outdoors, keep the page open, then try again.',
 'gps-unavailable': 'Your phone could not provide GPS. Check Location Services and your connection, then try again.',
 'stale-location': 'Your phone returned an old location. Enable automatic date and time, reopen Safari and try again outdoors.',
 'session-error': 'This sharing session ended or your shift is no longer open. Refresh attendance before trying again.',
 'connection-error': 'Location could not be sent to the server. Check your internet connection and try again.',
 stopped: 'Location sharing is off.',
};
export default function EmployeeLiveLocation({ sessionId }) {
 const {translateLiteral:tr}=useLanguage();
 const [state,setState]=useState('stopped');
 const stopRef=useRef(null);
 useEffect(()=>()=>{stopRef.current?.();},[sessionId]);
 const active=state==='starting'||state==='sharing'||state==='retrying';
 return <section className="space-y-2 rounded-xl border border-sky-400/30 p-3">
  <h3 className="text-sm font-semibold">{tr('Share live location with owner')}</h3>
  <p className="text-xs">{tr('With your permission, the owner can see your latest precise location during this shift. Only the latest point is kept. Sharing stops when you hide this page, stop sharing, check out or the shift ends.')}</p>
  <p className="text-xs">{tr('Keep this page open. Closing or locking your phone interrupts updates. GPS does not prove who is holding the phone.')}</p>
  <Button className="w-full" variant="secondary" onClick={()=>{
   if(active){stopRef.current?.();stopRef.current=null;setState('stopped');}
   else {stopRef.current?.();stopRef.current=startShiftLocationSharing({sessionId,rpc:(...args)=>supabase.rpc(...args),geolocation:navigator.geolocation,onState:setState});}
  }}>{tr(active?'Stop sharing location':'I agree — share my location with owner')}</Button>
  <p role="status" className="text-xs">{tr(statusMessages[state] || statusMessages.stopped)}</p>
 </section>;
}
