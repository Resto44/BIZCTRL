import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf,safePdfFilename} from './pdfLocalization';
import {loadERPReportIcon} from './erpPdfBrand';
import {drawTwoPageERPReport} from './twoPageERPReport';


/**
 * Canonical two-page A4 Sales Analytics export for both Reports and Scheduled Reports.
 * Summarizes all scoped data in sales and purchases/expenses pages.
 */
export async function generateSalesAnalyticsPDF({
 snapshot,previousSnapshot=null,growth=null,range,branchLabel,businessName='BizCTRL',
 currency='SAR',lang='en',dir,operationsReport=null,download=true,
}={}){
 if(!snapshot || !range?.from || !range?.to || !branchLabel)
   throw new Error('A verified report, period and selected branch are required');
 const language=['ar','fa','en'].includes(lang)?lang:'en';
 const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
 prepareLocalizedPdf(doc,{lang:language,dir:language==='en'?'ltr':'rtl'});
 const iconData=await loadERPReportIcon();
 drawTwoPageERPReport(doc,{
  snapshot,previousSnapshot,growth,range,report:operationsReport,branchLabel,
  businessName,currency,lang:language,iconData,
 });

 if(download)doc.save(safePdfFilename('BizCTRL-Sales-Analytics-'+range.from+'-'+range.to,language));
 return doc;
}
