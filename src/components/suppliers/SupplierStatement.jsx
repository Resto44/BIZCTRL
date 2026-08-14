import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Download, Loader2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/lib/LanguageContext';
import { drawLocalizedPdfText, prepareLocalizedPdf, safePdfFilename } from '@/lib/pdfLocalization';

function getStatusColor(status) {
  if (status === 'paid') return 'bg-green-100 text-green-700';
  if (status === 'partial') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function getStatusIcon(status) {
  if (status === 'paid') return <CheckCircle className="w-3 h-3" />;
  if (status === 'partial') return <Clock className="w-3 h-3" />;
  return <AlertTriangle className="w-3 h-3" />;
}

export default function SupplierStatement({ supplier }) {
  const { currency, t, lang, dir, translateLiteral, translateLabel } = useLanguage();
  const [generating, setGenerating] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ['supplier_invoices', supplier.id],
    queryFn: () => base44.entities.SupplierInvoice.filter({ supplier_id: supplier.id }, '-date', 200),
  });

  const { data: debts = [] } = useQuery({
    queryKey: ['debts_supplier', supplier.name],
    queryFn: () => base44.entities.DebtRecord.filter({ party_type: 'supplier', party_name: supplier.name }, '-date', 100),
  });

  const totalInvoiced = invoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0);
  const totalOutstanding = totalInvoiced - totalPaid;
  const overdueInvoices = invoices.filter((invoice) => invoice.status !== 'paid' && invoice.due_date && new Date(invoice.due_date) < new Date());
  const isRTL = dir === 'rtl';
  const number = (value) => Number(value || 0).toLocaleString('en-US');

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
      const { rtl } = prepareLocalizedPdf(doc, { lang, dir });
      const pageW = doc.internal.pageSize.getWidth();
      const pageLeft = 15;
      const pageRight = pageW - pageLeft;
      const mainX = rtl ? pageRight : pageLeft;
      const draw = (value, x, y, options = {}) => drawLocalizedPdfText(doc, value, x, y, { rtl, ...options });
      const loc = (value) => translateLiteral(value);
      let y = 20;

      doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageW, 40, 'F');
      draw(loc('STATEMENT OF ACCOUNT'), pageW / 2, 18, { bold: true, size: 18, color: [255, 255, 255], align: 'center' });
      draw(`${t('supplier')}: ${supplier.name}`, pageW / 2, 27, { size: 10, color: [255, 255, 255], align: 'center' });
      draw(`${loc('Generated')}: ${format(new Date(), 'dd MMM yyyy')}`, pageW / 2, 34, { size: 9, color: [226, 232, 240], align: 'center' });
      y = 52;

      const contactEntries = [[loc('Phone'), supplier.phone], [t('email'), supplier.email], [loc('Contact'), supplier.contact_name]].filter(([, value]) => value);
      contactEntries.forEach(([label, value]) => { draw(`${label}: ${value}`, mainX, y, { size: 9, color: [100, 100, 100] }); y += 5; });
      y += 5;

      doc.setFillColor(248, 250, 252); doc.roundedRect(pageLeft, y, pageW - 30, 28, 3, 3, 'F');
      draw(loc('ACCOUNT SUMMARY'), mainX, y + 7, { bold: true, size: 10, color: [15, 23, 42] });
      const summary = [[loc('Total Invoiced'), `${number(totalInvoiced)} ${currency}`], [loc('Total Paid'), `${number(totalPaid)} ${currency}`], [loc('Outstanding Balance'), `${number(totalOutstanding)} ${currency}`]];
      summary.forEach(([label, value], index) => {
        const boxX = rtl ? pageRight - 5 - index * 60 : pageLeft + 5 + index * 60;
        draw(label, boxX, y + 14, { size: 8, color: [100, 116, 139] });
        draw(value, boxX, y + 22, { rtl: false, bold: true, size: 11, color: index === 2 && totalOutstanding > 0 ? [180, 0, 0] : [15, 23, 42], align: rtl ? 'right' : 'left' });
      });
      y += 36;

      const headers = [loc('Invoice #'), t('date'), t('due_date'), t('amount'), t('paid'), loc('Balance'), t('status')];
      const widths = [25, 23, 25, 20, 20, 22, 22];
      const tableWidth = widths.reduce((sum, width) => sum + width, 0);
      const drawTableHeader = () => {
        doc.setFillColor(51, 65, 85); doc.rect(pageLeft, y, tableWidth, 8, 'F');
        let x = rtl ? pageLeft + tableWidth : pageLeft;
        headers.forEach((header, index) => {
          const width = widths[index];
          if (rtl) x -= width;
          draw(header, rtl ? x + width - 2 : x + 2, y + 5.5, { bold: true, size: 8, color: [255, 255, 255], align: rtl ? 'right' : 'left' });
          if (!rtl) x += width;
        });
        y += 10;
      };
      drawTableHeader();

      invoices.forEach((invoice, index) => {
        if (y > 260) { doc.addPage(); y = 20; drawTableHeader(); }
        doc.setFillColor(...(index % 2 === 0 ? [255, 255, 255] : [248, 250, 252])); doc.rect(pageLeft, y - 1, tableWidth, 8, 'F');
        const remaining = (invoice.amount || 0) - (invoice.paid_amount || 0);
        const row = [(invoice.invoice_number || '—').slice(0, 10), invoice.date || '—', invoice.due_date || '—', number(invoice.amount), number(invoice.paid_amount), number(remaining), translateLabel(invoice.status, invoice.status || '—')];
        const overdue = invoice.status !== 'paid' && invoice.due_date && new Date(invoice.due_date) < new Date();
        let x = rtl ? pageLeft + tableWidth : pageLeft;
        row.forEach((value, column) => {
          const width = widths[column];
          if (rtl) x -= width;
          draw(value, rtl ? x + width - 2 : x + 2, y + 5, { size: 7.5, color: overdue ? [220, 38, 38] : [15, 23, 42], align: rtl ? 'right' : 'left', maxWidth: width - 3 });
          if (!rtl) x += width;
        });
        y += 8;
      });

      y += 8;
      draw(loc('This is a computer-generated statement. Please contact us for any discrepancies.'), pageW / 2, y, { size: 8, color: [100, 116, 139], align: 'center' });
      doc.save(safePdfFilename(`statement_${supplier.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}`, lang));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold">{number(totalInvoiced)}</div><div className="text-[10px] text-muted-foreground">{translateLiteral('Total Invoiced')}</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold text-green-600">{number(totalPaid)}</div><div className="text-[10px] text-muted-foreground">{translateLiteral('Total Paid')}</div></CardContent></Card>
        <Card className={totalOutstanding > 0 ? 'border-red-200' : ''}><CardContent className="p-3 text-center"><div className={`text-lg font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{number(totalOutstanding)}</div><div className="text-[10px] text-muted-foreground">{translateLiteral('Outstanding Balance')}</div></CardContent></Card>
      </div>

      {overdueInvoices.length > 0 && <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-xs text-red-700 font-medium">{translateLiteral('{{count}} overdue invoice(s)', { count: overdueInvoices.length })}</p></div>}

      <Button className="w-full gap-2" onClick={generatePDF} disabled={generating || invoices.length === 0}>
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {generating ? translateLiteral('Generating PDF...') : translateLiteral('Generate Statement PDF')}
      </Button>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('invoice')} ({invoices.length})</h3>
        {invoices.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">{translateLiteral('No invoices recorded')}</p> : invoices.map((invoice) => (
          <div key={invoice.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
            <div className="min-w-0"><div className="text-xs font-semibold flex items-center gap-1.5"><FileText className="w-3 h-3 text-muted-foreground" />{invoice.invoice_number || translateLiteral('No number')}</div><div className="text-[10px] text-muted-foreground">{invoice.date} {invoice.due_date && `· ${t('due_date')}: ${invoice.due_date}`}</div></div>
            <div className="text-right shrink-0"><div className="text-xs font-bold">{number(invoice.amount)} <span className="text-muted-foreground font-normal">{currency}</span></div><Badge className={`text-[9px] ${getStatusColor(invoice.status)}`}>{getStatusIcon(invoice.status)}<span className="mr-1">{translateLabel(invoice.status, invoice.status)}</span></Badge></div>
          </div>
        ))}
      </div>
    </div>
  );
}
