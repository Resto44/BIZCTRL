import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
await build({entryPoints:['src/lib/automaticReportPdf.js'],outfile:'supabase/functions/automatic-report-email/report-bundle.js',
 bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,
 alias:{'@':'./src'},logLevel:'info'});
