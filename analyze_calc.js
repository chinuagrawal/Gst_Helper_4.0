const XLSX = require("xlsx");
const path = require("path");

const STATE_TO_POS = {
  "JAMMU AND KASHMIR": "01",
  "JAMMU & KASHMIR": "01",
  "JAMMU & KASHMIR ": "01",
  "HIMACHAL PRADESH": "02",
  PUNJAB: "03",
  CHANDIGARH: "04",
  UTTARAKHAND: "05",
  UTTARANCHAL: "05",
  HARYANA: "06",
  DELHI: "07",
  RAJASTHAN: "08",
  "UTTAR PRADESH": "09",
  BIHAR: "10",
  SIKKIM: "11",
  "ARUNACHAL PRADESH": "12",
  NAGALAND: "13",
  MANIPUR: "14",
  MIZORAM: "15",
  TRIPURA: "16",
  MEGHALAYA: "17",
  ASSAM: "18",
  "WEST BENGAL": "19",
  JHARKHAND: "20",
  ODISHA: "21",
  ORISSA: "21",
  CHATTISGARH: "22",
  CHHATTISGARH: "22",
  "MADHYA PRADESH": "23",
  GUJARAT: "24",
  "DAMAN AND DIU": "25",
  "DAMAN & DIU": "25",
  "DADRA AND NAGAR HAVELI": "26",
  "DADRA & NAGAR HAVELI": "26",
  MAHARASHTRA: "27",
  "ANDHRA PRADESH (OLD)": "28",
  KARNATAKA: "29",
  GOA: "30",
  LAKSHADWEEP: "31",
  KERALA: "32",
  "TAMIL NADU": "33",
  PUDUCHERRY: "34",
  PONDICHERRY: "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  "ANDAMAN & NICOBAR ISLANDS": "35",
  TELANGANA: "36",
  "ANDHRA PRADESH": "37",
  LADAKH: "38",
};

const salesWB = XLSX.readFile(path.join(__dirname, "tcs_sales.xlsx"));
const salesRaw = XLSX.utils.sheet_to_json(
  salesWB.Sheets[salesWB.SheetNames[0]],
);
const returnWB = XLSX.readFile(path.join(__dirname, "tcs_sales_return.xlsx"));
const returnsRaw = XLSX.utils.sheet_to_json(
  returnWB.Sheets[returnWB.SheetNames[0]],
);
const taxWB = XLSX.readFile(path.join(__dirname, "Tax_invoice_details.xlsx"));
const taxDetails = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);

function normalize(s) {
  return (s || "").toString().trim().toUpperCase();
}
function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function r2(v) {
  return Math.round(v * 100) / 100;
}

function getPOS(stateName) {
  const norm = normalize(stateName);
  if (STATE_TO_POS[norm]) return STATE_TO_POS[norm];
  for (const k of Object.keys(STATE_TO_POS)) {
    if (norm.includes(k) || k.includes(norm)) return STATE_TO_POS[k];
  }
  return null;
}

console.log("\n=== DETAILED CALCULATION ANALYSIS ===\n");

console.log(
  "Step 1: Check if total_taxable_sale_value INCLUDES or EXCLUDES taxable_shipping",
);
const sampleSales = salesRaw.slice(0, 3);
sampleSales.forEach((s, i) => {
  const tsv = toNum(s.total_taxable_sale_value);
  const ship = toNum(s.taxable_shipping);
  const tax = toNum(s.tax_amount);
  const inv = toNum(s.total_invoice_value);
  const rate = toNum(s.gst_rate);
  const calcTax = (tsv * rate) / 100;
  const calcTaxInclShip = ((tsv + ship) * rate) / 100;
  console.log(`Sample ${i + 1}:`);
  console.log(
    `  tsv=${tsv}, ship=${ship}, tsv+ship=${r2(tsv + ship)}, tax_amount=${r2(tax)}, inv=${inv}, rate=${rate}%`,
  );
  console.log(
    `  calcTax(tsv only)=${r2(calcTax)}, calcTax(tsv+ship)=${r2(calcTaxInclShip)}`,
  );
  console.log(
    `  tsv + ship + tax_amount = ${r2(tsv + ship + tax)} vs inv=${inv}`,
  );
  console.log(`  tsv + tax = ${r2(tsv + tax)} vs inv=${inv}`);
  console.log(
    `  (tsv+ship)*(1+rate/100) = ${r2((tsv + ship) * (1 + rate / 100))} vs inv=${inv}`,
  );
  console.log("");
});

console.log(
  "Step 2: Net by suborder - subtract returns from sales individually",
);
const salesBySub = {};
salesRaw.forEach((s) => {
  const so = s.sub_order_num;
  if (!salesBySub[so]) salesBySub[so] = [];
  salesBySub[so].push(s);
});
const returnsBySub = {};
returnsRaw.forEach((r) => {
  const so = r.sub_order_num;
  if (!returnsBySub[so]) returnsBySub[so] = [];
  returnsBySub[so].push(r);
});

