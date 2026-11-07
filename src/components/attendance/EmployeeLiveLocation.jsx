import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { startShiftLocationSharing } from '@/lib/shiftLocationSharing';

const statusMessages = {
 sharing: 'Location sharing is active — fresh GPS requested every 30 seconds.',
 starting: 'Waiting for location permission and a fresh GPS reading…',
 retrying: 'GPS temporarily unavailable. Retrying automatically; keep this page open.',
 paused: 'Location updates are paused while this page is hidden. They resume when you return during the same shift. Missing updates are not proof of presence.',
 'permission-denied': 'Location permission was denied. On iPhone, allow Location for this website in Safari website settings and enable Precise Location in Settings → Privacy & Security → Location Services → Safari Websites.',
 'gps-timeout': 'GPS timed out after three attempts. Move near a window or outdoors, keep the page open, then try again.',
 'gps-unavailable': 'Your phone could not provide GPS. Check Location Services and your connection, then try again.',
 'stale-location': 'Your phone returned an old location. Enable automatic date and time, reopen Safari and try again outdoors.',
 'session-error': 'This sharing session ended or your shift is no longer open. Refresh attendance before trying again.',
 'connection-error': 'Location could not be sent to the server. Check your internet connection and try again.',
 stopped: 'Location sharing is off.',
};
export default function EmployeeLiveLocation({ sessionId, startWithConsent = false, onStop }) {
 const {translateLiteral:tr}=useLanguage();
 const [state,setState]=useState('stopped');
 const stopRef=useRef(null);
 const key=`attendance-history-consent:${sessionId}`;
 const remember=useCallback(value=>{try{if(value)sessionStorage.setItem(key,'yes');else sessionStorage.removeItem(key);}catch{/* Sharing still works without storage. */}},[key]);
 const start=useCallback(()=>{
  stopRef.current?.();remember(true);
  stopRef.current=startShiftLocationSharing({sessionId,rpc:(...args)=>supabase.rpc(...args),geolocation:navigator.geolocation,resumeOnVisible:true,onState:next=>{
   setState(next);if(['permission-denied','session-error'].includes(next))remember(false);
  }});
 },[sessionId,remember]);
 useEffect(()=>{
  let saved=false;try{saved=sessionStorage.getItem(key)==='yes';}catch{/* Private browser storage may be unavailable. */}
  if(startWithConsent||saved)start();
  return()=>{stopRef.current?.();};
 },[key,start,startWithConsent]);
 const active=state==='starting'||state==='sharing'||state==='retrying'||state==='paused';
 return <section className="space-y-2 rounded-xl border border-sky-400/30 p-3">
  <h3 className="text-sm font-semibold">{tr('Share live location with owner')}</h3>
  <p className="text-xs">{tr('I agree to share my live location during this shift and save distance, GPS accuracy and inside/outside events for 90 days. The owner and I can view this history. Returning to this page resumes sharing until checkout, manual stop or the 16-hour safety limit.')}</p>
  <p className="text-xs">{tr('Keep this page open. Closing or locking your phone interrupts updates. GPS does not prove who is holding the phone.')}</p>
  <Button className="w-full" variant="secondary" onClick={()=>{
   if(active){stopRef.current?.();stopRef.current=null;remember(false);onStop?.();setState('stopped');}
   else {start();}
  }}>{tr(active?'Stop sharing location':'I agree — share my location with owner')}</Button>
  <p role="status" className="text-xs">{tr(statusMessages[state] || statusMessages.stopped)}</p>
 </section>;
}
