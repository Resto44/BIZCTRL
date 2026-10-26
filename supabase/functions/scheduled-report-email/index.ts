import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import {createEmailHandler} from './handler.ts';
console.info('Report email configuration', JSON.stringify({providerKeyPresent:Boolean(Deno.env.get('RESEND_API_KEY')),senderPresent:Boolean(Deno.env.get('REPORT_EMAIL_FROM'))}));
Deno.serve(createEmailHandler({createClient,env:name=>Deno.env.get(name)}));