console.log(`  Sales suborders: ${Object.keys(salesBySub).length}`);
console.log(`  Returns suborders: ${Object.keys(returnsBySub).length}`);
const overlapSos = Object.keys(salesBySub).filter((so) => returnsBySub[so]);
console.log(`  Overlapping suborders: ${overlapSos.length}`);

console.log(
  "\nStep 3: Build NET items = each sales item MINUS any matching return items for same suborder",
);
const netItems = [];
let unmatchedReturns = 0;
salesRaw.forEach((s) => {
  netItems.push({ ...s, _type: "sale" });
});
returnsRaw.forEach((r) => {
  if (salesBySub[r.sub_order_num]) {
    netItems.push({ ...r, _type: "return" });
  } else {
    unmatchedReturns++;
  }
});
console.log(
  `  Net items array: sales(${salesRaw.length}) + matched returns(${returnsRaw.length - unmatchedReturns}) = ${netItems.length}`,
);
console.log(
  `  Unmatched returns (no matching sale suborder): ${unmatchedReturns}`,
);

console.log(
  "\nStep 4: Check what taxable value means - compare with SUM to reference",
);
function computeAggregate(withShipping, signPerItem) {
  const b2csAgg = {};
  const hsnAgg = {};
  let totalTxval = 0,
    totalIgst = 0,
    totalCgst = 0,
    totalSgst = 0;

  netItems.forEach((item) => {
    const sign = signPerItem ? (item._type === "return" ? -1 : 1) : 1;
    const state = item.end_customer_state_new;
    const pos = getPOS(state);
    const rate = toNum(item.gst_rate);
    const tsv = toNum(item.total_taxable_sale_value);
    const ship = toNum(item.taxable_shipping);
    const qty = toNum(item.quantity);
    const txvalBase = withShipping ? tsv + ship : tsv;
    const txval = sign * txvalBase;
    const hsn = item.hsn_code;

    const isIntra = pos === "27";
    const iamt = isIntra ? 0 : (txval * rate) / 100;
    const camt = isIntra ? (txval * rate) / 200 : 0;
    const samt = isIntra ? (txval * rate) / 200 : 0;

    const b2ck = `${pos}|${rate}`;
    if (!b2csAgg[b2ck])
      b2csAgg[b2ck] = {
        pos,
        rate,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        sply_ty: isIntra ? "INTRA" : "INTER",
      };
    b2csAgg[b2ck].txval += txval;
    b2csAgg[b2ck].iamt += iamt;
    b2csAgg[b2ck].camt += camt;
    b2csAgg[b2ck].samt += samt;

    totalTxval += txval;
    totalIgst += iamt;
    totalCgst += camt;
    totalSgst += samt;

    const uqc = "PCS";
    const hsnk = `${hsn}|${uqc}|${rate}`;
    if (!hsnAgg[hsnk])
      hsnAgg[hsnk] = {
        hsn,
        uqc,
        rate,
        qty: 0,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
      };
    hsnAgg[hsnk].qty += sign * qty;
    hsnAgg[hsnk].txval += txval;
    hsnAgg[hsnk].iamt += iamt;
    hsnAgg[hsnk].camt += camt;
    hsnAgg[hsnk].samt += samt;
  });

  return { b2csAgg, hsnAgg, totalTxval, totalIgst, totalCgst, totalSgst };
}

const ref = require("./REPOTIC output.json");
const refTotalTxval = ref.b2cs.reduce((a, b) => a + b.txval, 0);
const refTotalIgst = ref.b2cs.reduce((a, b) => a + b.iamt, 0);
const refTotalCgst = ref.b2cs.reduce((a, b) => a + b.camt, 0);
const refTotalSgst = ref.b2cs.reduce((a, b) => a + b.samt, 0);
console.log(
  `Reference totals: txval=${r2(refTotalTxval)}, igst=${r2(refTotalIgst)}, cgst=${r2(refTotalCgst)}, sgst=${r2(refTotalSgst)}`,
);
console.log(
  `Reference supeco: suppval=${ref.supeco.clttx[0].suppval}, igst=${ref.supeco.clttx[0].igst}, cgst=${ref.supeco.clttx[0].cgst}, sgst=${ref.supeco.clttx[0].sgst}`,
);

console.log("\nScenario A: txval = tsv (no shipping), sign per item:");
let res = computeAggregate(false, true);
console.log(
  `  txval=${r2(res.totalTxval)}, igst=${r2(res.totalIgst)}, cgst=${r2(res.totalCgst)}, sgst=${r2(res.totalSgst)}`,
);

console.log("\nScenario B: txval = tsv + shipping, sign per item:");
res = computeAggregate(true, true);
console.log(
  `  txval=${r2(res.totalTxval)}, igst=${r2(res.totalIgst)}, cgst=${r2(res.totalCgst)}, sgst=${r2(res.totalSgst)}`,
);

