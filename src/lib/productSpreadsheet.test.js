/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  createProductImportTemplate,
  parseProductSpreadsheet,
  validateProductImport,
} from '@/lib/productSpreadsheet';

function csvFile(contents, name = 'products.csv') {
  return {
    name,
    size: new TextEncoder().encode(contents).byteLength,
    text: async () => contents,
  };
}

function xlsxFile(bytes) {
  const copy = Uint8Array.from(bytes);
  return {
    name: 'products.xlsx',
    size: copy.byteLength,
    arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
  };
}

describe('product spreadsheet import', () => {
  it('maps common Excel headers and normalizes import values', async () => {
    const records = await parseProductSpreadsheet(csvFile([
      'Product Name,Product Code,GTIN,Department,Cost Price,Retail Price,Status',
      'Basmati Rice,SKU-100,0628100000012,Grocery,"42.50",55,Active',
    ].join('\n')));
    const result = validateProductImport(records);

    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({
      name: 'Basmati Rice',
      sku: 'SKU-100',
      barcode: '0628100000012',
      category: 'Grocery',
      purchase_cost: 42.5,
      selling_price: 55,
      status: 'active',
    });
  });

  it('reports duplicate SKU and invalid price rows without importing them', async () => {
    const records = await parseProductSpreadsheet(csvFile([
      'name,sku,purchase_cost,selling_price',
      'Cooking Oil,OIL-1,20,30',
      'Cooking Oil Duplicate,oil-1,-5,30',
    ].join('\n')));
    const result = validateProductImport(records);

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRowCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['sku', 'purchase_cost']));
  });

  it('creates a valid Excel template that can be parsed back into a product', async () => {
    const bytes = createProductImportTemplate();
    const records = await parseProductSpreadsheet(xlsxFile(bytes));
    const result = validateProductImport(records);

    expect(result.errors).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]).toMatchObject({
      name: 'Basmati Rice 5kg',
      sku: 'SUP-000001',
      unit: 'bag',
      category: 'Grocery',
    });
  });
});
