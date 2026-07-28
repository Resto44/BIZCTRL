/**
 * Invoice Generator Module
 * Handles auto-generation, PDF creation, and management
 */

import { base44 } from '@/api/base44Client';

/**
 * Generate sequential invoice number
 * Format: INV-{YYYYMMDD}-{SEQUENCE}
 */
export async function generateInvoiceNumber(restaurantId, date) {
  try {
    // Get all invoices for this restaurant on this date
    const invoices = await base44.entities.SalesInvoice.filter({
      restaurant_id: restaurantId,
      date,
    }, '-created_date', 1000);

    const sequence = (invoices?.length || 0) + 1;
    const dateStr = date.replace(/-/g, '');
    const invoiceNumber = `INV-${dateStr}-${String(sequence).padStart(4, '0')}`;

    return invoiceNumber;
  } catch (err) {
    console.error('[Invoice] generateInvoiceNumber error:', err);
    throw err;
  }
}

/**
 * Create invoice PDF from sale data
 */
export async function createInvoicePDF(saleData, restaurantData) {
  try {
    if (!saleData || !restaurantData) {
      throw new Error('Sale and Restaurant data are required');
    }

    // Parse items if JSON string
    const items = typeof saleData.items_json === 'string' 
      ? JSON.parse(saleData.items_json || '[]')
      : saleData.items_json || [];

    // Build invoice object
    const invoice = {
      invoiceNumber: saleData.invoice_number,
      date: saleData.date,
      restaurantName: restaurantData.name,
      restaurantAddress: restaurantData.address,
      restaurantPhone: restaurantData.phone,
      customerName: saleData.customer_name || 'Walk-in Customer',
      customerPhone: saleData.customer_phone || '',
      items: items.map(item => ({
        name: item.name || item.product_name,
        quantity: item.qty || item.quantity,
        unitPrice: item.unit_price || item.price,
        total: (item.qty || item.quantity) * (item.unit_price || item.price),
      })),
      subtotal: saleData.subtotal || saleData.total_amount || 0,
      tax: saleData.tax || 0,
      discount: saleData.discount || 0,
      total: saleData.total_amount || 0,
      paymentMethod: saleData.payment_method || 'Cash',
      notes: saleData.notes || '',
      createdAt: new Date().toISOString(),
    };

    return invoice;
  } catch (err) {
    console.error('[Invoice] createInvoicePDF error:', err);
    throw err;
  }
}

/**
 * Store invoice in database
 */
export async function storeInvoice(invoiceData, saleId, restaurantId) {
  try {
    const invoice = {
      invoice_number: invoiceData.invoiceNumber,
      sale_id: saleId,
      restaurant_id: restaurantId,
      date: invoiceData.date,
      customer_name: invoiceData.customerName,
      customer_phone: invoiceData.customerPhone,
      items_json: JSON.stringify(invoiceData.items),
      subtotal: invoiceData.subtotal,
      tax: invoiceData.tax,
      discount: invoiceData.discount,
      total: invoiceData.total,
      payment_method: invoiceData.paymentMethod,
      notes: invoiceData.notes,
      pdf_url: invoiceData.pdfUrl || null,
      status: 'generated',
      created_at: new Date().toISOString(),
    };

    // Check if invoice already exists
    const existing = await base44.entities.SalesInvoice.filter({
      invoice_number: invoiceData.invoiceNumber,
    });

    if (existing && existing.length > 0) {
      // Update existing invoice
      return await base44.entities.SalesInvoice.update(existing[0].id, invoice);
    } else {
      // Create new invoice
      return await base44.entities.SalesInvoice.create(invoice);
    }
  } catch (err) {
    console.error('[Invoice] storeInvoice error:', err);
    throw err;
  }
}

/**
 * Generate HTML invoice for PDF conversion
 */
export function generateInvoiceHTML(invoice) {
  const itemsHTML = invoice.items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 5px 0; color: #666; }
        .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .invoice-details div { flex: 1; }
        .invoice-details label { font-weight: bold; display: block; margin-top: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; }
        .totals { text-align: right; margin-bottom: 20px; }
        .totals-row { display: flex; justify-content: flex-end; margin: 5px 0; }
        .totals-row span:first-child { width: 150px; font-weight: bold; }
        .totals-row span:last-child { width: 100px; text-align: right; }
        .total-final { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${invoice.restaurantName}</h1>
          <p>${invoice.restaurantAddress}</p>
          <p>${invoice.restaurantPhone}</p>
        </div>

        <div class="invoice-details">
          <div>
            <label>Invoice #:</label>
            <p>${invoice.invoiceNumber}</p>
            <label>Date:</label>
            <p>${invoice.date}</p>
          </div>
          <div>
            <label>Customer:</label>
            <p>${invoice.customerName}</p>
            <label>Phone:</label>
            <p>${invoice.customerPhone}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span>$${invoice.subtotal.toFixed(2)}</span>
          </div>
          ${invoice.tax > 0 ? `
            <div class="totals-row">
              <span>Tax:</span>
              <span>$${invoice.tax.toFixed(2)}</span>
            </div>
          ` : ''}
          ${invoice.discount > 0 ? `
            <div class="totals-row">
              <span>Discount:</span>
              <span>-$${invoice.discount.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="totals-row total-final">
            <span>Total:</span>
            <span>$${invoice.total.toFixed(2)}</span>
          </div>
        </div>

        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p><strong>Payment Method:</strong> ${invoice.paymentMethod}</p>
          ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
        </div>

        <div class="footer">
          <p>Thank you for your business!</p>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Get invoice history for a restaurant
 */
export async function getInvoiceHistory(restaurantId, limit = 100) {
  try {
    const invoices = await base44.entities.SalesInvoice.filter({
      restaurant_id: restaurantId,
    }, '-date', limit);

    return invoices || [];
  } catch (err) {
    console.error('[Invoice] getInvoiceHistory error:', err);
    throw err;
  }
}

/**
 * Download invoice as PDF
 */
export async function downloadInvoicePDF(invoiceNumber) {
  try {
    const invoices = await base44.entities.SalesInvoice.filter({
      invoice_number: invoiceNumber,
    });

    if (!invoices || invoices.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoices[0];
    
    if (!invoice.pdf_url) {
      throw new Error('PDF not available for this invoice');
    }

    // Return PDF URL for download
    return invoice.pdf_url;
  } catch (err) {
    console.error('[Invoice] downloadInvoicePDF error:', err);
    throw err;
  }
}

export default {
  generateInvoiceNumber,
  createInvoicePDF,
  storeInvoice,
  generateInvoiceHTML,
  getInvoiceHistory,
  downloadInvoicePDF,
};
