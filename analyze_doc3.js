const XLSX = require('xlsx');
const path = require('path');

const taxWB = XLSX.readFile(path.join(__dirname, 'Tax_invoice_details.xlsx'));
const taxRows = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);
const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const salesRows = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const retWB = XLSX.readFile(path.join(__dirname, 'tcs_sales_return.xlsx'));
const retRows = XLSX.utils.sheet_to_json(retWB.Sheets[retWB.SheetNames[0]]);

const sellerGstin = salesRows[0]?.gstin || '27AAFPQ5593F1ZC';
const sellerState = sellerGstin.slice(0, 2);
const identifierPrefix = salesRows[0]?.identifier || 'pph4k';
const invPrefix = identifierPrefix + sellerState;  // "pph4k27"
console.log(`Expected invoice prefix: "${invPrefix}" (identifier=${identifierPrefix} state=${sellerState})`);

console.log('\n=== INVOICE RANGE (Type=INVOICE, Aug 2026) ===');
const invAug = taxRows.filter(r =>
  r['Type'] === 'INVOICE' && String(r['Order Date'] || '').startsWith('2026-08')
);
console.log('INVOICE rows in Aug 2026:', invAug.length);
const parsedInv = invAug.map(r => {
  const inv = String(r['Invoice No.'] || '');
  if (inv.startsWith(invPrefix)) {
    const numStr = inv.slice(invPrefix.length);
    const num = parseInt(numStr);
    if (!isNaN(num)) return {raw: inv, num, prefix:invPrefix};
  }
  // try alternative: match last group of digits after state
  const m = inv.match(/(\d+)(?!.*\d)/);
  if (m) return {raw: inv, num: parseInt(m[1])};
  return null;
}).filter(Boolean);
console.log('Parsed invoices:', parsedInv.length);
const usedInvNums = new Set(parsedInv.map(p => p.num));
const minInv = Math.min(...usedInvNums);
const maxInv = Math.max(...usedInvNums);
const totnumInv = maxInv - minInv + 1;
let cancelInv = 0;
for (let n = minInv; n <= maxInv; n++) if (!usedInvNums.has(n)) cancelInv++;
console.log(`  NUMERIC: from=${minInv} to=${maxInv} range=${totnumInv}`);
console.log(`  Used (unique nums): ${usedInvNums.size}  cancel: ${cancelInv}`);
console.log(`  net_issue = totnum - cancel = ${totnumInv - cancelInv}`);
console.log(`  ACTUAL INVOICE STRING from: ${invPrefix}${minInv}`);
console.log(`  ACTUAL INVOICE STRING to:   ${invPrefix}${maxInv}`);
console.log(`  Check: net_issue (${totnumInv - cancelInv}) should equal actual rows (${invAug.length}) or unique nums (${usedInvNums.size})?`);

// --- Credit Notes in Tax_invoice_details: Type=CREDIT NOTE / CREDIT_DISCOUNT / CREDIT_CONVERSION ---
console.log('\n=== CREDIT NOTE RANGE (credit types, Aug 2026) ===');
const creditTypes = ['CREDIT NOTE', 'CREDIT_DISCOUNT', 'CREDIT_CONVERSION'];
const cnAug = taxRows.filter(r =>
  creditTypes.includes(r['Type']) && String(r['Order Date'] || '').startsWith('2026-08')
);
console.log('Credit-note rows in Tax_invoice_details (Aug 2026):', cnAug.length);
console.log('Credit Type breakdown:');
creditTypes.forEach(t => {
  console.log(`  ${t}: ${cnAug.filter(r=>r['Type']===t).length}`);
});
console.log('Sample 5 CN Invoice Nos:');
cnAug.slice(0, 5).forEach(r => console.log(`  [${r['Type']}] ${r['Invoice No.']}  SO:${r['Suborder No.']}`));

// Parse credit note numbers: pattern is pph4k27 + "C" + number (like "pph4k27C259")
const cnPrefixExpected = invPrefix + 'C';  // "pph4k27C"
console.log(`\nExpected CN prefix: "${cnPrefixExpected}"`);
const parsedCN = cnAug.map(r => {
  const inv = String(r['Invoice No.'] || '');
  // Case 1: starts with "pph4k27C"
  if (inv.startsWith(cnPrefixExpected)) {
    const numStr = inv.slice(cnPrefixExpected.length);
    const num = parseInt(numStr);
    if (!isNaN(num)) return {raw: inv, num, prefix:cnPrefixExpected};
  }
  // Case 2: has a "C" before final digits
  const m = inv.match(/C(\d+)$/);
  if (m) return {raw: inv, num: parseInt(m[1])};
  // Case 3: just grab final digits and note no C
  const m2 = inv.match(/(\d+)$/);
  if (m2) return {raw: inv, num: parseInt(m2[1]), noC: true};
  return null;
}).filter(Boolean);
console.log('Parsed CNs:', parsedCN.length);
const cnNoC = parsedCN.filter(p => p.noC);
if (cnNoC.length) console.log(`  CNs WITHOUT "C" marker: ${cnNoC.length}. Samples:`, cnNoC.slice(0,3).map(p=>p.raw));

// If credit note prefix is "pph4k27C" - re-filter to only include C-marked
const validParsedCN = parsedCN.filter(p => !p.noC);
if (validParsedCN.length) {
  const usedCN = new Set(validParsedCN.map(p => p.num));
  const cmin = Math.min(...usedCN);
  const cmax = Math.max(...usedCN);
  const ctot = cmax - cmin + 1;
  let ccancel = 0;
  for (let n = cmin; n <= cmax; n++) if (!usedCN.has(n)) ccancel++;
  console.log(`\n  C-NUMERIC: from=${cmin} to=${cmax} range=${ctot}`);
  console.log(`  Used (unique nums): ${usedCN.size}  cancel: ${ccancel}`);
  console.log(`  net_issue = ${ctot - ccancel}`);
  console.log(`  FROM STR: ${cnPrefixExpected}${cmin}`);
  console.log(`  TO STR:   ${cnPrefixExpected}${cmax}`);
}

// If no valid C-prefixed credit notes in Tax_invoice_details, fall back to returns
if (validParsedCN.length === 0) {
  console.log('\n  FALLBACK: Credit notes from returns file');
  const retAug = retRows.filter(r => {
    const d = r.manifest_date || r.order_date;
    return d && d.startsWith('2026-08');
  });
  const cnCount = [...new Set(retAug.map(r => r.sub_order_num))].length;
  console.log(`  Return rows in Aug: ${retAug.length}, unique SOs: ${cnCount}`);
  console.log(`  Synthetic range: ${cnPrefixExpected}1 .. ${cnPrefixExpected}${cnCount}`);
  console.log(`  Synthetic: from=${cnPrefixExpected}1 to=${cnPrefixExpected}${cnCount} totnum=${cnCount} cancel=0 net_issue=${cnCount}`);
}
