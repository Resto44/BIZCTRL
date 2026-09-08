import JsBarcode from 'jsbarcode';

export const LABEL_SIZES = Object.freeze({ '50x30': [50, 30], '60x40': [60, 40], '80x50': [80, 50] });
export const BARCODE_OPTIONS = Object.freeze({ format: 'CODE128', width: 2, height: 70, displayValue: true, fontSize: 16, margin: 20, background: '#ffffff', lineColor: '#000000' });

export function escapeLabelText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function barcodeSvg(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error('Invalid barcode');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, { ...BARCODE_OPTIONS });
  return new XMLSerializer().serializeToString(svg);
}

export function barcodeDataUrl(value) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeSvg(value))}`;
}

export function labelPrintHtml({ product, size = '60x40', copies = 1, price = '', printText = 'Print labels' }) {
  const dimensions = LABEL_SIZES[size];
  if (!dimensions || !Number.isInteger(copies) || copies < 1 || copies > 100) throw new Error('Invalid label settings');
  const [width, height] = dimensions;
  const image = barcodeDataUrl(product?.barcode);
  const names = [...new Set([product?.name_ar, product?.name_en || product?.name].filter(Boolean))];
  const label = `<article class="label">${names.slice(0, 2).map((name) => `<div class="name" dir="auto">${escapeLabelText(name)}</div>`).join('')}<img src="${escapeLabelText(image)}" alt="${escapeLabelText(product.barcode)}">${price ? `<strong dir="auto">${escapeLabelText(price)}</strong>` : ''}</article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeLabelText(printText)}</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Tahoma,sans-serif;background:#eee;color:#000}.toolbar{padding:16px}button{padding:12px 24px;font:inherit}main{display:flex;flex-wrap:wrap;gap:4mm;padding:4mm}.label{background:white;width:${width}mm;height:${height}mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid;page-break-inside:avoid;overflow:hidden}.name{font-size:${size === '50x30' ? 8 : 10}pt;line-height:1.15;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label img{width:100%;height:${height - (price ? 16 : 13)}mm;object-fit:contain;flex-shrink:0}.label strong{font-size:10pt}@page{size:${width}mm ${height}mm;margin:0}@media print{body{background:white}.toolbar{display:none}main{display:block;padding:0}.label{break-after:page;page-break-after:always}.label:last-child{break-after:auto;page-break-after:auto}}
    </style></head><body><div class="toolbar"><button onclick="window.print()">${escapeLabelText(printText)}</button></div><main>${label.repeat(copies)}</main></body></html>`;
}

export function downloadBarcodePng(value) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, { ...BARCODE_OPTIONS, width: 3, height: 105, fontSize: 24, margin: 30 });
  const link = document.createElement('a');
  link.download = `barcode-${value.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
