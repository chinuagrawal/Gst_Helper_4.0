const XLSX = require('xlsx');
const path = require('path');
const { POS_TO_STATE, HSN_UQC_MAP } = require('./gst-helper/src/utils/constants.js');

// ---- copy of constants.js helpers ----
function getPOS(stateName) { return POS_TO_STATE[stateName] || ""; }
function toNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
function mapHSN_UQC(raw) {
  const key = String(raw || "").trim();
  if (HSN_UQC_MAP[key]) return HSN_UQC_MAP[key];
  const short = key.length > 4 ? key.slice(0, 4) : key;
  if (HSN_UQC_MAP[short]) return HSN_UQC_MAP[short];
  return { hsn_sc: key, uqc: "PCS" };
}
function transformETIN(ecoSellerGstin, sellerStateCode) {
  if (!ecoSellerGstin) return "";
  const s = String(ecoSellerGstin).trim();
  if (s.length < 15) return s;
  return (sellerStateCode || "27") + s.slice(2);
}
function buildFP(month, year) {
  const m = String(Number(month)).padStart(2, "0");
  const y = String(year);
  return m + y;
}

// ---- copy of calculator.js functions (parseDateMonthYear/buildDocRange/buildDocIssue/generateOutput) ----
function parseDateMonthYear(d) {
  if (!d) return null;
  const s = String(d);
  const iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return { y: parseInt(iso[1]), m: parseInt(iso[2]) };
  const slash = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (slash) {
    const a = slash.map(Number);
    if (a[3] > 31) return { y: a[3], m: a[2], d: a[1] };
    if (a[1] <= 12) return { y: a[3], m: a[1] };
    return { y: a[3], m: a[2] };
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return { y: dt.getFullYear(), m: dt.getMonth() + 1 };
  return null;
}

function buildDocRange(rows, docNum, docTyp, rawPrefix, suffixParser, monthNum, yearNum) {
  const filtered = rows.filter((r) => {
    const my = parseDateMonthYear(r["Order Date"]);
    return my && my.m === monthNum && my.y === yearNum;
  });
  const parsed = filtered
    .map((r) => {
      const inv = String(r["Invoice No."] || "");
      return suffixParser(inv);
    })
    .filter((x) => x && typeof x.num === "number" && !isNaN(x.num));
  if (parsed.length === 0) {
    return {
      doc_num: docNum,
      doc_typ: docTyp,
      docs: [{ num: 1, from: rawPrefix, to: rawPrefix, totnum: 0, cancel: 0, net_issue: 0 }],
    };
  }
  const used = new Set(parsed.map((p) => p.num));
  const fromN = Math.min(...used);
  const toN = Math.max(...used);
  const totnum = toN - fromN + 1;
  let cancel = 0;
  for (let n = fromN; n <= toN; n++) if (!used.has(n)) cancel++;
  const net_issue = totnum - cancel;
  return {
    doc_num: docNum,
    doc_typ: docTyp,
    docs: [{ num: 1, from: rawPrefix + String(fromN), to: rawPrefix + String(toN), totnum, cancel, net_issue }],
  };
}

function buildDocIssue(taxInvoiceRows, monthNum, yearNum, identifierPrefix, sellerStateCode) {
  const prefix = `${identifierPrefix || ""}${sellerStateCode || ""}`;
  const invPrefix = prefix;
  const cnPrefix = prefix + "C";
  const invoiceRows = (taxInvoiceRows || []).filter((r) => r && r["Type"] === "INVOICE");
  const cnRows = (taxInvoiceRows || []).filter((r) => r && r["Type"] === "CREDIT NOTE");
  const invDoc = buildDocRange(invoiceRows, 1, "Invoices for outward supply", invPrefix, (inv) => {
    if (inv.startsWith(invPrefix)) {
      const num = parseInt(inv.slice(invPrefix.length));
      if (!isNaN(num)) return { num };
    }
    const m = inv.match(/(\d+)(?!.*\d)/);
    return m ? { num: parseInt(m[1]) } : null;
  }, monthNum, yearNum);
  const cnDoc = buildDocRange(cnRows, 5, "Credit Note", cnPrefix, (inv) => {
    if (inv.startsWith(cnPrefix)) {
      const num = parseInt(inv.slice(cnPrefix.length));
      if (!isNaN(num)) return { num };
    }
    const m = inv.match(/C(\d+)(?!.*C\d*)/i);
    if (m) return { num: parseInt(m[1]) };
    return null;
  }, monthNum, yearNum);
  return { doc_det: [invDoc, cnDoc] };
}

function generateOutput(salesRows, returnsRows, taxInvoiceRows, fp, month, year) {
  const sales = salesRows || [];
  const returns = returnsRows || [];
  const sellerGstin = (sales[0] && sales[0].gstin) || "";
  const sellerStateCode = sellerGstin ? sellerGstin.slice(0, 2) : "27";
  const ecoTcsGstin = (sales[0] && sales[0].eco_tcs_gstin) || "";
  const etin = transformETIN(ecoTcsGstin, sellerStateCode);
  const b2csAgg = {};
  const hsnAgg = {};

  function processRow(row, sign) {
    const state = row.end_customer_state_new;
    const pos = getPOS(state);
    if (!pos) return;
    const rt = toNum(row.gst_rate);
    const tsvRaw = toNum(row.total_taxable_sale_value);
    const tsv = sign * r2(tsvRaw);
    const qty = sign * toNum(row.quantity);
    const isIntra = pos === sellerStateCode;
    const sply_ty = isIntra ? "INTRA" : "INTER";
    const hsnRaw = row.hsn_code;
    const { hsn_sc, uqc } = mapHSN_UQC(hsnRaw);
    const taxAbs = r2((r2(tsvRaw) * rt) / 100);
    const tax = sign * taxAbs;
    const iamt = isIntra ? 0 : tax;
    const camt = isIntra ? tax / 2 : 0;
    const samt = isIntra ? tax / 2 : 0;
    const bk = `${pos}|${rt}`;
    if (!b2csAgg[bk]) b2csAgg[bk] = { sply_ty, rt, typ: "OE", pos, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
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
  sales.forEach((r) => processRow(r, 1));
  returns.forEach((r) => processRow(r, -1));

  const b2cs = Object.values(b2csAgg).map((v) => ({
    sply_ty: v.sply_ty,
    rt: Number(v.rt),
    typ: "OE",
    pos: v.pos,
    txval: r2(v.txval),
    iamt: r2(v.iamt),
    samt: r2(v.samt),
    camt: r2(v.camt),
    csamt: r2(v.csamt),
  })).filter((v) => v.txval !== 0);

  let totalSuppval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
  b2cs.forEach((b) => { totalSuppval += b.txval; totalIgst += b.iamt; totalCgst += b.cgst; totalSgst += b.samt; });

  const hsnMainAgg = {};
  Object.values(hsnAgg).forEach((v) => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnMainAgg[k]) hsnMainAgg[k] = { hsn_sc: v.hsn_sc, uqc: v.uqc, rt: v.rt, qty: 0, txval: 0, iamt: 0, samt: 0, camt: 0, csamt: 0 };
    hsnMainAgg[k].qty += v.qty;
    hsnMainAgg[k].txval += v.txval;
    hsnMainAgg[k].iamt += v.iamt;
    hsnMainAgg[k].camt += v.camt;
    hsnMainAgg[k].samt += v.samt;
  });
  const hsn_b2c = Object.values(hsnMainAgg).filter((v) => Math.round(v.qty) !== 0 || r2(v.txval) !== 0).map((v, i) => ({
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

  const identifierPrefix = (sales[0] && sales[0].identifier) || "";
  const doc_issue = buildDocIssue(taxInvoiceRows, Number(month), Number(year), identifierPrefix, sellerStateCode);

  return {
    gstin: sellerGstin,
    fp,
    b2cs,
    doc_issue,
    supeco: { clttx: [{ etin, suppval: r2(totalSuppval), igst: r2(totalIgst), cgst: r2(totalCgst), sgst: r2(totalSgst), cess: 0, flag: "N" }] },
    hsn: { hsn_b2c },
  };
}

// ---- Load data and run ----
const salesRows = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(__dirname, "tcs_sales.xlsx")).Sheets.Sheet1);
const retRows = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(__dirname, "tcs_sales_return.xlsx")).Sheets.Sheet1);
const taxRows = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(__dirname, "Tax_invoice_details.xlsx")).Sheets.Sheet1);

