const XLSX = require('xlsx');
const path = require('path');

console.log('\n=== ANALYSIS 1: UNIQUE HSN CODES IN EACH FILE ===\n');

const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const sales = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const returnWB = XLSX.readFile(path.join(__dirname, 'tcs_sales_return.xlsx'));
const returns = XLSX.utils.sheet_to_json(returnWB.Sheets[returnWB.SheetNames[0]]);
const taxWB = XLSX.readFile(path.join(__dirname, 'Tax_invoice_details.xlsx'));
const taxDetails = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);

console.log('Sales HSN codes:');
const salesHSN = [...new Set(sales.map(r => r.hsn_code))].sort();
console.log(salesHSN);

console.log('\nReturns HSN codes:');
const returnHSN = [...new Set(returns.map(r => r.hsn_code))].sort();
console.log(returnHSN);

console.log('\nTax Invoice HSN codes:');
const taxHSN = [...new Set(taxDetails.map(r => r.HSN))].sort();
console.log(taxHSN);

console.log('\n=== ANALYSIS 2: Tax_invoice_details - ALL COLUMNS and sample rows for each HSN ===\n');
const taxSheet = taxWB.Sheets[taxWB.SheetNames[0]];
const taxRowsAll = XLSX.utils.sheet_to_json(taxSheet, { header: 1 });
console.log('All columns:', taxRowsAll[0].map((h, i) => `[${i}] ${h}`));

console.log('\nSample product descriptions by HSN:');
const hsnDescMap = {};
for (const row of taxDetails) {
  const hsn = row.HSN;
  if (!hsnDescMap[hsn]) {
    hsnDescMap[hsn] = [];
  }
  if (hsnDescMap[hsn].length < 3) {
    hsnDescMap[hsn].push(row['Product Description']);
  }
}
Object.keys(hsnDescMap).sort().forEach(hsn => {
  console.log(`\nHSN ${hsn}:`);
  hsnDescMap[hsn].forEach(d => console.log(`  - ${d}`));
});

console.log('\n=== ANALYSIS 3: UNIQUE end_customer_state_new (Sales) ===\n');
const states = [...new Set(sales.map(r => r.end_customer_state_new))].sort();
states.forEach(s => console.log(s));

console.log('\n=== ANALYSIS 4: UNIQUE eco_tcs_gstin and seller GSTIN ===\n');
console.log('Seller GSTINs:', [...new Set(sales.map(r => r.gstin))]);
console.log('ECO TCS GSTINs:', [...new Set(sales.map(r => r.eco_tcs_gstin))]);

console.log('\n=== ANALYSIS 5: Reference output HSN analysis ===\n');
const ref = require('./REPOTIC output.json');
console.log('b2cs entries:', ref.b2cs.length);
console.log('\nb2cs by POS and rate:');
ref.b2cs.forEach(b => {
  console.log(`  POS=${b.pos} rt=${b.rt} txval=${b.txval} iamt=${b.iamt} camt=${b.camt} samt=${b.samt}`);
});
console.log('\nhsn_b2c entries:');
ref.hsn.hsn_b2c.forEach(h => {
  console.log(`  HSN=${h.hsn_sc} UQC=${h.uqc} qty=${h.qty} rt=${h.rt} txval=${h.txval}`);
});

console.log('\n=== ANALYSIS 6: Cross-check suborder numbers between Sales and Tax_invoice_details ===\n');
const salesSuborders = new Set(sales.map(r => r.sub_order_num));
const returnsSuborders = new Set(returns.map(r => r.sub_order_num));
const taxSuborders = new Set(taxDetails.map(r => r['Suborder No.']));
console.log(`Sales suborders: ${salesSuborders.size}`);
console.log(`Returns suborders: ${returnsSuborders.size}`);
console.log(`Tax Invoice suborders: ${taxSuborders.size}`);
console.log(`Sales suborders NOT in Tax: ${[...salesSuborders].filter(s => !taxSuborders.has(s)).length}`);
console.log(`Returns suborders NOT in Tax: ${[...returnsSuborders].filter(s => !taxSuborders.has(s)).length}`);

console.log('\n=== ANALYSIS 7: HSN mapping - check if same suborder has different HSN in tcs_sales vs Tax_invoice_details ===\n');
const salesMap = {};
sales.forEach(r => { salesMap[r.sub_order_num] = r.hsn_code; });
let diffCount = 0;
const diffExamples = [];
for (const taxRow of taxDetails) {
  const so = taxRow['Suborder No.'];
  if (salesMap[so] && salesMap[so] !== taxRow.HSN) {
    diffCount++;
    if (diffExamples.length < 5) {
      diffExamples.push({ suborder: so, salesHSN: salesMap[so], taxHSN: taxRow.HSN, desc: taxRow['Product Description'] });
    }
  }
}
console.log(`Suborders with different HSN between tcs_sales and Tax_invoice: ${diffCount}`);
diffExamples.forEach(e => console.log('  ', e));

console.log('\n=== ANALYSIS 8: Check 392401 and 392490 patterns ===\n');
const sales392401 = sales.filter(r => r.hsn_code === '392401');
const sales392490 = sales.filter(r => r.hsn_code === '392490');
console.log(`Sales with HSN 392401: ${sales392401.length}`);
console.log(`Sales with HSN 392490: ${sales392490.length}`);

const taxHSN3924xx = taxDetails.filter(r => r.HSN === '392490');
console.log(`Tax details with HSN 392490: ${taxHSN3924xx.length}`);
console.log('\nSample product descriptions from Tax for HSN 392490:');
taxHSN3924xx.slice(0, 5).forEach(r => console.log(`  SO: ${r['Suborder No.']} Desc: ${r['Product Description']}`));

console.log('\nSample product descriptions from Sales for HSN 392401 - matched with Tax:');
const matched392401 = sales392401.slice(0, 5).map(s => {
  const tax = taxDetails.find(t => t['Suborder No.'] === s.sub_order_num);
  return { so: s.sub_order_num, salesHSN: s.hsn_code, taxHSN: tax?.HSN, desc: tax?.['Product Description'] };
});
matched392401.forEach(m => console.log('  ', m));

console.log('\n=== ANALYSIS 9: UNIQUE gst_rate values ===\n');
console.log('Sales rates:', [...new Set(sales.map(r => r.gst_rate))].sort());
console.log('Returns rates:', [...new Set(returns.map(r => r.gst_rate))].sort());

console.log('\n=== ANALYSIS 10: sub_order_num between sales and returns ===\n');
const overlap = [...salesSuborders].filter(s => returnsSuborders.has(s));
console.log(`Suborders in both sales and returns: ${overlap.length}`);
if (overlap.length > 0) {
  console.log('Sample overlapping suborders:', overlap.slice(0, 5));
}
