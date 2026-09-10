const XLSX = require('xlsx');
const path = require('path');

const STATE_TO_POS = {
  'JAMMU AND KASHMIR': '01', 'JAMMU & KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05', 'UTTARANCHAL': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21', 'ORISSA': '21',
  'CHATTISGARH': '22', 'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '25', 'DAMAN & DIU': '25',
  'DADRA AND NAGAR HAVELI': '26', 'DADRA & NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH (OLD)': '28',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34', 'PONDICHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35', 'ANDAMAN & NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'ANDHRA PRADESH': '37',
  'LADAKH': '38',
};

const salesWB = XLSX.readFile(path.join(__dirname, 'tcs_sales.xlsx'));
const salesRaw = XLSX.utils.sheet_to_json(salesWB.Sheets[salesWB.SheetNames[0]]);
const returnWB = XLSX.readFile(path.join(__dirname, 'tcs_sales_return.xlsx'));
const returnsRaw = XLSX.utils.sheet_to_json(returnWB.Sheets[returnWB.SheetNames[0]]);

const ref = require('./REPOTIC output.json');

function normalize(s) { return (s || '').toString().trim().toUpperCase(); }
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(v * 100) / 100; }

function getPOS(stateName) {
  const norm = normalize(stateName);
  if (STATE_TO_POS[norm]) return STATE_TO_POS[norm];
  for (const k of Object.keys(STATE_TO_POS)) {
    if (norm.includes(k) || k.includes(norm)) return STATE_TO_POS[k];
  }
  return null;
}

function mapHSN_UQC(hsn_code) {
  if (hsn_code === '392401') return { hsn_sc: '392490', uqc: 'PAC' };
  return { hsn_sc: hsn_code, uqc: 'PCS' };
}

function transformETIN(ecoGstin, sellerStateCode) {
  if (!ecoGstin || ecoGstin.length < 15) return ecoGstin;
  return sellerStateCode + ecoGstin.slice(2);
}

console.log('=== ROUNDING TEST: Match exact ref values ===\n');

