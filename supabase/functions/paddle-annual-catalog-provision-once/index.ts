import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Completed: live annual catalog prices were created and verified 2026-11-01.
// This one-time maintenance endpoint is permanently disabled. New prices
// continue to be managed through the authenticated owner Paddle Checkout.
Deno.serve(()=>new Response(JSON.stringify({error:"catalog_maintenance_completed"}),{
 status:410,headers:{"content-type":"application/json","cache-control":"no-store"}
}));
