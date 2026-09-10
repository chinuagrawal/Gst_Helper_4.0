const XLSX = require('xlsx');
const path = require('path');

const STATE_TO_POS = {
  'JAMMU AND KASHMIR': '01', 'JAMMU & KASHMIR': '01',
  'HIMACHAL PRADESH': '02', 'PUNJAB': '03', 'CHANDIGARH': '04',
  'UTTARAKHAND': '05', 'UTTARANCHAL': '05', 'HARYANA': '06', 'DELHI': '07',
  'RAJASTHAN': '08', 'UTTAR PRADESH': '09', 'BIHAR': '10', 'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12', 'NAGALAND': '13', 'MANIPUR': '14', 'MIZORAM': '15',
  'TRIPURA': '16', 'MEGHALAYA': '17', 'ASSAM': '18', 'WEST BENGAL': '19',
  'JHARKHAND': '20', 'ODISHA': '21', 'ORISSA': '21',
  'CHATTISGARH': '22', 'CHHATTISGARH': '22', 'MADHYA PRADESH': '23', 'GUJARAT': '24',
  'DAMAN AND DIU': '25', 'DAMAN & DIU': '25',
  'DADRA AND NAGAR HAVELI': '26', 'DADRA & NAGAR HAVELI': '26',
  'MAHARASHTRA': '27', 'ANDHRA PRADESH (OLD)': '28', 'KARNATAKA': '29', 'GOA': '30',
  'LAKSHADWEEP': '31', 'KERALA': '32', 'TAMIL NADU': '33',
  'PUDUCHERRY': '34', 'PONDICHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35', 'ANDAMAN & NICOBAR ISLANDS': '35',
  'TELANGANA': '36', 'ANDHRA PRADESH': '37', 'LADAKH': '38',
};

const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const salesRaw = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const returnWB = XLSX.readFile(path.join(__dirname, 'tcs_sales_return.xlsx'));
const returnsRaw = XLSX.utils.sheet_to_json(returnWB.Sheets[returnWB.SheetNames[0]]);
const ref = require('./REPOTIC output.json');

function normalize(s) { return (s || '').toString().trim().toUpperCase(); }
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(v * 100) / 100; }
function getPOS(s) {
  const n = normalize(s);
  if (STATE_TO_POS[n]) return STATE_TO_POS[n];
  for (const k of Object.keys(STATE_TO_POS))
    if (n.includes(k) || k.includes(n)) return STATE_TO_POS[k];
  return null;
}
function mapHSN(hsn) { return hsn === '392401' ? { hsn_sc: '392490', uqc: 'PAC' } : { hsn_sc: hsn, uqc: 'PCS' }; }
function transformETIN(e, sc) { return e && e.length >= 15 ? sc + e.slice(2) : e; }

const sellerGstin = salesRaw[0]?.gstin || '27AAFPQ5593F1ZC';
const sellerStateCode = sellerGstin.slice(0, 2);
const etin = transformETIN(salesRaw[0]?.eco_tcs_gstin, sellerStateCode);

console.log('\n=== Strategy 7: Per-row tsv rounded, per-row tax rounded, INTRA c/s rounded per-row ===\n');

