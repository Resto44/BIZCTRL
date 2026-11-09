import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf,safePdfFilename} from './pdfLocalization';
import {loadERPReportIcon} from './erpPdfBrand';
import {drawTwoPageERPReport} from './twoPageERPReport';
import {drawPdfNetworkManagement} from './drawPdfNetworkManagement';


/**
 * Canonical three-page maximum A4 Sales Analytics export for manual and scheduled reports.
 * Pages 1-2: core finance; page 3: Network and Driver Sales analytics.
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
  title: 'BizCTRL ERP | Three-page financial and driver sales analytics',
  subject: 'Modernized embedded Arabic/Persian PDF typography, revision 2026-10-16',
  creator: 'BizCTRL ERP',
 });
 const iconData=await loadERPReportIcon();
 drawTwoPageERPReport(doc,{
  snapshot,previousSnapshot,growth,range,report:operationsReport,branchLabel,
  businessName,currency,lang:language,iconData,fullAnalytics,
  totalPages:fullAnalytics?.networkBranches?.available ? 3 : 2,
 });
 // Share page 3 between Network Management and Driver Sales. Never paginate
 // driver analytics to another page or add driver collections to total revenue.
 if (fullAnalytics?.networkBranches?.available) {
  drawPdfNetworkManagement(doc,{insights:fullAnalytics.networkBranches,
   driverSales:fullAnalytics.driverSales,range,currency,
   lang:language,businessName,branchLabel,iconData});
 }

 if(doc.getNumberOfPages()>3)throw new Error('ERP_PDF_PAGE_LIMIT_EXCEEDED');
 if(download)doc.save(safePdfFilename('BizCTRL-ERP-Analytics-v2-'+range.from+'-'+range.to,language));
 return doc;
}
