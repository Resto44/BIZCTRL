import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source='supabase/functions/automatic-report-email/report-bundle.js';
const target='tmp/automatic-email-edge-build';
const code=readFileSync(source,'utf8');
for(const term of ['REPORT_NETWORK_APPENDIX_MISSING','REPORT_DRIVER_APPENDIX_MISSING','Network Management','Finalized network operations','Driver Sales · Trends & Analytics']){
 if(!code.includes(term))throw new Error('AUTOMATIC_REPORT_BUNDLE_MISSING_'+term);
}
if(code.length<50000||Buffer.byteLength(code,'utf8')>5500000)throw new Error('AUTOMATIC_REPORT_BUNDLE_SIZE_INVALID');
rmSync(target,{force:true,recursive:true});
mkdirSync(target,{recursive:true});
const points=Array.from(code);
const chunkSize=95000,files=[];
for(let i=0;i<points.length;i+=chunkSize){
 const file='report-bundle-'+String(files.length).padStart(3,'0')+'.part';
 writeFileSync(target+'/'+file,points.slice(i,i+chunkSize).join(''),'utf8');
 files.push(file);
}
const hash=createHash('sha256').update(code).digest('hex');
writeFileSync(target+'/manifest.json',JSON.stringify({
 source,parts:files,sha256:hash,bytes:Buffer.byteLength(code,'utf8'),
 build:'automatic-email-network-v3-2026-11-08',
},null,2)+'\n');
console.log('Network PDF automatic email bundle built:',files.length,'segments, bytes',Buffer.byteLength(code,'utf8'),'SHA256',hash);