function aggregateSales(rows, isReturn = false) {
  const sign = isReturn ? -1 : 1;
  const b2csAgg = {};
  const hsnAgg = {};
  
  rows.forEach(item => {
    const state = item.end_customer_state_new;
    const pos = getPOS(state);
    const rate = toNum(item.gst_rate);
    const tsv = toNum(item.total_taxable_sale_value);
    const qty = toNum(item.quantity);
    const hsnRaw = item.hsn_code;
    const { hsn_sc, uqc } = mapHSN_UQC(hsnRaw);

    const isIntra = pos === '27';
    const sply_ty = isIntra ? 'INTRA' : 'INTER';
    
    const b2ck = `${pos}|${rate}`;
    if (!b2csAgg[b2ck]) {
      b2csAgg[b2ck] = { sply_ty, rt: rate, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    }
    b2csAgg[b2ck].txval += sign * tsv;
    const gstPer = sign * tsv * rate / 100;
    if (isIntra) {
      b2csAgg[b2ck].camt += gstPer / 2;
      b2csAgg[b2ck].samt += gstPer / 2;
    } else {
      b2csAgg[b2ck].iamt += gstPer;
    }

    const hsnk = `${hsn_sc}|${uqc}|${rate}`;
    if (!hsnAgg[hsnk]) {
      hsnAgg[hsnk] = { hsn_sc, uqc, rt: rate, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    }
    hsnAgg[hsnk].qty += sign * qty;
    hsnAgg[hsnk].txval += sign * tsv;
    const hgstPer = sign * tsv * rate / 100;
    if (isIntra) {
      hsnAgg[hsnk].camt += hgstPer / 2;
      hsnAgg[hsnk].samt += hgstPer / 2;
    } else {
      hsnAgg[hsnk].iamt += hgstPer;
    }
  });
  
  return { b2csAgg, hsnAgg };
}

const sAgg = aggregateSales(salesRaw, false);
const rAgg = aggregateSales(returnsRaw, true);

function mergeAggs(sAgg, rAgg) {
  const b2csFinal = {};
  [sAgg.b2csAgg, rAgg.b2csAgg].forEach(src => {
    Object.entries(src).forEach(([k, v]) => {
      if (!b2csFinal[k]) {
        b2csFinal[k] = { ...v };
      } else {
        b2csFinal[k].txval += v.txval;
        b2csFinal[k].iamt += v.iamt;
        b2csFinal[k].camt += v.camt;
        b2csFinal[k].samt += v.samt;
        b2csFinal[k].csamt += v.csamt;
      }
    });
  });
  
  const hsnFinal = {};
  [sAgg.hsnAgg, rAgg.hsnAgg].forEach(src => {
    Object.entries(src).forEach(([k, v]) => {
      if (!hsnFinal[k]) {
        hsnFinal[k] = { ...v };
      } else {
        hsnFinal[k].qty += v.qty;
        hsnFinal[k].txval += v.txval;
        hsnFinal[k].iamt += v.iamt;
        hsnFinal[k].camt += v.camt;
        hsnFinal[k].samt += v.samt;
        hsnFinal[k].csamt += v.csamt;
      }
    });
  });
  
  return { b2csFinal, hsnFinal };
}

const merged = mergeAggs(sAgg, rAgg);

console.log('TEST 1: Aggregate sales first, aggregate returns separately, then subtract (full precision), then round each field:');
const b2csArr1 = Object.values(merged.b2csFinal)
  .map(v => ({
    sply_ty: v.sply_ty,
    rt: v.rt,
    typ: v.typ,
    pos: v.pos,
    txval: r2(v.txval),
    iamt: r2(v.iamt),
    samt: r2(v.samt),
    camt: r2(v.camt),
    csamt: r2(v.csamt),
  }))
  .filter(v => v.txval !== 0);

const total1 = b2csArr1.reduce((a, b) => ({
  txval: a.txval + b.txval,
  iamt: a.iamt + b.iamt,
  camt: a.camt + b.camt,
  samt: a.samt + b.samt,
}), { txval: 0, iamt: 0, camt: 0, samt: 0 });

const refTotal = ref.b2cs.reduce((a, b) => ({
  txval: a.txval + b.txval,
  iamt: a.iamt + b.iamt,
  camt: a.camt + b.camt,
  samt: a.samt + b.samt,
}), { txval: 0, iamt: 0, camt: 0, samt: 0 });

console.log(`  Our totals:   txval=${total1.txval}, igst=${total1.iamt}, cgst=${total1.camt}, sgst=${total1.samt}`);
console.log(`  Ref totals:   txval=${refTotal.txval}, igst=${refTotal.iamt}, cgst=${refTotal.camt}, sgst=${refTotal.samt}`);
console.log(`  Diff txval: ${refTotal.txval - total1.txval}, igst: ${refTotal.iamt - total1.iamt}`);

console.log('\nTEST 2: Compare each B2CS entry side-by-side (sorted by pos then rate):');
const ourSorted = [...b2csArr1].sort((a, b) => (a.pos + a.rt).localeCompare(b.pos + b.rt));
const refSorted = [...ref.b2cs].sort((a, b) => (a.pos + a.rt).localeCompare(b.pos + b.rt));

const ourMap = {};
ourSorted.forEach(o => { ourMap[o.pos + '|' + o.rt] = o; });
const refMap = {};
refSorted.forEach(r => { refMap[r.pos + '|' + r.rt] = r; });

const allKeys = [...new Set([...Object.keys(ourMap), ...Object.keys(refMap)])].sort();
let mismatches = 0;
allKeys.forEach(k => {
  const o = ourMap[k];
  const r = refMap[k];
  const diffTx = (o && r) ? (r.txval - o.txval) : 'N/A';
  const diffIamt = (o && r) ? (r.iamt - o.iamt) : 'N/A';
  if (!o || !r || Math.abs(r.txval - o.txval) > 0.01 || Math.abs(r.iamt - o.iamt) > 0.01) {
    mismatches++;
    console.log(`  ${k}: OUR={txval:${o?.txval}, iamt:${o?.iamt}, sply_ty:${o?.sply_ty}, camt:${o?.camt}, samt:${o?.samt}} vs REF={txval:${r?.txval}, iamt:${r?.iamt}, sply_ty:${r?.sply_ty}, camt:${r?.camt}, samt:${r?.samt}} -- diff txval:${diffTx} iamt:${diffIamt}`);
  }
});
console.log(`  Total mismatches (>0.01 diff): ${mismatches} / ${allKeys.length}`);

console.log('\nTEST 3: HSN side-by-side:');
const hsnArr1 = Object.values(merged.hsnFinal)
  .map((v, i) => ({
    num: i + 1,
    hsn_sc: v.hsn_sc,
    uqc: v.uqc,
    qty: Math.round(v.qty),
    rt: v.rt,
    txval: r2(v.txval),
    iamt: r2(v.iamt),
    samt: r2(v.samt),
    camt: r2(v.camt),
    csamt: r2(v.csamt),
  }))
  .filter(v => v.txval !== 0 || v.qty !== 0);

const refHSNMap = {};
ref.hsn.hsn_b2c.forEach(h => { refHSNMap[h.hsn_sc + '|' + h.uqc + '|' + h.rt] = h; });
const ourHSNMap = {};
hsnArr1.forEach(h => { ourHSNMap[h.hsn_sc + '|' + h.uqc + '|' + h.rt] = h; });

const allHSNKeys = [...new Set([...Object.keys(ourHSNMap), ...Object.keys(refHSNMap)])].sort();
allHSNKeys.forEach(k => {
  const o = ourHSNMap[k];
  const r = refHSNMap[k];
  const match = o && r && o.qty === r.qty && Math.abs(o.txval - r.txval) < 0.02;
  if (!match) {
    console.log(`  ${k}: OUR={qty:${o?.qty}, txval:${o?.txval}, iamt:${o?.iamt}} vs REF={qty:${r?.qty}, txval:${r?.txval}, iamt:${r?.iamt}} MATCH=${match}`);
  }
});

console.log('\nTEST 4: Full output with ETIN check');
const sellerGstin = salesRaw[0]?.gstin || '27AAFPQ5593F1ZC';
const sellerStateCode = sellerGstin.slice(0, 2);
const ecoTcsGstin = salesRaw[0]?.eco_tcs_gstin;
const etin = transformETIN(ecoTcsGstin, sellerStateCode);
console.log(`  GSTIN: ${sellerGstin}, state: ${sellerStateCode}`);
console.log(`  ECO TCS GSTIN: ${ecoTcsGstin} -> ETIN: ${etin} (ref: ${ref.supeco.clttx[0].etin})`);
console.log(`  Match: ${etin === ref.supeco.clttx[0].etin}`);

console.log('\nTEST 5: Now check a different rounding approach - round each sales/return row first');
function aggregateSalesRoundPerRow(rows, isReturn = false) {
  const sign = isReturn ? -1 : 1;
  const b2csAgg = {};
  const hsnAgg = {};
  
  rows.forEach(item => {
    const state = item.end_customer_state_new;
    const pos = getPOS(state);
    const rate = toNum(item.gst_rate);
    const tsv = toNum(item.total_taxable_sale_value);
    const qty = toNum(item.quantity);
    const hsnRaw = item.hsn_code;
    const { hsn_sc, uqc } = mapHSN_UQC(hsnRaw);

    const isIntra = pos === '27';
    const sply_ty = isIntra ? 'INTRA' : 'INTER';
    
    const txval_i = sign * tsv;
    const gstPer_i = txval_i * rate / 100;
    const camt_i = isIntra ? gstPer_i / 2 : 0;
    const samt_i = isIntra ? gstPer_i / 2 : 0;
    const iamt_i = isIntra ? 0 : gstPer_i;
    
    const b2ck = `${pos}|${rate}`;
    if (!b2csAgg[b2ck]) {
      b2csAgg[b2ck] = { sply_ty, rt: rate, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    }
    b2csAgg[b2ck].txval += txval_i;
    b2csAgg[b2ck].camt += camt_i;
    b2csAgg[b2ck].samt += samt_i;
    b2csAgg[b2ck].iamt += iamt_i;

    const hsnk = `${hsn_sc}|${uqc}|${rate}`;
    if (!hsnAgg[hsnk]) {
      hsnAgg[hsnk] = { hsn_sc, uqc, rt: rate, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    }
    hsnAgg[hsnk].qty += sign * qty;
    hsnAgg[hsnk].txval += txval_i;
    hsnAgg[hsnk].camt += camt_i;
    hsnAgg[hsnk].samt += samt_i;
    hsnAgg[hsnk].iamt += iamt_i;
  });
  
  return { b2csAgg, hsnAgg };
}

const sAgg2 = aggregateSalesRoundPerRow(salesRaw, false);
const rAgg2 = aggregateSalesRoundPerRow(returnsRaw, true);
const merged2 = mergeAggs(sAgg2, rAgg2);
const b2csArr2 = Object.values(merged2.b2csFinal)
  .map(v => ({
    sply_ty: v.sply_ty, rt: v.rt, typ: v.typ, pos: v.pos,
    txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: r2(v.csamt),
  }))
  .filter(v => v.txval !== 0);

const total2 = b2csArr2.reduce((a, b) => ({
  txval: a.txval + b.txval, iamt: a.iamt + b.iamt, camt: a.camt + b.camt, samt: a.samt + b.samt,
}), { txval: 0, iamt: 0, camt: 0, samt: 0 });
console.log(`  Per-row (no per-row rounding) totals: txval=${total2.txval}, igst=${total2.iamt}, cgst=${total2.camt}, sgst=${total2.samt}`);
console.log(`  vs Ref txval:${refTotal.txval} diff:${r2(refTotal.txval - total2.txval)}`);

console.log('\nNow let\'s build full JSON and compare string-level');

function buildOutput(b2csData, hsnData, gstin, fp, etinVal) {
  const b2cs = Object.values(b2csData)
    .map(v => ({
      sply_ty: v.sply_ty,
      rt: Number(v.rt),
      typ: 'OE',
      pos: v.pos,
      txval: r2(v.txval),
      iamt: r2(v.iamt),
      samt: r2(v.samt),
      camt: r2(v.camt),
      csamt: r2(v.csamt),
    }))
    .filter(v => v.txval !== 0);

  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  
  const hsnEntries = Object.values(hsnData)
    .filter(v => Math.round(v.qty) !== 0 || r2(v.txval) !== 0);
  
  const hsn_b2c = hsnEntries.map((v, i) => ({
    num: i + 1,
    hsn_sc: v.hsn_sc,
    uqc: v.uqc,
    qty: Math.round(v.qty),
    rt: Number(v.rt),
    txval: r2(v.txval),
    iamt: r2(v.iamt),
    samt: r2(v.samt),
    camt: r2(v.camt),
    csamt: r2(v.csamt),
  }));

  return {
    gstin,
    fp,
    b2cs,
    supeco: {
      clttx: [{
        etin: etinVal,
        suppval: r2(totalSuppval),
        igst: r2(totalIgst),
        cgst: r2(totalCgst),
        sgst: r2(totalSgst),
        cess: 0,
        flag: 'N',
      }],
    },
    hsn: { hsn_b2c },
  };
}

const ourOutput = buildOutput(merged.b2csFinal, merged.hsnFinal, sellerGstin, '082026', etin);
const ourStr = JSON.stringify(ourOutput);
const refStr = JSON.stringify(ref);

console.log(`\n=== FINAL STRING MATCH TEST ===`);
console.log(`Lengths: our=${ourStr.length}, ref=${refStr.length}`);
console.log(`Exact match: ${ourStr === refStr}`);

if (ourStr !== refStr) {
  console.log('\nDetailed diff on b2cs (side by side with txval diff):');
  const refB2CSMap = {};
  ref.b2cs.forEach(b => { refB2CSMap[b.pos + '_' + b.rt] = b; });
  let anyDiff = false;
  ourOutput.b2cs.forEach(b => {
    const k = b.pos + '_' + b.rt;
    const r = refB2CSMap[k];
    if (!r) { console.log(`  Extra in our: ${k} txval=${b.txval}`); anyDiff = true; }
    else {
      const diffs = [];
      if (b.txval !== r.txval) diffs.push(`txval: ${b.txval} vs ${r.txval} (diff ${r2(r.txval - b.txval)})`);
      if (b.iamt !== r.iamt) diffs.push(`iamt: ${b.iamt} vs ${r.iamt} (diff ${r2(r.iamt - b.iamt)})`);
      if (b.camt !== r.camt) diffs.push(`camt: ${b.camt} vs ${r.camt}`);
      if (b.samt !== r.samt) diffs.push(`samt: ${b.samt} vs ${r.samt}`);
      if (b.sply_ty !== r.sply_ty) diffs.push(`sply_ty: ${b.sply_ty} vs ${r.sply_ty}`);
      if (diffs.length > 0) { anyDiff = true; console.log(`  ${k}: ${diffs.join(' | ')}`); }
    }
  });
  Object.keys(refB2CSMap).forEach(k => {
    if (!ourOutput.b2cs.find(b => b.pos + '_' + b.rt === k)) {
      console.log(`  Missing in our: ${k} txval=${refB2CSMap[k].txval}`); anyDiff = true;
    }
  });
  if (!anyDiff) console.log('  All b2cs match!');

  console.log('\nHSN diff:');
  const refHSNMap2 = {};
  ref.hsn.hsn_b2c.forEach(h => { refHSNMap2[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let hsnDiff = false;
  ourOutput.hsn.hsn_b2c.forEach(h => {
    const k = h.hsn_sc + '_' + h.uqc + '_' + h.rt;
    const r = refHSNMap2[k];
    if (!r) { console.log(`  Extra in our: ${k}`); hsnDiff = true; }
    else {
      const diffs = [];
      if (h.qty !== r.qty) diffs.push(`qty: ${h.qty} vs ${r.qty}`);
      if (h.txval !== r.txval) diffs.push(`txval: ${h.txval} vs ${r.txval} (diff ${r2(r.txval - h.txval)})`);
      if (h.iamt !== r.iamt) diffs.push(`iamt: ${h.iamt} vs ${r.iamt}`);
      if (h.uqc !== r.uqc) diffs.push(`uqc: ${h.uqc} vs ${r.uqc}`);
      if (diffs.length > 0) { hsnDiff = true; console.log(`  ${k}: ${diffs.join(' | ')}`); }
    }
  });
  if (!hsnDiff) console.log('  All HSN match!');

  console.log('\nsupeco diff:');
  if (ourOutput.supeco.clttx[0].suppval !== ref.supeco.clttx[0].suppval) console.log(`  suppval: ${ourOutput.supeco.clttx[0].suppval} vs ${ref.supeco.clttx[0].suppval}`);
  if (ourOutput.supeco.clttx[0].igst !== ref.supeco.clttx[0].igst) console.log(`  igst: ${ourOutput.supeco.clttx[0].igst} vs ${ref.supeco.clttx[0].igst}`);
  if (ourOutput.supeco.clttx[0].cgst !== ref.supeco.clttx[0].cgst) console.log(`  cgst: ${ourOutput.supeco.clttx[0].cgst} vs ${ref.supeco.clttx[0].cgst}`);
  if (ourOutput.supeco.clttx[0].sgst !== ref.supeco.clttx[0].sgst) console.log(`  sgst: ${ourOutput.supeco.clttx[0].sgst} vs ${ref.supeco.clttx[0].sgst}`);
  if (ourOutput.supeco.clttx[0].etin !== ref.supeco.clttx[0].etin) console.log(`  etin: ${ourOutput.supeco.clttx[0].etin} vs ${ref.supeco.clttx[0].etin}`);
  if (ourOutput.gstin !== ref.gstin) console.log(`  gstin: ${ourOutput.gstin} vs ${ref.gstin}`);
  if (ourOutput.fp !== ref.fp) console.log(`  fp: ${ourOutput.fp} vs ${ref.fp}`);
}