function buildFinal(intraHalfRounding, taxSignNetting) {
  const b2csAgg = {}, hsnAgg = {};
  function processRow(r, sign) {
    const pos = getPOS(r.end_customer_state_new);
    const rt = toNum(r.gst_rate);
    const tsv = sign * r2(toNum(r.total_taxable_sale_value));
    const qty = sign * toNum(r.quantity);
    const isIntra = pos === '27';
    const taxAbs = r2(r2(toNum(r.total_taxable_sale_value)) * rt / 100);
    const tax = sign * taxAbs;
    let iamt, camt, samt;
    if (isIntra) {
      iamt = 0;
      if (intraHalfRounding === 'each_r2') {
        camt = sign * r2(taxAbs / 2);
        samt = sign * r2(taxAbs / 2);
      } else if (intraHalfRounding === 'one_r2_half_one_remainder') {
        const h = sign * r2(taxAbs / 2);
        camt = h;
        samt = tax - h;
      } else {
        camt = tax / 2;
        samt = tax / 2;
      }
    } else {
      iamt = tax; camt = 0; samt = 0;
    }
    const sply = isIntra ? 'INTRA' : 'INTER';
    const { hsn_sc, uqc } = mapHSN(r.hsn_code);
    const bk = `${pos}|${rt}`;
    if (!b2csAgg[bk]) b2csAgg[bk] = { sply_ty: sply, rt, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    b2csAgg[bk].txval += tsv;
    b2csAgg[bk].iamt += iamt;
    b2csAgg[bk].camt += camt;
    b2csAgg[bk].samt += samt;
    const hk = `${hsn_sc}|${uqc}|${rt}|${pos}`;
    if (!hsnAgg[hk]) hsnAgg[hk] = { hsn_sc, uqc, rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnAgg[hk].qty += qty;
    hsnAgg[hk].txval += tsv;
    hsnAgg[hk].iamt += iamt;
    hsnAgg[hk].camt += camt;
    hsnAgg[hk].samt += samt;
  }
  
  if (taxSignNetting === 'salePlusReturnNegative') {
    salesRaw.forEach(r => processRow(r, 1));
    returnsRaw.forEach(r => processRow(r, -1));
  } else {
    // net by suborder first
    const soMap = {};
    salesRaw.forEach(r => { if (!soMap[r.sub_order_num]) soMap[r.sub_order_num] = { sales: [], returns: [] }; soMap[r.sub_order_num].sales.push(r); });
    returnsRaw.forEach(r => { if (!soMap[r.sub_order_num]) soMap[r.sub_order_num] = { sales: [], returns: [] }; soMap[r.sub_order_num].returns.push(r); });
    Object.values(soMap).forEach(({ sales, returns }) => {
      sales.forEach(s => processRow(s, 1));
      returns.forEach(r => {
        if (soMap[r.sub_order_num] && sales.length > 0) processRow(r, -1);
        else processRow(r, -1);
      });
    });
    // returns without matching suborder:
    returnsRaw.forEach(r => { if (!salesRaw.find(s => s.sub_order_num === r.sub_order_num)) processRow(r, -1); });
  }
  
  const b2cs = Object.values(b2csAgg).map(v => ({
    sply_ty: v.sply_ty, rt: Number(v.rt), typ: 'OE', pos: v.pos,
    txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
  })).filter(v => v.txval !== 0);
  
  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  const hsnMain = {};
  Object.values(hsnAgg).forEach(v => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnMain[k]) hsnMain[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0 };
    hsnMain[k].qty += v.qty;
    hsnMain[k].txval += v.txval;
    hsnMain[k].iamt += v.iamt;
    hsnMain[k].camt += v.camt;
    hsnMain[k].samt += v.samt;
  });
  const hsn_b2c = Object.values(hsnMain)
    .filter(v => Math.round(v.qty) !== 0 || r2(v.txval) !== 0)
    .map((v, i) => ({
      num: i + 1, hsn_sc: v.hsn_sc, uqc: v.uqc, qty: Math.round(v.qty), rt: Number(v.rt),
      txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
    }));
  return {
    gstin: sellerGstin, fp: '082026', b2cs,
    supeco: { clttx: [{ etin, suppval: r2(totalSuppval), igst: r2(totalIgst), cgst: r2(totalCgst), sgst: r2(totalSgst), cess: 0, flag: 'N' }] },
    hsn: { hsn_b2c },
  };
}

const variants = [
  ['div2_no_round + sale+(-return)', 'no', 'salePlusReturnNegative'],
  ['each_r2 + sale+(-return)', 'each_r2', 'salePlusReturnNegative'],
  ['one_r2_half_one_remainder + sale+(-return)', 'one_r2_half_one_remainder', 'salePlusReturnNegative'],
];