console.log(
  "\nScenario C: aggregate sales then aggregate returns, subtract (no shipping):",
);
function computeAgg(rows, sign, withShipping) {
  let txval = 0,
    igst = 0,
    cgst = 0,
    sgst = 0;
  rows.forEach((item) => {
    const pos = getPOS(item.end_customer_state_new);
    const rate = toNum(item.gst_rate);
    const tsv = toNum(item.total_taxable_sale_value);
    const ship = toNum(item.taxable_shipping);
    const tv = (withShipping ? tsv + ship : tsv) * sign;
    const isIntra = pos === "27";
    txval += tv;
    if (isIntra) {
      cgst += (tv * rate) / 200;
      sgst += (tv * rate) / 200;
    } else {
      igst += (tv * rate) / 100;
    }
  });
  return { txval, igst, cgst, sgst };
}
const sAgg = computeAgg(salesRaw, 1, false);
const rAgg = computeAgg(returnsRaw, 1, false);
console.log(
  `  Sales: txval=${r2(sAgg.txval)}, igst=${r2(sAgg.igst)}, cgst=${r2(sAgg.cgst)}, sgst=${r2(sAgg.sgst)}`,
);
console.log(
  `  Returns: txval=${r2(rAgg.txval)}, igst=${r2(rAgg.igst)}, cgst=${r2(rAgg.cgst)}, sgst=${r2(rAgg.sgst)}`,
);
console.log(
  `  Net (Sales-Returns): txval=${r2(sAgg.txval - rAgg.txval)}, igst=${r2(sAgg.igst - rAgg.igst)}, cgst=${r2(sAgg.cgst - rAgg.cgst)}, sgst=${r2(sAgg.sgst - rAgg.sgst)}`,
);

console.log("\nScenario D: same with shipping:");
const sAgg2 = computeAgg(salesRaw, 1, true);
const rAgg2 = computeAgg(returnsRaw, 1, true);
console.log(
  `  Sales: txval=${r2(sAgg2.txval)}, igst=${r2(sAgg2.igst)}, cgst=${r2(sAgg2.cgst)}, sgst=${r2(sAgg2.sgst)}`,
);
console.log(
  `  Returns: txval=${r2(rAgg2.txval)}, igst=${r2(rAgg2.igst)}, cgst=${r2(rAgg2.cgst)}, sgst=${r2(rAgg2.sgst)}`,
);
console.log(
  `  Net: txval=${r2(sAgg2.txval - rAgg2.txval)}, igst=${r2(sAgg2.igst - rAgg2.igst)}, cgst=${r2(sAgg2.cgst - rAgg2.cgst)}, sgst=${r2(sAgg2.sgst - rAgg2.sgst)}`,
);

console.log("\nStep 5: Check state-to-POS mapping for all states in sales");
const salesStates = [
  ...new Set(salesRaw.map((s) => s.end_customer_state_new)),
].sort();
salesStates.forEach((s) => {
  const pos = getPOS(s);
  console.log(`  ${s} -> ${pos}`);
});

console.log("\nStep 6: HSN 392401 -> 392490 + PAC pattern analysis");
const tcsSalesHSNMap = {};
salesRaw.forEach((s) => {
  const h = s.hsn_code;
  tcsSalesHSNMap[h] = (tcsSalesHSNMap[h] || 0) + 1;
});
console.log("Sales HSN count:", tcsSalesHSNMap);
console.log("\nIn reference output, HSN mapping:");
ref.hsn.hsn_b2c.forEach((h) =>
  console.log(`  hsn=${h.hsn_sc} uqc=${h.uqc} qty=${h.qty} txval=${h.txval}`),
);

console.log(
  "\nLet's compute qty for each HSN (Sales - Returns) to find mapping:",
);
const qtyByHSN = {};
salesRaw.forEach((s) => {
  qtyByHSN[s.hsn_code] = (qtyByHSN[s.hsn_code] || 0) + toNum(s.quantity);
});
returnsRaw.forEach((r) => {
  qtyByHSN[r.hsn_code] = (qtyByHSN[r.hsn_code] || 0) - toNum(r.quantity);
});
Object.keys(qtyByHSN)
  .sort()
  .forEach((h) => console.log(`  HSN ${h}: net qty = ${qtyByHSN[h]}`));

console.log("\nCompare with ref hsn_b2c qty:");
let refTotQty = 0;
ref.hsn.hsn_b2c.forEach((h) => {
  console.log(`  ${h.hsn_sc}-${h.uqc} qty=${h.qty}`);
  refTotQty += h.qty;
});
console.log(`  Ref total qty: ${refTotQty}`);
let ourTotQty = 0;
Object.values(qtyByHSN).forEach((q) => (ourTotQty += q));
console.log(`  Our total net qty: ${ourTotQty}`);

console.log("\nStep 7: ETIN check - eco_tcs_gstin vs ref output");
console.log("eco_tcs_gstin in sales:", [
  ...new Set(salesRaw.map((s) => s.eco_tcs_gstin)),
]);
console.log("ref etin:", ref.supeco.clttx[0].etin);
console.log("Note: first 2 digits changed from 08 to 27 (seller state)");
