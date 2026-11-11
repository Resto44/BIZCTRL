// Keep endpoint and key validation aligned with owner-push/policy.ts.
export function validSubscription(sub: any): boolean {
 try {
  const url=new URL(sub?.endpoint);
  const host=url.hostname;
  const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host==='web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  return allowed && url.protocol==='https:' && !url.port && !url.username && !url.password && sub.endpoint.length<4096 && /^[A-Za-z0-9_-]{87}={0,2}$/.test(sub.keys?.p256dh) && /^[A-Za-z0-9_-]{22}={0,2}$/.test(sub.keys?.auth);
 }catch{return false;}
}
