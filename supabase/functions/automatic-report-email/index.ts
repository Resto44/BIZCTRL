import {createClient} from 'npm:@supabase/supabase-js@2.106.1';
import {createAutomaticReportHandler} from './handler.ts';
import {buildAutomaticReportPdf} from './report-bundle.js';
const db=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createAutomaticReportHandler({db,env:name=>Deno.env.get(name),buildPdf:buildAutomaticReportPdf}));
