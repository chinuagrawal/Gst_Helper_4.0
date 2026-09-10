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
function c2(v) { return Math.ceil(v * 100) / 100; }
function f2(v) { return Math.floor(v * 100) / 100; }
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

console.log('\n=== Compute txval correctly first, then try different GST rounding strategies on aggregate ===\n');

function computeBaseAggregates() {
  const b2csAgg = {};
  const hsnAgg = {};
  function proc(r, sign) {
    const pos = getPOS(r.end_customer_state_new);
    const rt = toNum(r.gst_rate);
    const tsv = sign * r2(toNum(r.total_taxable_sale_value));
    const qty = sign * toNum(r.quantity);
    const { hsn_sc, uqc } = mapHSN(r.hsn_code);
    const isIntra = pos === '27';
    const bk = `${pos}|${rt}`;
    if (!b2csAgg[bk]) b2csAgg[bk] = { sply_ty: isIntra ? 'INTRA' : 'INTER', rt, typ: 'OE', pos, txval: 0 };
    b2csAgg[bk].txval += tsv;
    const hk = `${hsn_sc}|${uqc}|${rt}|${pos}`;
    if (!hsnAgg[hk]) hsnAgg[hk] = { hsn_sc, uqc, rt, qty: 0, txval: 0 };
    hsnAgg[hk].qty += qty;
    hsnAgg[hk].txval += tsv;
  }
  salesRaw.forEach(r => proc(r, 1));
  returnsRaw.forEach(r => proc(r, -1));
  return { b2csAgg, hsnAgg };
}

const base = computeBaseAggregates();

const gstStrategies = [
  ['r2 on total*rate', (tx, rt, intra) => {
    const txv = r2(tx);
    const g = txv * rt / 100;
    return intra ? [0, r2(g / 2), r2(g / 2)] : [r2(g), 0, 0];
  }],
  ['r2 on total*rate; intra split: one r2(g/2) one r2(g-r2(g/2))', (tx, rt, intra) => {
    const txv = r2(tx);
    const g = txv * rt / 100;
    if (intra) {
      const half = r2(g / 2);
      return [0, half, r2(g - half)];
    }
    return [r2(g), 0, 0];
  }],
  ['ceil', (tx, rt, intra) => {
    const txv = r2(tx);
    const g = txv * rt / 100;
    return intra ? [0, c2(g / 2), c2(g / 2)] : [c2(g), 0, 0];
  }],
  ['floor', (tx, rt, intra) => {
    const txv = r2(tx);
    const g = txv * rt / 100;
    return intra ? [0, f2(g / 2), f2(g / 2)] : [f2(g), 0, 0];
  }],
  ['r2 total*rate; intra camt=r2(g*0.09/rt*100?) nope', (tx, rt, intra) => {
    const txv = r2(tx);
    if (intra) {
      const c = r2(txv * rt / 200);
      const s = r2(txv * rt / 200);
      return [0, c, s];
    }
    return [r2(txv * rt / 100), 0, 0];
  }],
  ['r2 each row tax_amount, then sum for inter; for intra: r2 each row tax then r2(tax/2) per row and sum', () => { return null; }],
];

function buildWithGstStrategy(gstFnIdx) {
  const gstFn = gstStrategies[gstFnIdx][1];
  const b2cs = Object.values(base.b2csAgg).map(v => {
    const intra = v.pos === '27';
    let [iamt, camt, samt] = gstFn(v.txval, v.rt, intra);
    if (iamt === null) return null;
    return {
      sply_ty: intra ? 'INTRA' : 'INTER', rt: Number(v.rt), typ: 'OE', pos: v.pos,
      txval: r2(v.txval), iamt, camt, samt, csamt: 0,
    };
  }).filter(v => v && v.txval !== 0);
  
  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach(b => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.camt; totalSgst += b.samt; });
  
  const hsnMain = {};
  Object.values(base.hsnAgg).forEach(v => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnMain[k]) hsnMain[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, _iamtAcc: 0, _camtAcc: 0, _samtAcc: 0, _posTxvals: {} };
    hsnMain[k].qty += v.qty;
    hsnMain[k].txval += v.txval;
    const pos = v.hsn_sc && null;
  });
  
  // We need GST allocation per HSN per POS too. So process HSN with pos again.
  const hsnWithPos = {};
  Object.values(base.hsnAgg).forEach(v => {
    // hsnAgg keys have |pos in them. We need to know pos for intra/inter.
    // So re-extract pos from the original key by reverse lookup:
    const origKey = Object.keys(base.hsnAgg).find(k => base.hsnAgg[k] === v);
    const pos = origKey.split('|')[3];
    const isIntra = pos === '27';
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnWithPos[k]) hsnWithPos[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
    hsnWithPos[k].qty += v.qty;
    hsnWithPos[k].txval += v.txval;
    const [iamt, camt, samt] = gstFn(v.txval, v.rt, isIntra);
    if (iamt !== null) {
      hsnWithPos[k].iamt += iamt;
      hsnWithPos[k].camt += camt;
      hsnWithPos[k].samt += samt;
    }
  });
  
  const hsn_b2c = Object.values(hsnWithPos)
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

