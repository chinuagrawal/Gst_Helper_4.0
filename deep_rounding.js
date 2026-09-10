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

console.log('\n=== Find exact rounding: per-row tsv rounded, per-row gst rounded, then sum ===\n');

function buildOutputPerRowRounded(roundTsv, roundGst, useTaxAmtColumn) {
  const b2csAgg = {};
  const hsnAgg = {};
  function process(item, sign) {
    const pos = getPOS(item.end_customer_state_new);
    const rate = toNum(item.gst_rate);
    let tsv = toNum(item.total_taxable_sale_value);
    if (roundTsv) tsv = r2(tsv);
    const txval = sign * tsv;
    const qty = toNum(item.quantity);
    const { hsn_sc, uqc } = mapHSN(item.hsn_code);
    const isIntra = pos === '27';
    
    let iamt, camt, samt;
    if (useTaxAmtColumn) {
      let t = toNum(item.tax_amount);
      if (roundGst) t = r2(t);
      const st = sign * t;
      if (isIntra) { iamt = 0; camt = st / 2; samt = st / 2; if (roundGst) { camt = r2(camt); samt = r2(samt); } }
      else { iamt = st; camt = 0; samt = 0; }
    } else {
      const gstBase = (roundGst ? r2(txval) : txval) * rate / 100;
      const gstRounded = roundGst ? r2(gstBase) : gstBase;
      if (isIntra) {
        iamt = 0;
        camt = roundGst ? r2(gstRounded / 2) : gstRounded / 2;
        samt = roundGst ? r2(gstRounded / 2) : gstRounded / 2;
      } else {
        iamt = gstRounded; camt = 0; samt = 0;
      }
    }
    
    const sply_ty = isIntra ? 'INTRA' : 'INTER';
    const bk = `${pos}|${rate}`;
    if (!b2csAgg[bk]) b2csAgg[bk] = { sply_ty, rt: rate, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    b2csAgg[bk].txval += txval;
    b2csAgg[bk].iamt += iamt;
    b2csAgg[bk].camt += camt;
    b2csAgg[bk].samt += samt;
    
    const hk = `${hsn_sc}|${uqc}|${rate}|${pos}`;
    if (!hsnAgg[hk]) hsnAgg[hk] = { hsn_sc, uqc, rt: rate, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnAgg[hk].qty += sign * qty;
    hsnAgg[hk].txval += txval;
    hsnAgg[hk].iamt += iamt;
    hsnAgg[hk].camt += camt;
    hsnAgg[hk].samt += samt;
  }
  salesRaw.forEach(i => process(i, 1));
  returnsRaw.forEach(i => process(i, -1));
  
  const b2cs = Object.values(b2csAgg).map(v => ({
    sply_ty: v.sply_ty, rt: Number(v.rt), typ: 'OE', pos: v.pos,
    txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
  })).filter(v => v.txval !== 0);
  
  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  
  const hsnByMain = {};
  Object.values(hsnAgg).forEach(v => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnByMain[k]) hsnByMain[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnByMain[k].qty += v.qty;
    hsnByMain[k].txval += v.txval;
    hsnByMain[k].iamt += v.iamt;
    hsnByMain[k].camt += v.camt;
    hsnByMain[k].samt += v.samt;
  });
  
  const hsn_b2c = Object.values(hsnByMain)
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

function score(name, out) {
  const bm = {}; ref.b2cs.forEach(b => { bm[b.pos + '_' + b.rt] = b; });
  let be = 0, bd = 0;
  out.b2cs.forEach(b => {
    const r = bm[b.pos + '_' + b.rt];
    if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) be++;
    else { bd++; if (bd <= 5) console.log(`  B diff ${b.pos}_${b.rt}: our(${b.txval},${b.iamt},${b.camt},${b.samt}) ref(${r?.txval},${r?.iamt},${r?.camt},${r?.samt})`); }
  });
  const hm = {}; ref.hsn.hsn_b2c.forEach(h => { hm[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let he = 0, hd = 0;
  out.hsn.hsn_b2c.forEach(h => {
    const r = hm[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
    if (r && h.txval === r.txval && h.iamt === r.iamt && h.camt === r.camt && h.samt === r.samt && h.qty === r.qty) he++;
    else { hd++; if (hd <= 3) console.log(`  H diff ${h.hsn_sc}-${h.uqc}-${h.rt}: our(q=${h.qty},t=${h.txval},i=${h.iamt}) ref(q=${r?.qty},t=${r?.txval},i=${r?.iamt})`); }
  });
  const sm = out.supeco.clttx[0].suppval === ref.supeco.clttx[0].suppval &&
    out.supeco.clttx[0].igst === ref.supeco.clttx[0].igst &&
    out.supeco.clttx[0].cgst === ref.supeco.clttx[0].cgst &&
    out.supeco.clttx[0].sgst === ref.supeco.clttx[0].sgst;
  const full = JSON.stringify(out) === JSON.stringify(ref);
  console.log(`${name}: B=${be}/${ref.b2cs.length} H=${he}/${ref.hsn.hsn_b2c.length} S=${sm} F=${full}`);
  return full;
}

console.log('--- sweep ---');
score('[rTsv,rGst,calc]  ', buildOutputPerRowRounded(1, 1, 0));
score('[rTsv,rGst,taxAmt] ', buildOutputPerRowRounded(1, 1, 1));
score('[rTsv,noGst,calc]  ', buildOutputPerRowRounded(1, 0, 0));
score('[rTsv,noGst,taxAmt]', buildOutputPerRowRounded(1, 0, 1));
score('[noTsv,rGst,calc]  ', buildOutputPerRowRounded(0, 1, 0));
score('[noTsv,rGst,taxAmt] ', buildOutputPerRowRounded(0, 1, 1));
score('[noTsv,noGst,calc]  ', buildOutputPerRowRounded(0, 0, 0));
score('[noTsv,noGst,taxAmt]', buildOutputPerRowRounded(0, 0, 1));

console.log('\n--- Deep dive: compare tax_amount column vs tsv*rate/100 per row ---');
let matchCount = 0, deltaSum = 0;
const mismatches = [];
[...salesRaw.slice(0, 100), ...returnsRaw.slice(0, 20)].forEach((r, idx) => {
  const tsv = toNum(r.total_taxable_sale_value);
  const rate = toNum(r.gst_rate);
  const calcTax = tsv * rate / 100;
  const colTax = toNum(r.tax_amount);
  const d = Math.abs(calcTax - colTax);
  deltaSum += d;
  if (d > 0.0001) mismatches.push({ idx, tsv, rate, calcTax, colTax, d });
  else matchCount++;
});
console.log(`Out of 120 rows sampled: exact tax matches=${matchCount}, mismatches=${mismatches.length}, deltaSum=${deltaSum.toFixed(6)}`);
if (mismatches.length > 0) console.log('Mismatches (first 5):', mismatches.slice(0, 5));

console.log('\n--- KEY INSIGHT: tax_amount column in Excel already uses rounded tsv? ---');
let tsvRoundedMatches = 0;
[...salesRaw, ...returnsRaw].forEach(r => {
  const tsvRaw = toNum(r.total_taxable_sale_value);
  const tsvR2 = r2(tsvRaw);
  const rate = toNum(r.gst_rate);
  const colTax = toNum(r.tax_amount);
  const calcFromR2 = tsvR2 * rate / 100;
  if (Math.abs(calcFromR2 - colTax) < 0.001) tsvRoundedMatches++;
});
console.log(`Rows where tax_amount = r2(tsv)*rate/100: ${tsvRoundedMatches} / ${salesRaw.length + returnsRaw.length}`);

console.log('\n--- KEY INSIGHT 2: Maybe return rows are SUBTRACTED FROM SALE ROWS BY SUBORDER first? Per-suborder netting then rounded then aggregated? ---');
const suborderMap = {};
salesRaw.forEach(r => {
  const so = r.sub_order_num;
  if (!suborderMap[so]) suborderMap[so] = { sales: [], returns: [] };
  suborderMap[so].sales.push(r);
});
returnsRaw.forEach(r => {
  const so = r.sub_order_num;
  if (!suborderMap[so]) suborderMap[so] = { sales: [], returns: [] };
  suborderMap[so].returns.push(r);
});

function buildPerSuborderNet(roundAfterNet) {
  const b2csAgg = {};
  const hsnAgg = {};
  Object.values(suborderMap).forEach(({ sales, returns }) => {
    sales.forEach(s => {
      const pos = getPOS(s.end_customer_state_new);
      const rate = toNum(s.gst_rate);
      const matchedReturn = returns.find(r => r.hsn_code === s.hsn_code);
      const returnSign = matchedReturn ? -1 : 0;
      let tsv = toNum(s.total_taxable_sale_value) + (matchedReturn ? toNum(matchedReturn.total_taxable_sale_value) * returnSign * 0 : 0);
      if (roundAfterNet === 'r2_before') tsv = r2(tsv);
      const qty = toNum(s.quantity) + (matchedReturn ? -toNum(matchedReturn.quantity) : 0);
      returns.splice(returns.indexOf(matchedReturn), 1);
    });
  });
  return null;
}
buildPerSuborderNet();

console.log('\n--- Simpler: combine sales and returns into one array, sort, then process one-by-one with sign and per-row rounding ---');
function buildCombined(rTsv, rGstPerRow) {
  const b2csAgg = {};
  const hsnAgg = {};
  const all = [];
  salesRaw.forEach(r => all.push({ ...r, _sign: 1 }));
  returnsRaw.forEach(r => all.push({ ...r, _sign: -1 }));
  all.forEach(item => {
    const pos = getPOS(item.end_customer_state_new);
    const rate = toNum(item.gst_rate);
    let tsv = toNum(item.total_taxable_sale_value);
    if (rTsv) tsv = r2(tsv);
    const txval = item._sign * tsv;
    const qty = toNum(item.quantity);
    const { hsn_sc, uqc } = mapHSN(item.hsn_code);
    const isIntra = pos === '27';
    let iamt, camt, samt;
    let gst = txval * rate / 100;
    if (rGstPerRow) {
      gst = r2(gst);
      if (isIntra) { iamt = 0; camt = r2(gst / 2); samt = r2(gst / 2); }
      else { iamt = gst; camt = 0; samt = 0; }
    } else {
      if (isIntra) { iamt = 0; camt = gst / 2; samt = gst / 2; }
      else { iamt = gst; camt = 0; samt = 0; }
    }
    const sply_ty = isIntra ? 'INTRA' : 'INTER';
    const bk = `${pos}|${rate}`;
    if (!b2csAgg[bk]) b2csAgg[bk] = { sply_ty, rt: rate, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    b2csAgg[bk].txval += txval;
    b2csAgg[bk].iamt += iamt;
    b2csAgg[bk].camt += camt;
    b2csAgg[bk].samt += samt;
    const hk = `${hsn_sc}|${uqc}|${rate}|${pos}`;
    if (!hsnAgg[hk]) hsnAgg[hk] = { hsn_sc, uqc, rt: rate, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnAgg[hk].qty += item._sign * qty;
    hsnAgg[hk].txval += txval;
    hsnAgg[hk].iamt += iamt;
    hsnAgg[hk].camt += camt;
    hsnAgg[hk].samt += samt;
  });
  
  const b2cs = Object.values(b2csAgg).map(v => ({
    sply_ty: v.sply_ty, rt: Number(v.rt), typ: 'OE', pos: v.pos,
    txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
  })).filter(v => v.txval !== 0);
  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  const hsnByMain = {};
  Object.values(hsnAgg).forEach(v => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnByMain[k]) hsnByMain[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnByMain[k].qty += v.qty; hsnByMain[k].txval += v.txval;
    hsnByMain[k].iamt += v.iamt; hsnByMain[k].camt += v.camt; hsnByMain[k].samt += v.samt;
  });
  const hsn_b2c = Object.values(hsnByMain)
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

score('[combi rTsv rGst]', buildCombined(1, 1));
score('[combi rTsv noGst]', buildCombined(1, 0));
score('[combi noTsv rGst]', buildCombined(0, 1));
score('[combi noTsv noGst]', buildCombined(0, 0));
