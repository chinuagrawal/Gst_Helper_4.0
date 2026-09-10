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

console.log('\n=== Breakdown analysis for POS 27 (MAHARASHTRA, INTRA) ===');
const pos27Sales = salesRaw.filter(s => getPOS(s.end_customer_state_new) === '27');
const pos27Returns = returnsRaw.filter(s => getPOS(s.end_customer_state_new) === '27');
console.log(`Sales in 27: ${pos27Sales.length}`);
console.log(`Returns in 27: ${pos27Returns.length}`);

let sum1 = { tsvRaw: 0, r2tsv: 0, txRaw: 0, txR2: 0, taxAmtCol: 0, taxAmtColR2: 0 };
pos27Sales.forEach(s => {
  const tsv = toNum(s.total_taxable_sale_value);
  const rtsv = r2(tsv);
  const rate = toNum(s.gst_rate);
  const taxCol = toNum(s.tax_amount);
  sum1.tsvRaw += tsv;
  sum1.r2tsv += rtsv;
  sum1.txRaw += tsv * rate / 100;
  sum1.txR2 += rtsv * rate / 100;
  sum1.taxAmtCol += taxCol;
  sum1.taxAmtColR2 += r2(taxCol);
});
pos27Returns.forEach(s => {
  const tsv = toNum(s.total_taxable_sale_value);
  const rtsv = r2(tsv);
  const rate = toNum(s.gst_rate);
  const taxCol = toNum(s.tax_amount);
  sum1.tsvRaw -= tsv;
  sum1.r2tsv -= rtsv;
  sum1.txRaw -= tsv * rate / 100;
  sum1.txR2 -= rtsv * rate / 100;
  sum1.taxAmtCol -= taxCol;
  sum1.taxAmtColR2 -= r2(taxCol);
});
console.log('Net POS 27:');
console.log(`  sum(tsvRaw) - returns = ${r2(sum1.tsvRaw)} vs ref txval 2256.42`);
console.log(`  sum(r2(tsv)) - returns = ${r2(sum1.r2tsv)} vs ref txval 2256.42`);
console.log(`  sum(calc tax from tsvRaw) = ${r2(sum1.txRaw)} per part: c/s=${r2(sum1.txRaw/2)} vs ref 203.09`);
console.log(`  sum(calc tax from r2tsv) = ${r2(sum1.txR2)} per part: c/s=${r2(sum1.txR2/2)} vs ref 203.09`);
console.log(`  sum(tax_amount column) = ${r2(sum1.taxAmtCol)} per part: c/s=${r2(sum1.taxAmtCol/2)} vs ref 203.09`);
console.log(`  sum(r2(tax_amount)) = ${r2(sum1.taxAmtColR2)} per part: c/s=${r2(sum1.taxAmtColR2/2)} vs ref 203.09`);

console.log('\n--- Maybe CAMT/SAMT is just summed as r2(taxCol/2) per row without rounding the /2 ---');
let sum2 = { camt1: 0, samt1: 0, camt2: 0, samt2: 0 };
function addPos27Row(item, sign) {
  const rate = toNum(item.gst_rate);
  const tsv = toNum(item.total_taxable_sale_value);
  const rtsv = r2(tsv);
  const taxCol = toNum(item.tax_amount);
  const t1 = sign * taxCol;
  sum2.camt1 += t1 / 2;
  sum2.samt1 += t1 / 2;
  const t2 = sign * r2(taxCol);
  sum2.camt2 += r2(t2 / 2);
  sum2.samt2 += r2(t2 / 2);
}
pos27Sales.forEach(s => addPos27Row(s, 1));
pos27Returns.forEach(s => addPos27Row(s, -1));
console.log(`  approach1 (taxCol/2 sum, then round): camt=${r2(sum2.camt1)} samt=${r2(sum2.samt1)} vs ref 203.09`);
console.log(`  approach2 (r2(taxCol/2) each row sum): camt=${r2(sum2.camt2)} samt=${r2(sum2.samt2)} vs ref 203.09`);

console.log('\n--- approach3: sum rtsv for txval, then compute total gst, then split using banker rounding or floor ---');
const totalTxval = sum1.r2tsv;
console.log(`  totalTxval (sum r2tsv-net) = ${totalTxval}`);
console.log(`  ref txval 27_18 = 2256.42`);
const totalGstExact = totalTxval * 18 / 100;
console.log(`  totalGst = ${totalGstExact}`);
console.log(`  /2 unrounded = ${totalGstExact/2} -> rounded = ${r2(totalGstExact/2)}`);
console.log(`  /2 alternative: one floor+ceil: floor=${Math.floor(totalGstExact*50)/100} ceil=${Math.ceil(totalGstExact*50)/100}`);
console.log(`  ref: camt=203.09 samt=203.09`);

