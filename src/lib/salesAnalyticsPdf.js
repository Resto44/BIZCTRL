import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf,safePdfFilename} from './pdfLocalization';
import {loadERPReportIcon} from './erpPdfBrand';
import {drawTwoPageERPReport} from './twoPageERPReport';
import {drawPdfNetworkManagement} from './drawPdfNetworkManagement';


/**
 * Canonical two-page A4 Sales Analytics export for both Reports and Scheduled Reports.
 * Summarizes all scoped data in sales and purchases/expenses pages.
 */
export async function generateSalesAnalyticsPDF({
 snapshot = undefined,previousSnapshot=null,growth=null,range = undefined,branchLabel = undefined,businessName='BizCTRL',
 currency='SAR',lang='en',dir = undefined,operationsReport=null,fullAnalytics=null,download=true,
}={}){
 if(!snapshot || !range?.from || !range?.to || !branchLabel)
   throw new Error('A verified report, period and selected branch are required');
 const language=['ar','fa','en'].includes(lang)?lang:'en';
 const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
 prepareLocalizedPdf(doc,{lang:language,dir:language==='en'?'ltr':'rtl'});
 // Stamp the actual PDF export, independently from the app's browser fonts.
 // Saved PDFs are immutable: changing the SaaS UI never edits an older file.
 doc.__erpPdfTypographyVersion = '2026-10-16-modern';
 doc.setProperties({
  title: 'BizCTRL ERP | Two-page financial analytics',
  subject: 'Modernized embedded Arabic/Persian PDF typography, revision 2026-10-16',
  creator: 'BizCTRL ERP',
 });
 const iconData=await loadERPReportIcon();
 drawTwoPageERPReport(doc,{
  snapshot,previousSnapshot,growth,range,report:operationsReport,branchLabel,
  businessName,currency,lang:language,iconData,fullAnalytics,
  totalPages:2+(fullAnalytics?.networkBranches?.available ?
   Math.max(1,Math.ceil((fullAnalytics.networkBranches.branches?.length||0)/9)):0),
 });
 // The canonical financial pages remain unchanged; add a separate, read-only
 // Network Management ERP appendix when verified network detail was provided.
 if (fullAnalytics?.networkBranches?.available) {
  drawPdfNetworkManagement(doc,{insights:fullAnalytics.networkBranches,range,currency,
   lang:language,businessName,branchLabel,iconData});
 }

 if(download)doc.save(safePdfFilename('BizCTRL-ERP-Analytics-v2-'+range.from+'-'+range.to,language));
 return doc;
}
