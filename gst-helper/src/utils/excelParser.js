import * as XLSX from 'xlsx';

export async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows;
}

export function detectFileByColumns(rows) {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  if (cols.includes('end_customer_state_new') && cols.includes('total_taxable_sale_value') && cols.includes('cancel_return_date')) {
    return 'tcs_sales_return';
  }
  if (cols.includes('end_customer_state_new') && cols.includes('total_taxable_sale_value') && cols.includes('hsn_code')) {
    return 'tcs_sales';
  }
  if (cols.includes('HSN') && cols.includes('Suborder No.') && cols.includes('Product Description')) {
    return 'Tax_invoice_details';
  }
  return null;
}