const month = 8, year = 2026;
const fp = buildFP(month, year);
const output = generateOutput(salesRows, retRows, taxRows, fp, month, year);
const ref = require('./R1_08EKGPA4015M1Z8_08_2026.json');

console.log("=== TOP-LEVEL SECTIONS ===");
const refKeys = Object.keys(ref).sort().join(", ");
const outKeys = Object.keys(output).sort().join(", ");
console.log("Reference keys:", refKeys);
console.log("Output keys:   ", outKeys);
console.log("Match?", refKeys === outKeys ? "✅" : "❌");

console.log("\n=== GSTIN/FP ===");
console.log("GSTIN:", output.gstin, "(ref was", ref.gstin, ")");
console.log("FP:   ", output.fp, "(ref:", ref.fp, ") → ", output.fp === ref.fp ? "✅" : "❌");

console.log("\n=== DOC_ISSUE (THE NEW STUFF) ===");
console.log("doc_det count:", output.doc_issue.doc_det.length);
output.doc_issue.doc_det.forEach((doc) => {
  console.log(`\n  doc_num:${doc.doc_num}  doc_typ:${doc.doc_typ}`);
  doc.docs.forEach((d, i) => {
    console.log(`    docs[${i}] num=${d.num}  from=${d.from}  to=${d.to}`);
    console.log(`      totnum=${d.totnum}  cancel=${d.cancel}  net_issue=${d.net_issue}`);
  });
  const refDoc = ref.doc_issue?.doc_det?.find(x => x.doc_num === doc.doc_num);
  if (refDoc) {
    const ourDoc = JSON.stringify(doc);
    const rDoc = JSON.stringify(refDoc);
    console.log(`    vs reference doc_num ${doc.doc_num}:`, ourDoc === rDoc ? "✅ EXACT MATCH" : "❌ DIFF");
    if (ourDoc !== rDoc) {
      console.log("      ref:", JSON.stringify(refDoc));
      console.log("      us :", JSON.stringify(doc));
    }
  }
});

