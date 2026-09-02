import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const PRODUCT_IMPORT_MAX_ROWS = 100_000;
export const PRODUCT_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PRODUCT_IMPORT_CHUNK_SIZE = 500;

export const PRODUCT_IMPORT_COLUMNS = [
  { key: 'name', label: 'Product Name', required: true, aliases: ['product', 'product_name', 'item', 'item_name', 'description'] },
  { key: 'sku', label: 'SKU', required: false, aliases: ['product_code', 'item_code', 'code'] },
  { key: 'barcode', label: 'Barcode', required: false, aliases: ['gtin', 'ean', 'upc'] },
  { key: 'name_ar', label: 'Arabic Name', required: false, aliases: ['arabic_name', 'name_arabic'] },
  { key: 'name_en', label: 'English Name', required: false, aliases: ['english_name', 'name_english'] },
  { key: 'name_fa', label: 'Persian Name', required: false, aliases: ['persian_name', 'farsi_name', 'dari_name'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category_name', 'department'] },
  { key: 'brand', label: 'Brand', required: false, aliases: ['manufacturer'] },
  { key: 'unit', label: 'Unit', required: false, aliases: ['uom', 'base_unit', 'unit_of_measure'] },
  { key: 'purchase_cost', label: 'Purchase Cost', required: false, aliases: ['cost', 'cost_price', 'default_cost'] },
  { key: 'selling_price', label: 'Selling Price', required: false, aliases: ['price', 'sale_price', 'retail_price', 'default_price'] },
  { key: 'tax_rate', label: 'Tax Rate', required: false, aliases: ['vat', 'vat_rate', 'tax'] },
  { key: 'min_stock', label: 'Minimum Stock', required: false, aliases: ['minimum_stock', 'low_stock_threshold'] },
  { key: 'max_stock', label: 'Maximum Stock', required: false, aliases: ['maximum_stock', 'par_level'] },
  { key: 'reorder_point', label: 'Reorder Point', required: false, aliases: ['reorder_level'] },
  { key: 'reorder_quantity', label: 'Reorder Quantity', required: false, aliases: ['reorder_qty'] },
  { key: 'branch_selling_price', label: 'Branch Selling Price', required: false, aliases: ['branch_price'] },
  { key: 'branch_purchase_cost', label: 'Branch Purchase Cost', required: false, aliases: ['branch_cost'] },
  { key: 'aisle', label: 'Aisle', required: false, aliases: ['aisle_no'] },
  { key: 'shelf', label: 'Shelf', required: false, aliases: ['shelf_no'] },
  { key: 'bin_location', label: 'Bin Location', required: false, aliases: ['bin', 'location'] },
  { key: 'status', label: 'Status', required: false, aliases: ['active_status'] },
];

const NUMERIC_FIELDS = [
  'purchase_cost', 'selling_price', 'tax_rate', 'min_stock', 'max_stock',
  'reorder_point', 'reorder_quantity', 'branch_selling_price', 'branch_purchase_cost',
];

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_LOOKUP = new Map(
  PRODUCT_IMPORT_COLUMNS.flatMap((column) => [column.key, column.label, ...column.aliases]
    .map((alias) => [normalizeHeader(alias), column.key])),
);

function canonicalHeader(value) {
  const normalized = normalizeHeader(value);
  return HEADER_LOOKUP.get(normalized) || normalized;
}

function parseCsvMatrix(text) {
  const matrix = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim())) matrix.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => String(cell).trim())) matrix.push(row);
  return matrix;
}

function parseXml(xml, label) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`${label} contains invalid XML.`);
  return document;
}

function normalizeZipPath(path) {
  const parts = [];
  String(path || '').replace(/^\/+/, '').split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') parts.pop();
    else parts.push(part);
  });
  return parts.join('/');
}

function readZipEntry(entries, path, required = true) {
  const entry = entries[normalizeZipPath(path)];
  if (!entry) {
    if (!required) return '';
    throw new Error(`The Excel workbook is missing ${path}.`);
  }
  return strFromU8(entry);
}

