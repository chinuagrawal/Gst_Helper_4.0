const XLSX = require('xlsx');
const path = require('path');

const taxWB = XLSX.readFile(path.join(__dirname, 'Tax_invoice_details.xlsx'));
const taxRows = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);
const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const salesRows = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const sellerState = (salesRows[0]?.gstin || '27AAFPQ5593F1ZC').slice(0,2);
const identifierPrefix = salesRows[0]?.identifier || 'pph4k';
const cnPrefixExpected = identifierPrefix + sellerState + 'C';  // "pph4k27C"
console.log('CN prefix expected:', cnPrefixExpected);

// ONLY Type=CREDIT NOTE (exclude DISCOUNT / CONVERSION those are "CM" not "C")
const cnAug = taxRows.filter(r =>
  r['Type'] === 'CREDIT NOTE' && String(r['Order Date'] || '').startsWith('2026-08')
);
console.log('Type=CREDIT NOTE (only) Aug 2026:', cnAug.length);

const validCN = cnAug.map(r => {
  const inv = String(r['Invoice No.'] || '');
  if (inv.startsWith(cnPrefixExpected)) {
    const num = parseInt(inv.slice(cnPrefixExpected.length));
    if (!isNaN(num)) return {raw: inv, num, so: r['Suborder No.']};
  }
  // Fallback: match pattern where C is before final digits
  const m = inv.match(/C(\d+)$/);
  if (m) return {raw: inv, num: parseInt(m[1]), so: r['Suborder No.'], fallback: true};
  return null;
}).filter(Boolean);
console.log('Valid CN parsed:', validCN.length);

const usedNums = new Set(validCN.map(c => c.num));
const minN = Math.min(...usedNums);
const maxN = Math.max(...usedNums);
const totnum = maxN - minN + 1;
let cancel = 0;
for (let n = minN; n <= maxN; n++) if (!usedNums.has(n)) cancel++;
console.log(`
  REF values:       from=C259 to=C413  totnum=155  cancel=30  net=125
  Our calc (ONLY CREDIT NOTE + "C" prefix):
    from=${minN} to=${maxN}  totnum=${totnum}  used=${usedNums.size}  cancel=${cancel}  net=${totnum-cancel}
    FROM STR: ${cnPrefixExpected}${minN}
    TO STR:   ${cnPrefixExpected}${maxN}
`);

console.log('Fallbacks (non-C prefix?):', validCN.filter(c=>c.fallback).length);
console.log('First 5 CNs sorted:');
[...usedNums].sort((a,b)=>a-b).slice(0, 10).forEach(n => {
  const row = validCN.find(c=>c.num===n);
  console.log(`  C${n} => ${row?.raw} (SO:${row?.so})`);
});
console.log('Last 5 CNs sorted:');
[...usedNums].sort((a,b)=>a-b).slice(-10).forEach(n => {
  const row = validCN.find(c=>c.num===n);
  console.log(`  C${n} => ${row?.raw} (SO:${row?.so})`);
});

// Confirm total CREDIT NOTE: 125 matches reference net_issue=125 exactly!
console.log(`\n✅ Confirmation: reference net_issue=125, our actual count of Type=CREDIT NOTE rows=${cnAug.length}`);
console.log(`✅ Confirmation: if reference totnum=155 and cancel=30, 155-30=125 = our actual count!`);

// Check: are some "CREDIT NOTE" rows outside Aug filing month but range extends outside?
const allCN = taxRows.filter(r => r['Type'] === 'CREDIT NOTE');
console.log(`\nAll-time Type=CREDIT NOTE rows: ${allCN.length}`);
const allCNnums = allCN.map(r => {
  const inv = String(r['Invoice No.'] || '');
  if (inv.startsWith(cnPrefixExpected)) return parseInt(inv.slice(cnPrefixExpected.length));
  const m = inv.match(/C(\d+)$/);
  return m ? parseInt(m[1]) : null;
}).filter(n => !isNaN(n));
console.log(`All-time CN num range: ${Math.min(...allCNnums)} - ${Math.max(...allCNnums)} (${allCNnums.length} nums)`);
