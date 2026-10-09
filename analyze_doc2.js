const XLSX = require('xlsx');
const path = require('path');

const taxWB = XLSX.readFile(path.join(__dirname, 'Tax_invoice_details.xlsx'));
const taxRows = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);
const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const salesRows = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const retWB = XLSX.readFile(path.join(__dirname, 'tcs_sales_return.xlsx'));
const retRows = XLSX.utils.sheet_to_json(retWB.Sheets[retWB.SheetNames[0]]);

console.log('=== TAX INVOICE TYPES ===');
console.log('Unique Type:', [...new Set(taxRows.map(r => r['Type']))]);
console.log('All columns:', Object.keys(taxRows[0]));

console.log('\n=== INVOICE NUMBER PATTERN (first 5) ===');
const invs = taxRows.filter(r => r['Type'] === 'INVOICE');
invs.slice(0,5).forEach(r => {
  const inv = String(r['Invoice No.']);
  const m = inv.match(/^([A-Za-z]+)(\d{2})(\d+)$/);
  console.log(`  raw=${inv}`, m ? {prefix:m[1], state:m[2], num:parseInt(m[3])} : 'NO MATCH');
});

console.log('\n=== INVOICE RANGE (Aug 2026) ===');
const invAug = invs.filter(r => String(r['Order Date'] || '').startsWith('2026-08'));
console.log('August 2026 invoice count:', invAug.length);
const parsed = invAug.map(r => {
  const inv = String(r['Invoice No.']);
  const m = inv.match(/^([A-Za-z]+)(\d{2})(\d+)$/);
  return m ? {raw:inv, prefix:m[1], state:m[2], num:parseInt(m[3])} : null;
}).filter(Boolean);
const nums = parsed.map(p => p.num);
const from = Math.min(...nums);
const to = Math.max(...nums);
const totnum = to - from + 1;
const usedNums = new Set(nums);
let cancel = 0;
for (let n = from; n <= to; n++) { if (!usedNums.has(n)) cancel++; }
console.log(`  from=${from} to=${to} totnum=${totnum} actualCount=${usedNums.size} cancel=${cancel} net_issue=${totnum - cancel}`);
console.log(`  actual rows: ${invAug.length}, unique inv nums: ${usedNums.size}`);
console.log(`  fromStr: ${parsed[0].prefix + parsed[0].state + from} (first: ${[...usedNums].sort((a,b)=>a-b)[0]})`);
const minN = [...usedNums].sort((a,b)=>a-b)[0];
const maxN = [...usedNums].sort((a,b)=>b-a)[0];
console.log(`  CORRECT fromStr: ${parsed[0].prefix + parsed[0].state + minN}  (actual min used: ${minN})`);
console.log(`  CORRECT toStr:   ${parsed[0].prefix + parsed[0].state + maxN}  (actual max used: ${maxN})`);
console.log(`  CORRECT totnum: ${maxN - minN + 1} (from actual used range)`);
let cancel2 = 0;
for (let n = minN; n <= maxN; n++) { if (!usedNums.has(n)) cancel2++; }
console.log(`  CORRECT cancel (from actual min to actual max range): ${cancel2}, net_issue: ${maxN - minN + 1 - cancel2}`);

console.log('\n=== CREDIT NOTE / RETURNS ANALYSIS ===');
console.log('Return columns:', Object.keys(retRows[0]));
console.log('Unique identifiers:', [...new Set(retRows.map(r => r.identifier))]);
const sellerState = (salesRows[0]?.gstin || '27AAFPQ5593F1ZC').slice(0, 2);
const identifierPrefix = salesRows[0]?.identifier || 'pph4k';
console.log(`Seller state: ${sellerState}, Identifier prefix: ${identifierPrefix}`);

const retAug = retRows.filter(r => {
  const d = r.manifest_date || r.order_date;
  return d && d.startsWith('2026-08');
});
console.log('August return rows:', retAug.length);
const retSuborders = [...new Set(retAug.map(r => r.sub_order_num))];
console.log('August unique return suborders:', retSuborders.length);
const allRetSuborders = [...new Set(retRows.map(r => r.sub_order_num))];
console.log('All-time unique return suborders:', allRetSuborders.length);

// For credit note numbers: same prefix + state + "C" + numeric suffix
// Since return file doesn't have explicit CN numbers, synthesize as range 1..count_net (or count returns used)
// But reference shows from=C259 to=C413 with totnum=155, cancel=30, net=125
// So cancel = 30 means there are 30 missing numbers in the range
// We need to figure out what numbers are "associated" with credit notes.
// Let's try: credit note range = derived from return rows that matched Tax_invoice_details suborders?
const taxSO = new Set(taxRows.map(r => r['Suborder No.']));
const matchedRet = retAug.filter(r => taxSO.has(r.sub_order_num));
console.log('Aug returns matching tax invoice suborders:', matchedRet.length);
const unmatchedRet = retAug.filter(r => !taxSO.has(r.sub_order_num));
console.log('Aug returns NOT matching tax invoice suborders:', unmatchedRet.length);
