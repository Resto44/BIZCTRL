import {createClient} from 'npm:@supabase/supabase-js@2.106.1';
import {createAttendanceMailHandler} from './handler.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createAttendanceMailHandler({db,env:name=>Deno.env.get(name)}));
