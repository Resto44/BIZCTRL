export function validSubscription(sub: any): boolean {
 try {
  const url=new URL(sub?.endpoint);
  const host=url.hostname;
  const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host==='web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  return allowed && url.protocol==='https:' && !url.port && !url.username && !url.password && sub.endpoint.length<4096 && /^[A-Za-z0-9_-]{87}={0,2}$/.test(sub.keys?.p256dh) && /^[A-Za-z0-9_-]{22}={0,2}$/.test(sub.keys?.auth);
 }catch{return false;}
}
export function eventMessage(event: any): string {
 const action: Record<string,string>={insert:'Created / ثبت',update:'Updated / تغییر',delete:'Deleted / حذف'};
 return [action[event.action] || 'Activity',String(event.entity).replaceAll('_',' '),event.reference,event.branch ? `Branch: ${event.branch}` : null].filter(Boolean).join(' · ').slice(0,350);
}
