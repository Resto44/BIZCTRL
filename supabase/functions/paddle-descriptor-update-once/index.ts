import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// One-time Paddle descriptor operation closed after Paddle returned HTTP 403.
// No account setting was updated. A future merchant-authorized operation
// requires a key with statement_descriptor.write permission.
Deno.serve(()=>new Response(JSON.stringify({error:"descriptor_maintenance_disabled"}),{
 status:410,headers:{"content-type":"application/json","cache-control":"no-store"}
}));
