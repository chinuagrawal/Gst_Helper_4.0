export async function parseExcelFile(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(row => Object.fromEntries(Object.entries(row).map(
    ([key, value]) => [key.trim(), value]
  )));
}

export function detectFilingPeriod(rows) {
  const periods = new Set((rows || []).map(r =>
    `${Number(r.month_number)}|${Number(r.financial_year)}`));
  if (periods.size !== 1) return null;
  const [month, year] = [...periods][0].split('|').map(Number);
  return month >= 1 && month <= 12 && year >= 2000 ? { month, year } : null;
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