console.log('\n=== Now test: AGGREGATE sales separately and returns separately (with r2 each row), subtract, then round GST ===');
function build_v1() {
  function agg(rows, sign) {
    const b2cs = {}, hsn = {};
    rows.forEach(r => {
      const pos = getPOS(r.end_customer_state_new);
      const rt = toNum(r.gst_rate);
      const tsv = sign * r2(toNum(r.total_taxable_sale_value));
      const qty = sign * toNum(r.quantity);
      const tax = sign * toNum(r.tax_amount);
      const isIntra = pos === '27';
      const { hsn_sc, uqc } = mapHSN(r.hsn_code);
      const sply = isIntra ? 'INTRA' : 'INTER';
      const iamt = isIntra ? 0 : tax;
      const camt = isIntra ? tax / 2 : 0;
      const samt = isIntra ? tax / 2 : 0;
      const bk = `${pos}|${rt}`;
      if (!b2cs[bk]) b2cs[bk] = { sply_ty: sply, rt, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
      b2cs[bk].txval += tsv;
      b2cs[bk].iamt += iamt;
      b2cs[bk].camt += camt;
      b2cs[bk].samt += samt;
      const hk = `${hsn_sc}|${uqc}|${rt}|${pos}`;
      if (!hsn[hk]) hsn[hk] = { hsn_sc, uqc, rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
      hsn[hk].qty += qty;
      hsn[hk].txval += tsv;
      hsn[hk].iamt += iamt;
      hsn[hk].camt += camt;
      hsn[hk].samt += samt;
    });
    return { b2cs, hsn };
  }
  const s = agg(salesRaw, 1), rr = agg(returnsRaw, -1);
  const b2csFinal = {};
  [s.b2cs, rr.b2cs].forEach(src => {
    Object.entries(src).forEach(([k, v]) => {
      if (!b2csFinal[k]) b2csFinal[k] = { ...v };
      else {
        b2csFinal[k].txval += v.txval;
        b2csFinal[k].iamt += v.iamt;
        b2csFinal[k].camt += v.camt;
        b2csFinal[k].samt += v.samt;
      }
    });
  });
  const b2cs = Object.values(b2csFinal).map(v => ({
    sply_ty: v.sply_ty, rt: Number(v.rt), typ: 'OE', pos: v.pos,
    txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
  })).filter(v => v.txval !== 0);
  
  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  
  const hsnMain = {};
  [s.hsn, rr.hsn].forEach(src => {
    Object.values(src).forEach(v => {
      const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
      if (!hsnMain[k]) hsnMain[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0 };
      hsnMain[k].qty += v.qty;
      hsnMain[k].txval += v.txval;
      hsnMain[k].iamt += v.iamt;
      hsnMain[k].camt += v.camt;
      hsnMain[k].samt += v.samt;
    });
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

const out1 = build_v1();
const outStr = JSON.stringify(out1);
const refStr = JSON.stringify(ref);
console.log(`\nBuild_v1: length our=${outStr.length} ref=${refStr.length}, match=${outStr === refStr}`);
if (outStr !== refStr) {
  const bmap = {}; ref.b2cs.forEach(b => { bmap[b.pos + '_' + b.rt] = b; });
  let cnt = 0;
  out1.b2cs.forEach(b => {
    const r = bmap[b.pos + '_' + b.rt];
    if (!r || b.txval !== r.txval || b.iamt !== r.iamt || b.camt !== r.camt || b.samt !== r.samt) {
      if (cnt < 10) console.log(`  B2C diff ${b.pos}_${b.rt}: our(${b.txval},i=${b.iamt},c=${b.camt},s=${b.samt}) ref(${r?.txval},i=${r?.iamt},c=${r?.camt},s=${r?.samt})`);
      cnt++;
    }
  });
  console.log(`  B2C diffs: ${cnt}/${out1.b2cs.length}`);
  const hmap = {}; ref.hsn.hsn_b2c.forEach(h => { hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let hcnt = 0;
  out1.hsn.hsn_b2c.forEach(h => {
    const r = hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
    if (!r || h.txval !== r.txval || h.iamt !== r.iamt || h.camt !== r.camt || h.samt !== r.samt || h.qty !== r.qty) {
      if (hcnt < 10) console.log(`  HSN diff ${h.hsn_sc}_${h.uqc}_${h.rt}: our(q=${h.qty},t=${h.txval},i=${h.iamt},c=${h.camt},s=${h.samt}) ref(q=${r?.qty},t=${r?.txval},i=${r?.iamt},c=${r?.camt},s=${r?.samt})`);
      hcnt++;
    }
  });
  console.log(`  HSN diffs: ${hcnt}/${out1.hsn.hsn_b2c.length}`);
  console.log(`  supeco: our supp=${out1.supeco.clttx[0].suppval} igst=${out1.supeco.clttx[0].igst} cgst=${out1.supeco.clttx[0].cgst} sgst=${out1.supeco.clttx[0].sgst}`);
  console.log(`  ref   : supp=${ref.supeco.clttx[0].suppval} igst=${ref.supeco.clttx[0].igst} cgst=${ref.supeco.clttx[0].cgst} sgst=${ref.supeco.clttx[0].sgst}`);
}