function columnIndexFromReference(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function extractSharedStrings(entries) {
  const xml = readZipEntry(entries, 'xl/sharedStrings.xml', false);
  if (!xml) return [];
  const document = parseXml(xml, 'Shared strings');
  return [...document.getElementsByTagName('si')].map((item) => item.textContent || '');
}

function extractFirstWorksheetPath(entries) {
  const workbook = parseXml(readZipEntry(entries, 'xl/workbook.xml'), 'Workbook');
  const sheet = workbook.getElementsByTagName('sheet')[0];
  if (!sheet) throw new Error('The Excel workbook does not contain a worksheet.');
  const relationshipId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationships = parseXml(readZipEntry(entries, 'xl/_rels/workbook.xml.rels'), 'Workbook relationships');
  const relationship = [...relationships.getElementsByTagName('Relationship')]
    .find((item) => item.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target');
  if (!target) throw new Error('The first worksheet could not be resolved.');
  return normalizeZipPath(target.startsWith('/') ? target : `xl/${target}`);
}

function extractWorksheetMatrix(entries) {
  const sharedStrings = extractSharedStrings(entries);
  const sheetPath = extractFirstWorksheetPath(entries);
  const worksheet = parseXml(readZipEntry(entries, sheetPath), 'Worksheet');
  return [...worksheet.getElementsByTagName('row')].map((rowElement) => {
    const row = [];
    [...rowElement.getElementsByTagName('c')].forEach((cell) => {
      const index = columnIndexFromReference(cell.getAttribute('r'));
      const type = cell.getAttribute('t');
      const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      if (type === 's') row[index] = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') row[index] = cell.getElementsByTagName('is')[0]?.textContent ?? '';
      else if (type === 'b') row[index] = raw === '1' ? 'true' : 'false';
      else row[index] = raw;
    });
    return row;
  }).filter((row) => row.some((cell) => String(cell ?? '').trim()));
}

function matrixToRecords(matrix) {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(canonicalHeader);
  return matrix.slice(1).map((values, index) => {
    const record = { _rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (header) record[header] = values[columnIndex] ?? '';
    });
    return record;
  }).filter((row) => Object.entries(row).some(([key, value]) => key !== '_rowNumber' && String(value).trim()));
}

export async function parseProductSpreadsheet(file) {
  if (!file) throw new Error('Choose an Excel or CSV file.');
  if (file.size > PRODUCT_IMPORT_MAX_FILE_BYTES) throw new Error('The file is larger than 25 MB. Split it into smaller files.');
  const extension = String(file.name || '').split('.').pop()?.toLowerCase();
  let matrix;
  if (extension === 'csv') matrix = parseCsvMatrix(await file.text());
  else if (extension === 'xlsx') matrix = extractWorksheetMatrix(unzipSync(new Uint8Array(await file.arrayBuffer())));
  else throw new Error('Only .xlsx and .csv files are supported.');

  const records = matrixToRecords(matrix);
  if (!records.length) throw new Error('The spreadsheet does not contain product rows.');
  if (records.length > PRODUCT_IMPORT_MAX_ROWS) throw new Error(`A single import supports up to ${PRODUCT_IMPORT_MAX_ROWS.toLocaleString()} rows.`);
  return records;
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const normalized = String(value).replace(/[\s,]/g, '').replace(/[^0-9.+-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

function normalizeStatus(value) {
  const status = String(value || 'active').trim().toLowerCase();
  if (['active', 'yes', 'true', '1'].includes(status)) return 'active';
  if (['inactive', 'no', 'false', '0'].includes(status)) return 'inactive';
  if (['discontinued', 'archived'].includes(status)) return 'discontinued';
  return null;
}

export function validateProductImport(records) {
  const validRows = [];
  const errors = [];
  const seenSkus = new Map();
  const seenBarcodes = new Map();

  records.forEach((record, index) => {
    const rowNumber = record._rowNumber || index + 2;
    const name = String(record.name || '').trim();
    const barcode = String(record.barcode || '').trim();
    const sku = String(record.sku || barcode).trim().toUpperCase();
    const rowErrors = [];

    if (!name) rowErrors.push({ field: 'name', message: 'Product name is required.' });
    if (!sku) rowErrors.push({ field: 'sku', message: 'SKU or barcode is required.' });
    if (sku && seenSkus.has(sku)) rowErrors.push({ field: 'sku', message: `Duplicate SKU; first used on row ${seenSkus.get(sku)}.` });
    if (barcode && seenBarcodes.has(barcode)) rowErrors.push({ field: 'barcode', message: `Duplicate barcode; first used on row ${seenBarcodes.get(barcode)}.` });
    if (barcode && /e\+?\d+$/i.test(barcode)) rowErrors.push({ field: 'barcode', message: 'Barcode is in scientific notation. Format the Excel column as Text.' });

    const numericValues = {};
    NUMERIC_FIELDS.forEach((field) => {
      const parsed = parseNumber(record[field]);
      if (!Number.isFinite(parsed) || parsed < 0) rowErrors.push({ field, message: `${HEADER_LOOKUP.get(field) || field} must be zero or greater.` });
      else numericValues[field] = parsed;
    });

    const status = normalizeStatus(record.status);
    if (!status) rowErrors.push({ field: 'status', message: 'Status must be Active, Inactive or Discontinued.' });

    if (sku && !seenSkus.has(sku)) seenSkus.set(sku, rowNumber);
    if (barcode && !seenBarcodes.has(barcode)) seenBarcodes.set(barcode, rowNumber);

    if (rowErrors.length) {
      rowErrors.forEach((error) => errors.push({ row: rowNumber, sku, name, ...error }));
      return;
    }

    validRows.push({
      name,
      sku,
      barcode: barcode || null,
      name_ar: String(record.name_ar || '').trim() || null,
      name_en: String(record.name_en || '').trim() || null,
      name_fa: String(record.name_fa || '').trim() || null,
      category: String(record.category || '').trim() || null,
      brand: String(record.brand || '').trim() || null,
      unit: String(record.unit || '').trim() || null,
      status,
      aisle: String(record.aisle || '').trim() || null,
      shelf: String(record.shelf || '').trim() || null,
      bin_location: String(record.bin_location || '').trim() || null,
      ...numericValues,
      _rowNumber: rowNumber,
    });
  });

  return {
    totalRows: records.length,
    validRows,
    errors,
    invalidRowCount: new Set(errors.map((error) => error.row)).size,
    duplicateCount: errors.filter((error) => error.message.startsWith('Duplicate')).length,
  };
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnReference(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheetRow(values, rowNumber, style = 0) {
  const cells = values.map((value, index) => `<c r="${columnReference(index)}${rowNumber}" t="inlineStr" s="${style}"><is><t>${escapeXml(value)}</t></is></c>`).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

export function createProductImportTemplate() {
  const headers = PRODUCT_IMPORT_COLUMNS.map((column) => column.key);
  const example = [
    'Basmati Rice 5kg', 'SUP-000001', '6281000000012', 'أرز بسمتي ٥ كغ', 'Basmati Rice 5kg', 'برنج باسمتی ۵ کیلو',
    'Grocery', 'Example Brand', 'bag', '42.50', '55.00', '15', '5', '40', '8', '20', '', '', 'A-03', 'S-02', 'B-08', 'active',
  ];
  const widths = headers.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 28 : index < 9 ? 18 : 16}" customWidth="1"/>`).join('');
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths}</cols>
  <sheetData>${worksheetRow(headers, 1, 1)}${worksheetRow(example, 2, 0)}</sheetData>
  <autoFilter ref="A1:${columnReference(headers.length - 1)}2"/>
</worksheet>`;

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Master Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': worksheet,
  };

  return zipSync(Object.fromEntries(Object.entries(files).map(([path, contents]) => [path, strToU8(contents)])), { level: 6 });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadProductImportTemplate() {
  triggerDownload(
    new Blob([createProductImportTemplate()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'biz-control-master-products-template.xlsx',
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadProductImportErrors(errors) {
  const header = ['row', 'sku', 'name', 'field', 'error'];
  const rows = errors.map((error) => [error.row, error.sku, error.name, error.field, error.message]);
  const contents = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  triggerDownload(new Blob([contents], { type: 'text/csv;charset=utf-8' }), 'biz-control-product-import-errors.csv');
}