gstStrategies.forEach(([name], idx) => {
  if (idx === 5) return;
  const out = buildWithGstStrategy(idx);
  const bmap = {}; ref.b2cs.forEach(b => { bmap[b.pos + '_' + b.rt] = b; });
  let bexact = 0, bdiffs = [];
  out.b2cs.forEach(b => {
    const r = bmap[b.pos + '_' + b.rt];
    if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) bexact++;
    else if (r) bdiffs.push(`${b.pos}_${b.rt}: our(i=${b.iamt},c=${b.camt},s=${b.samt}) ref(i=${r.iamt},c=${r.camt},s=${r.samt})`);
  });
  const hmap = {}; ref.hsn.hsn_b2c.forEach(h => { hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let hexact = 0;
  out.hsn.hsn_b2c.forEach(h => {
    const r = hmap[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
    if (r && h.txval === r.txval && h.iamt === r.iamt && h.camt === r.camt && h.samt === r.samt && h.qty === r.qty) hexact++;
  });
  const full = JSON.stringify(out) === JSON.stringify(ref);
  console.log(`[${idx}] ${name.substring(0, 70)}: B=${bexact}/${ref.b2cs.length} H=${hexact}/${ref.hsn.hsn_b2c.length} FULL=${full}`);
  if (bexact > 25) { console.log('   Diffs:', bdiffs.slice(0, 5)); }
});

console.log('\n=== Strategy 6: Per-row tax with r2, then sum net (sale+return), then round ===\n');
function buildStrategy6() {
  function aggRows(rows, sign) {
    const b2cs = {}, hsn = {};
    rows.forEach(r => {
      const pos = getPOS(r.end_customer_state_new);
      const rt = toNum(r.gst_rate);
      const tsv = sign * r2(toNum(r.total_taxable_sale_value));
      const qty = sign * toNum(r.quantity);
      const taxRaw = r2(toNum(r.total_taxable_sale_value)) * rt / 100;
      const tax = sign * r2(taxRaw);
      const isIntra = pos === '27';
      const { hsn_sc, uqc } = mapHSN(r.hsn_code);
      const iamt = isIntra ? 0 : tax;
      const camt = isIntra ? tax / 2 : 0;
      const samt = isIntra ? tax / 2 : 0;
      const bk = `${pos}|${rt}`;
      if (!b2cs[bk]) b2cs[bk] = { sply_ty: isIntra ? 'INTRA' : 'INTER', rt, typ: 'OE', pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
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
  const s = aggRows(salesRaw, 1), rs = aggRows(returnsRaw, -1);
  const b2csFinal = {};
  [s.b2cs, rs.b2cs].forEach(src => {
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
  [s.hsn, rs.hsn].forEach(src => {
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
const out6 = buildStrategy6();
const bmap6 = {}; ref.b2cs.forEach(b => { bmap6[b.pos + '_' + b.rt] = b; });
let be6 = 0;
out6.b2cs.forEach(b => {
  const r = bmap6[b.pos + '_' + b.rt];
  if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) be6++;
  else if (r) console.log(`  S6 B diff ${b.pos}_${b.rt}: our(i=${b.iamt},c=${b.camt},s=${b.samt}) ref(i=${r.iamt},c=${r.camt},s=${r.samt})`);
});
console.log(`S6 result: B=${be6}/${ref.b2cs.length}`);
console.log(`S6 supeco: supp=${out6.supeco.clttx[0].suppval} igst=${out6.supeco.clttx[0].igst} cgst=${out6.supeco.clttx[0].cgst} sgst=${out6.supeco.clttx[0].sgst}`);
console.log(`ref supeco: supp=${ref.supeco.clttx[0].suppval} igst=${ref.supeco.clttx[0].igst} cgst=${ref.supeco.clttx[0].cgst} sgst=${ref.supeco.clttx[0].sgst}`);
console.log(`S6 exact full match: ${JSON.stringify(out6) === JSON.stringify(ref)}`);