variants.forEach(([name, intra, netting]) => {
  const out = buildFinal(intra, netting);
  const bmap = {}; ref.b2cs.forEach(b => { bmap[b.pos + '_' + b.rt] = b; });
  let be = 0, bdiffs = [];
  out.b2cs.forEach(b => {
    const r = bmap[b.pos + '_' + b.rt];
    if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) be++;
    else if (r) bdiffs.push(`${b.pos}_${b.rt}: our(${b.iamt},${b.camt},${b.samt}) ref(${r.iamt},${r.camt},${r.samt})`);
  });
  const hmap = {}; ref.hsn.hsn_b2c.forEach(h => { hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let he = 0;
  out.hsn.hsn_b2c.forEach(h => {
    const r = hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
    if (r && h.txval === r.txval && h.iamt === r.iamt && h.camt === r.camt && h.samt === r.samt && h.qty === r.qty) he++;
  });
  const sMatch = out.supeco.clttx[0].suppval === ref.supeco.clttx[0].suppval
    && out.supeco.clttx[0].igst === ref.supeco.clttx[0].igst
    && out.supeco.clttx[0].cgst === ref.supeco.clttx[0].cgst
    && out.supeco.clttx[0].sgst === ref.supeco.clttx[0].sgst;
  const fullMatch = JSON.stringify(out) === JSON.stringify(ref);
  console.log(`\n[${name}]: B=${be}/${ref.b2cs.length} H=${he}/${ref.hsn.hsn_b2c.length} S=${sMatch} FULL=${fullMatch}`);
  if (bdiffs.length > 0) { console.log('  B diffs:', bdiffs.slice(0, 5)); }
  if (!sMatch) {
    console.log(`  supeco our: supp=${out.supeco.clttx[0].suppval} igst=${out.supeco.clttx[0].igst} cgst=${out.supeco.clttx[0].cgst} sgst=${out.supeco.clttx[0].sgst}`);
    console.log(`  supeco ref: supp=${ref.supeco.clttx[0].suppval} igst=${ref.supeco.clttx[0].igst} cgst=${ref.supeco.clttx[0].cgst} sgst=${ref.supeco.clttx[0].sgst}`);
  }
});

console.log('\n\n=== Debug 29_18 mismatch (KARNATAKA) ===\n');
const pos29Sales = salesRaw.filter(s => getPOS(s.end_customer_state_new) === '29');
const pos29Returns = returnsRaw.filter(s => getPOS(s.end_customer_state_new) === '29');
console.log(`Sales in 29: ${pos29Sales.length}, Returns in 29: ${pos29Returns.length}`);

function calcNet(rows, sign, r2EachTsv, r2EachTax) {
  let tx = 0, ia = 0;
  rows.forEach(r => {
    const tsv = toNum(r.total_taxable_sale_value);
    const rt = toNum(r.gst_rate);
    const txv = sign * (r2EachTsv ? r2(tsv) : tsv);
    tx += txv;
    const taxAbs = r2EachTsv ? r2(tsv) * rt / 100 : tsv * rt / 100;
    const tax = sign * (r2EachTax ? r2(taxAbs) : taxAbs);
    ia += tax;
  });
  return { tx: r2(tx), ia: r2(ia) };
}

const sales29 = calcNet(pos29Sales, 1, true, true);
const ret29 = calcNet(pos29Returns, 1, true, true);
const net29 = { tx: r2(sales29.tx - ret29.tx), ia: r2(sales29.ia - ret29.ia) };
console.log(`Sale 29: tx=${sales29.tx} ia=${sales29.ia}`);
console.log(`Ret  29: tx=${ret29.tx} ia=${ret29.ia}`);
console.log(`Net  29: tx=${net29.tx} ia=${net29.ia}`);
const ref29 = ref.b2cs.find(b => b.pos === '29');
console.log(`Ref  29: tx=${ref29?.txval} ia=${ref29?.iamt}`);
console.log(`29_18 Diff: our tx=${net29.tx - ref29?.txval} ia=${r2(net29.ia - ref29?.iamt)}`);

// Build a combined net list for 29 to see accumulative
console.log('\nStep through 29 rows 1 by 1 to find rounding diff:');
let accTx = 0, accIa = 0;
const all29 = [
  ...pos29Sales.map(r => ({ ...r, _s: 1, _type: 'SALE' })),
  ...pos29Returns.map(r => ({ ...r, _s: -1, _type: 'RET' })),
];
all29.forEach((r, i) => {
  const tsv = toNum(r.total_taxable_sale_value);
  const rt = toNum(r.gst_rate);
  const txv = r._s * r2(tsv);
  const taxAbs = r2(tsv) * rt / 100;
  const tax = r._s * r2(taxAbs);
  accTx += txv; accIa += tax;
  if (i < 5 || i >= all29.length - 3) {
    console.log(`  [${i}] ${r._type} r2tsv=${r2(tsv)} txv=${txv} taxAbs=${r2(taxAbs)} tax=${tax}  accTx=${r2(accTx)} accIa=${r2(accIa)}`);
  }
});
console.log(`Final accTx=${r2(accTx)} accIa=${r2(accIa)} vs ref ia=${ref29?.iamt}`);
// Maybe try approach: per-row tax with no rounding. Then aggregate, then round.
console.log('\nTry: per-row NO ROUNDING on tax, aggregate, then round:');
let accTx2 = 0, accIa2 = 0;
all29.forEach(r => {
  const tsv = toNum(r.total_taxable_sale_value);
  const rt = toNum(r.gst_rate);
  const txv = r._s * r2(tsv);
  const tax = r._s * (r2(tsv) * rt / 100);
  accTx2 += txv; accIa2 += tax;
});
console.log(`  accTx2=${r2(accTx2)} accIa2_unrounded=${accIa2} rounded=${r2(accIa2)} vs ref ia=${ref29?.iamt}`);
