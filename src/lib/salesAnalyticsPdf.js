import jsPDF from 'jspdf';
import {prepareLocalizedPdf,safePdfFilename} from './pdfLocalization';
import {loadERPReportIcon} from './erpPdfBrand';
import {drawSinglePageSalesAnalytics} from './singlePageSalesAnalyticsReport';

/**
 * Canonical A4 Sales Analytics export for both Reports and Scheduled Reports.
 * No alternate 13-page generator or synthetic/unsourced marketing data.
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
 drawSinglePageSalesAnalytics(doc,{
  snapshot,previousSnapshot,growth,range,report:operationsReport,branchLabel,
  businessName,currency,lang:language,iconData,
 });
 if(doc.getNumberOfPages()!==1)throw new Error('ERP Sales Analytics PDF must be exactly one A4 page');
 if(download)doc.save(safePdfFilename('BizCTRL-Sales-Analytics-'+range.from+'-'+range.to,language));
 return doc;
}
