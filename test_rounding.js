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

const sellerGstin = salesRaw[0]?.gstin || '27AAFPQ5593F1ZC';
const sellerStateCode = sellerGstin.slice(0, 2);
const ecoTcsGstin = salesRaw[0]?.eco_tcs_gstin;
const etin = transformETIN(ecoTcsGstin, sellerStateCode);

function aggregateRows(rows, sign, roundPerRow) {
  const b2csAgg = {};
  const hsnAgg = {};
  
  rows.forEach(item => {
    const state = item.end_customer_state_new;
    const pos = getPOS(state);
    const rate = toNum(item.gst_rate);
    const tsvRaw = toNum(item.total_taxable_sale_value);
    const tsv = roundPerRow ? r2(tsvRaw) : tsvRaw;
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

    const hsnk = `${hsn_sc}|${uqc}|${rate}|${pos}`;
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

function buildFinal(sign, roundPerRow, roundEachGst) {
  const sAgg = aggregateRows(salesRaw, 1, roundPerRow);
  const rAgg = aggregateRows(returnsRaw, sign, roundPerRow);
  
  const b2csFinal = {};
  [sAgg.b2csAgg, rAgg.b2csAgg].forEach(src => {
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
  
  const hsnByKey = {};
  [sAgg.hsnAgg, rAgg.hsnAgg].forEach(src => {
    Object.entries(src).forEach(([k, v]) => {
      const parts = k.split('|');
      const hsnKey = `${parts[0]}|${parts[1]}|${parts[2]}`;
      if (!hsnByKey[hsnKey]) hsnByKey[hsnKey] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
      hsnByKey[hsnKey].qty += v.qty;
      hsnByKey[hsnKey].txval += v.txval;
      hsnByKey[hsnKey].iamt += v.iamt;
      hsnByKey[hsnKey].camt += v.camt;
      hsnByKey[hsnKey].samt += v.samt;
    });
  });
  
  const b2cs = Object.values(b2csFinal)
    .map(v => {
      const txval = roundEachGst ? r2(v.txval) : v.txval;
      const rt = v.rt;
      const sply_ty = v.sply_ty;
      const isIntra = sply_ty === 'INTRA';
      let iamt, camt, samt;
      if (roundEachGst) {
        const gst = txval * rt / 100;
        iamt = isIntra ? 0 : r2(gst);
        camt = isIntra ? r2(gst / 2) : 0;
        samt = isIntra ? r2(gst / 2) : 0;
      } else {
        iamt = r2(v.iamt);
        camt = r2(v.camt);
        samt = r2(v.samt);
      }
      return {
        sply_ty,
        rt: Number(rt),
        typ: 'OE',
        pos: v.pos,
        txval: r2(txval),
        iamt, samt, camt, csamt: 0,
      };
    })
    .filter(v => v.txval !== 0);

  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  
  const hsn_b2c = Object.values(hsnByKey)
    .filter(v => Math.round(v.qty) !== 0 || r2(v.txval) !== 0)
    .map((v, i) => ({
      num: i + 1,
      hsn_sc: v.hsn_sc,
      uqc: v.uqc,
      qty: Math.round(v.qty),
      rt: Number(v.rt),
      txval: r2(v.txval),
      iamt: r2(v.iamt),
      samt: r2(v.samt),
      camt: r2(v.camt),
      csamt: 0,
    }));

  return {
    gstin: sellerGstin,
    fp: '082026',
    b2cs,
    supeco: { clttx: [{ etin, suppval: r2(totalSuppval), igst: r2(totalIgst), cgst: r2(totalCgst), sgst: r2(totalSgst), cess: 0, flag: 'N' }] },
    hsn: { hsn_b2c },
  };
}

function scoreMatch(label, out) {
  const refTotalTx = ref.b2cs.reduce((a, b) => a + b.txval, 0);
  const ourTotalTx = out.b2cs.reduce((a, b) => a + b.txval, 0);
  const diffTx = Math.abs(refTotalTx - ourTotalTx);
  
  const refMap = {};
  ref.b2cs.forEach(b => { refMap[b.pos + '_' + b.rt] = b; });
  let exactB2c = 0;
  out.b2cs.forEach(b => {
    const r = refMap[b.pos + '_' + b.rt];
    if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) exactB2c++;
  });
  
  return { label, diffTx, exactB2c, totalB2c: ref.b2cs.length };
}

console.log('=== Testing rounding strategies ===\n');
const strategies = [
  ['A: return sign=-1, no per-row round, recalc gst from txval', -1, false, true],
  ['B: return sign=-1, round per row, recalc gst from txval', -1, true, true],
  ['C: return sign=-1, no per-row round, use pre-aggregated gst', -1, false, false],
  ['D: return sign=-1, round per row, use pre-aggregated gst', -1, true, false],
];

strategies.forEach(([label, sign, rpr, regst]) => {
  const out = buildFinal(sign, rpr, regst);
  const { diffTx, exactB2c, totalB2c } = scoreMatch(label, out);
  console.log(`${label}: diffTx=${diffTx.toFixed(4)}, exactB2c=${exactB2c}/${totalB2c}`);
  if (exactB2c === totalB2c) {
    console.log('  B2CS ALL MATCH! Checking HSN...');
    const refHSNMap = {};
    ref.hsn.hsn_b2c.forEach(h => { refHSNMap[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
    let exactHSN = 0;
    out.hsn.hsn_b2c.forEach(h => {
      const r = refHSNMap[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
      if (r && h.txval === r.txval && h.iamt === r.iamt && h.camt === r.camt && h.samt === r.samt && h.qty === r.qty) exactHSN++;
    });
    console.log(`  exactHSN=${exactHSN}/${ref.hsn.hsn_b2c.length}`);
    const outStr = JSON.stringify(out);
    const refStr = JSON.stringify(ref);
    console.log(`  Full exact match: ${outStr === refStr}`);
  }
});

console.log('\n=== Strategy B detail (round per row, sign -1, recalc gst) ===');
const outB = buildFinal(-1, true, true);
const refB2CSMap = {};
ref.b2cs.forEach(b => { refB2CSMap[b.pos + '_' + b.rt] = b; });
outB.b2cs.forEach(b => {
  const r = refB2CSMap[b.pos + '_' + b.rt];
  if (!r || b.txval !== r.txval || b.iamt !== r.iamt || b.camt !== r.camt || b.samt !== r.samt) {
    console.log(`  ${b.pos}_${b.rt}: our tx=${b.txval} i=${b.iamt} c=${b.camt} s=${b.samt} | ref tx=${r?.txval} i=${r?.iamt} c=${r?.camt} s=${r?.samt}`);
  }
});
