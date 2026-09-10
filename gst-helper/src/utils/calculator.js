import {
  getPOS,
  toNum,
  r2,
  mapHSN_UQC,
  transformETIN,
  buildFP,
} from "./constants.js";

export function generateOutput(
  salesRows,
  returnsRows,
  taxInvoiceRows,
  fp,
  month,
  year,
) {
  const sales = salesRows || [];
  const returns = returnsRows || [];
  const taxMap = {};
  (taxInvoiceRows || []).forEach((t) => {
    taxMap[t["Suborder No."]] = t;
  });

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
    if (!b2csAgg[bk]) {
      b2csAgg[bk] = {
        sply_ty,
        rt,
        typ: "OE",
        pos,
        txval: 0,
        iamt: 0,
        samt: 0,
        camt: 0,
        csamt: 0,
      };
    }
    b2csAgg[bk].txval += tsv;
    b2csAgg[bk].iamt += iamt;
    b2csAgg[bk].camt += camt;
    b2csAgg[bk].samt += samt;

    const hk = `${hsn_sc}|${uqc}|${rt}|${pos}`;
    if (!hsnAgg[hk]) {
      hsnAgg[hk] = {
        hsn_sc,
        uqc,
        rt,
        qty: 0,
        txval: 0,
        iamt: 0,
        samt: 0,
        camt: 0,
        csamt: 0,
      };
    }
    hsnAgg[hk].qty += qty;
    hsnAgg[hk].txval += tsv;
    hsnAgg[hk].iamt += iamt;
    hsnAgg[hk].camt += camt;
    hsnAgg[hk].samt += samt;
  }

  sales.forEach((r) => processRow(r, 1));
  returns.forEach((r) => processRow(r, -1));

  const b2cs = Object.values(b2csAgg)
    .map((v) => ({
      sply_ty: v.sply_ty,
      rt: Number(v.rt),
      typ: "OE",
      pos: v.pos,
      txval: r2(v.txval),
      iamt: r2(v.iamt),
      samt: r2(v.samt),
      camt: r2(v.camt),
      csamt: r2(v.csamt),
    }))
    .filter((v) => v.txval !== 0);

  let totalSuppval = 0;
  let totalIgst = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  b2cs.forEach((b) => {
    totalSuppval += b.txval;
    totalIgst += b.iamt;
    totalCgst += b.camt;
    totalSgst += b.samt;
  });

  const hsnMainAgg = {};
  Object.values(hsnAgg).forEach((v) => {
    const k = `${v.hsn_sc}|${v.uqc}|${v.rt}`;
    if (!hsnMainAgg[k]) {
      hsnMainAgg[k] = {
        hsn_sc: v.hsn_sc,
        uqc: v.uqc,
        rt: v.rt,
        qty: 0,
        txval: 0,
        iamt: 0,
        samt: 0,
        camt: 0,
        csamt: 0,
      };
    }
    hsnMainAgg[k].qty += v.qty;
    hsnMainAgg[k].txval += v.txval;
    hsnMainAgg[k].iamt += v.iamt;
    hsnMainAgg[k].camt += v.camt;
    hsnMainAgg[k].samt += v.samt;
  });

  const hsn_b2c = Object.values(hsnMainAgg)
    .filter((v) => Math.round(v.qty) !== 0 || r2(v.txval) !== 0)
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
      csamt: r2(v.csamt),
    }));

  const output = {
    gstin: sellerGstin,
    fp,
    b2cs,
    supeco: {
      clttx: [
        {
          etin,
          suppval: r2(totalSuppval),
          igst: r2(totalIgst),
          cgst: r2(totalCgst),
          sgst: r2(totalSgst),
          cess: 0,
          flag: "N",
        },
      ],
    },
    hsn: {
      hsn_b2c,
    },
  };

  return output;
}

export function buildSummary(sales, returns, output) {
  const salesCount = sales ? sales.length : 0;
  const returnCount = returns ? returns.length : 0;
  const totalSalesTsv = sales
    ? sales.reduce((a, r) => a + toNum(r.total_taxable_sale_value), 0)
    : 0;
  const totalReturnTsv = returns
    ? returns.reduce((a, r) => a + toNum(r.total_taxable_sale_value), 0)
    : 0;
  const netTsv = totalSalesTsv - totalReturnTsv;
  const b2csCount = output ? output.b2cs.length : 0;
  const hsnCount = output ? output.hsn.hsn_b2c.length : 0;
  const totalTxval = output ? output.b2cs.reduce((a, b) => a + b.txval, 0) : 0;
  const totalIgst = output ? output.b2cs.reduce((a, b) => a + b.iamt, 0) : 0;
  const totalCgst = output ? output.b2cs.reduce((a, b) => a + b.camt, 0) : 0;
  const totalSgst = output ? output.b2cs.reduce((a, b) => a + b.samt, 0) : 0;
  const totalTax = totalIgst + totalCgst + totalSgst;

  const interCount = output
    ? output.b2cs.filter((b) => b.sply_ty === "INTER").length
    : 0;
  const intraCount = output
    ? output.b2cs.filter((b) => b.sply_ty === "INTRA").length
    : 0;
  const uniqueStates = new Set(output ? output.b2cs.map((b) => b.pos) : []);

  return {
    salesCount,
    returnCount,
    totalSalesTsv: r2(totalSalesTsv),
    totalReturnTsv: r2(totalReturnTsv),
    netTsv: r2(netTsv),
    b2csCount,
    hsnCount,
    totalTxval: r2(totalTxval),
    totalIgst: r2(totalIgst),
    totalCgst: r2(totalCgst),
    totalSgst: r2(totalSgst),
    totalTax: r2(totalTax),
    interCount,
    intraCount,
    uniqueStatesCount: uniqueStates.size,
    etin: output?.supeco?.clttx?.[0]?.etin || "",
    gstin: output?.gstin || "",
    fp: output?.fp || "",
  };
}
