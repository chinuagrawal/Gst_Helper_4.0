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

function buildOutput(opts) {
  const { roundTsvPerRow, useTaxAmountFromExcel, roundTaxPerRow, sumGstThenRound } = opts;
  const b2csAgg = {};
  const hsnAgg = {};

  function processRow(item, sign) {
    const pos = getPOS(item.end_customer_state_new);
    const rate = toNum(item.gst_rate);
    let tsv = toNum(item.total_taxable_sale_value);
    if (roundTsvPerRow) tsv = r2(tsv);
    const txval = sign * tsv;
    
    let taxTotal = toNum(item.tax_amount);
    let iamt, camt, samt;
    const isIntra = pos === '27';
    
    if (useTaxAmountFromExcel) {
      if (roundTaxPerRow) taxTotal = r2(taxTotal);
      const signTax = sign * taxTotal;
      if (isIntra) { iamt = 0; camt = signTax / 2; samt = signTax / 2; }
      else { iamt = signTax; camt = 0; samt = 0; }
    } else {
      const g = txval * rate / 100;
      if (isIntra) { iamt = 0; camt = g / 2; samt = g / 2; }
      else { iamt = g; camt = 0; samt = 0; }
    }
    
    const qty = toNum(item.quantity);
    const hsnRaw = item.hsn_code;
    const { hsn_sc, uqc } = mapHSN(hsnRaw);
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
  
  salesRaw.forEach(i => processRow(i, 1));
  returnsRaw.forEach(i => processRow(i, -1));
  
  const b2cs = Object.values(b2csAgg)
    .map(v => {
      let txval = v.txval, iamt = v.iamt, camt = v.camt, samt = v.samt;
      if (sumGstThenRound) { txval = r2(txval); iamt = r2(iamt); camt = r2(camt); samt = r2(samt); }
      else {
        const rt = v.rt;
        const sply = v.sply_ty;
        const isIntra = sply === 'INTRA';
        const gst = r2(txval) * rt / 100;
        txval = r2(txval);
        if (isIntra) { iamt = 0; camt = r2(gst / 2); samt = r2(gst / 2); }
        else { iamt = r2(gst); camt = 0; samt = 0; }
      }
      return { sply_ty: v.sply_ty, rt: Number(v.rt), typ: 'OE', pos: v.pos, txval, iamt, samt, camt, csamt: 0 };
    })
    .filter(v => v.txval !== 0);
  
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
      num: i + 1,
      hsn_sc: v.hsn_sc, uqc: v.uqc, qty: Math.round(v.qty), rt: Number(v.rt),
      txval: r2(v.txval), iamt: r2(v.iamt), samt: r2(v.samt), camt: r2(v.camt), csamt: 0,
    }));

  return {
    gstin: sellerGstin, fp: '082026', b2cs,
    supeco: { clttx: [{ etin, suppval: r2(totalSuppval), igst: r2(totalIgst), cgst: r2(totalCgst), sgst: r2(totalSgst), cess: 0, flag: 'N' }] },
    hsn: { hsn_b2c },
  };
}

function evalMatch(label, out) {
  const refMap = {};
  ref.b2cs.forEach(b => { refMap[b.pos + '_' + b.rt] = b; });
  let exact = 0;
  out.b2cs.forEach(b => {
    const r = refMap[b.pos + '_' + b.rt];
    if (r && b.txval === r.txval && b.iamt === r.iamt && b.camt === r.camt && b.samt === r.samt) exact++;
  });
  const hsnRef = {};
  ref.hsn.hsn_b2c.forEach(h => { hsnRef[h.hsn_sc + '_' + h.uqc + '_' + h.rt] = h; });
  let hsnExact = 0;
  out.hsn.hsn_b2c.forEach(h => {
    const r = hsnRef[h.hsn_sc + '_' + h.uqc + '_' + h.rt];
    if (r && h.txval === r.txval && h.iamt === r.iamt && h.camt === r.camt && h.samt === r.samt && h.qty === r.qty) hsnExact++;
  });
  const supecoMatch =
    out.supeco.clttx[0].suppval === ref.supeco.clttx[0].suppval &&
    out.supeco.clttx[0].igst === ref.supeco.clttx[0].igst &&
    out.supeco.clttx[0].cgst === ref.supeco.clttx[0].cgst &&
    out.supeco.clttx[0].sgst === ref.supeco.clttx[0].sgst;
  const exactFull = JSON.stringify(out) === JSON.stringify(ref);
  console.log(`${label}: B2CS ${exact}/${ref.b2cs.length} | HSN ${hsnExact}/${ref.hsn.hsn_b2c.length} | supeco=${supecoMatch} | FULL=${exactFull}`);
  if (exactFull) console.log(JSON.stringify(out).substring(0, 200) + '...');
  return exactFull;
}

console.log('Strategy sweep:\n');
evalMatch('rTsv=Y,useTax=Y,rTax=Y,sumRound=Y', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 1, roundTaxPerRow: 1, sumGstThenRound: 1 }));
evalMatch('rTsv=Y,useTax=Y,rTax=N,sumRound=Y', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 1, roundTaxPerRow: 0, sumGstThenRound: 1 }));
evalMatch('rTsv=N,useTax=Y,rTax=Y,sumRound=Y', buildOutput({ roundTsvPerRow: 0, useTaxAmountFromExcel: 1, roundTaxPerRow: 1, sumGstThenRound: 1 }));
evalMatch('rTsv=N,useTax=Y,rTax=N,sumRound=Y', buildOutput({ roundTsvPerRow: 0, useTaxAmountFromExcel: 1, roundTaxPerRow: 0, sumGstThenRound: 1 }));
evalMatch('rTsv=Y,useTax=Y,rTax=Y,sumRound=N', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 1, roundTaxPerRow: 1, sumGstThenRound: 0 }));
evalMatch('rTsv=Y,useTax=Y,rTax=N,sumRound=N', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 1, roundTaxPerRow: 0, sumGstThenRound: 0 }));
evalMatch('rTsv=Y,useTax=N,rTax=-,sumRound=Y', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 0, roundTaxPerRow: 0, sumGstThenRound: 1 }));
evalMatch('rTsv=Y,useTax=N,rTax=-,sumRound=N', buildOutput({ roundTsvPerRow: 1, useTaxAmountFromExcel: 0, roundTaxPerRow: 0, sumGstThenRound: 0 }));