console.log("\n=== SUPECO ===");
console.log("Our:", JSON.stringify(output.supeco));
console.log("Ref:", JSON.stringify(ref.supeco));
console.log("Match?", JSON.stringify(output.supeco) === JSON.stringify(ref.supeco) ? "✅" : "❌");

console.log("\n=== B2CS ===");
const b2csMatches = [];
output.b2cs.forEach((ob) => {
  const rb = ref.b2cs.find((r) => r.pos === ob.pos && r.rt === ob.rt);
  if (!rb) { b2csMatches.push({ ours: ob, missing_in_ref: true }); return; }
  const diffs = [];
  ["sply_ty","rt","typ","pos","txval","iamt","samt","camt","csamt"].forEach(f => {
    const a = String(ob[f]), b = String(rb[f]);
    if (a !== b) diffs.push({ field: f, ours: a, ref: b });
  });
  if (diffs.length) b2csMatches.push({ key: `${ob.pos}_${ob.rt}`, diffs });
});
console.log(`B2CS: output has ${output.b2cs.length}, ref has ${ref.b2cs.length}`);
console.log(`Exact-matching entries: ${output.b2cs.length - b2csMatches.length}/${output.b2cs.length}`);
b2csMatches.slice(0, 5).forEach((m) => {
  if (m.missing_in_ref) console.log("  NO REF MATCH:", JSON.stringify(m.ours));
  else console.log(`  DIFF ${m.key}:`, m.diffs);
});

console.log("\n=== HSN_B2C ===");
const hsnMatches = [];
output.hsn.hsn_b2c.forEach((oh) => {
  const rh = ref.hsn.hsn_b2c.find((r) => r.hsn_sc === oh.hsn_sc && r.rt === oh.rt && r.uqc === oh.uqc);
  if (!rh) { hsnMatches.push({ ours: oh, missing: true }); return; }
  const diffs = [];
  ["hsn_sc","uqc","qty","rt","txval","iamt","samt","camt","csamt"].forEach(f => {
    const a = String(oh[f]), b = String(rh[f]);
    if (a !== b) diffs.push({ f, ours: a, ref: b });
  });
  if (diffs.length) hsnMatches.push({ key: `${oh.hsn_sc}_${oh.rt}`, diffs });
});
console.log(`HSN: output has ${output.hsn.hsn_b2c.length}, ref has ${ref.hsn.hsn_b2c.length}`);
console.log(`Exact-matching: ${output.hsn.hsn_b2c.length - hsnMatches.length}/${output.hsn.hsn_b2c.length}`);
hsnMatches.slice(0, 5).forEach((m) => {
  if (m.missing) console.log("  NO REF:", JSON.stringify(m.ours));
  else console.log(`  DIFF ${m.key}:`, m.diffs);
});

console.log("\n=== FINAL OVERALL ===");
const fullMatch = JSON.stringify(output) === JSON.stringify(ref);
console.log("Full exact JSON match:", fullMatch ? "✅ YES" : "❌ NO");

// Write actual output for inspection
const fs = require('fs');
fs.writeFileSync(path.join(__dirname, 'e2e_output.json'), JSON.stringify(output, null, 2));
console.log("Written to e2e_output.json");
