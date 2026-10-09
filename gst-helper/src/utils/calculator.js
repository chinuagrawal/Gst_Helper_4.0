import {
  getPOS,
  toNum,
  r2,
  mapHSN_UQC,
  transformETIN,
} from "./constants.js";

export function generateOutput(
  salesRows,
  returnsRows,
  taxInvoiceRows,
  fp,
  month,
  year,
  reference = null,
) {
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
    if (!pos) throw new Error(`Unknown customer state: ${state || '(blank)'}`);
    const rt = toNum(row.gst_rate);
    const tsvRaw = toNum(row.total_taxable_sale_value);
    const tsv = sign * r2(tsvRaw);
    const qty = sign * toNum(row.quantity);
    const isIntra = pos === sellerStateCode;
    const sply_ty = isIntra ? "INTRA" : "INTER";
    const hsnRaw = row.hsn_code;
    const { hsn_sc, uqc } = mapHSN_UQC(hsnRaw);

    // Repotic rounds each tax component before netting sales and returns.
    const taxBase = r2(tsvRaw) * (rt / 100);
    const taxAbs = r2(taxBase);
    const tax = sign * taxAbs;
    const iamt = isIntra ? 0 : tax;
    const camt = isIntra ? sign * r2(taxBase / 2) : 0;
    const samt = camt;

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

  const doc_issue = buildDocIssue(
    taxInvoiceRows,
    Number(month),
    Number(year),
  );

  const output = {
    gstin: sellerGstin,
    fp,
    b2cs,
    doc_issue,
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

  return alignOutputOrder(output, reference);
}

// A reference controls presentation order only; all amounts come from the inputs.
export function alignOutputOrder(output, reference) {
  if (!reference) return output;
  const reorder = (rows, template, key) => {
    const order = new Map((template || []).map((row, i) => [key(row), i]));
    return [...rows].sort((a, b) =>
      (order.get(key(a)) ?? Infinity) - (order.get(key(b)) ?? Infinity));
  };
  return {
    ...output,
    b2cs: reorder(output.b2cs, reference.b2cs, r => `${r.pos}|${r.rt}`),
    hsn: { hsn_b2c: reorder(output.hsn.hsn_b2c, reference.hsn?.hsn_b2c,
      r => `${r.hsn_sc}|${r.uqc}|${r.rt}`).map((r, i) => ({ ...r, num: i + 1 })) },
  };
}

export function parseDateMonthYear(d) {
  if (d == null || d === "") return null;
  if (d instanceof Date && !isNaN(d.getTime())) {
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }
  if (typeof d === "number" && isFinite(d)) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(d) * 86400000;
    const dt = new Date(utc);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1 };
  }
  const s = String(d).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return { y: parseInt(iso[1], 10), m: parseInt(iso[2], 10) };
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slash) {
    let day = parseInt(slash[1], 10);
    let month = parseInt(slash[2], 10);
    let year = parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    if (year > 31 && day > 12) return { y: year, m: month };
    if (month > 12 && day <= 12) return { y: year, m: day };
    return { y: year, m: month };
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime()))
    return { y: dt.getFullYear(), m: dt.getMonth() + 1 };
  return null;
}

function normalizeType(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ");
}

function parseTrailingNumber(inv) {
  const s = String(inv || "").trim();
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[2], 10);
  if (isNaN(num)) return null;
  return { prefix: m[1], num, raw: s };
}

function emptyDoc(docNum, docTyp) {
  return {
    doc_num: docNum,
    doc_typ: docTyp,
    docs: [
      {
        num: 1,
        from: "",
        to: "",
        totnum: 0,
        cancel: 0,
        net_issue: 0,
      },
    ],
  };
}

function buildDocRange(rows, docNum, docTyp, monthNum, yearNum) {
  const filtered = (rows || []).filter((r) => {
    const my = parseDateMonthYear(r["Order Date"]);
    return my && my.m === monthNum && my.y === yearNum;
  });
  const parsed = filtered
    .map((r) => parseTrailingNumber(r["Invoice No."]))
    .filter(Boolean);

  if (parsed.length === 0) return emptyDoc(docNum, docTyp);

  const groups = {};
  parsed.forEach((p) => {
    if (!groups[p.prefix]) groups[p.prefix] = [];
    groups[p.prefix].push(p);
  });
  const prefix = Object.keys(groups).sort(
    (a, b) => groups[b].length - groups[a].length || b.length - a.length,
  )[0];
  const series = groups[prefix];
  const used = new Set(series.map((p) => p.num));
  const fromN = Math.min(...used);
  const toN = Math.max(...used);
  const totnum = toN - fromN + 1;
  let cancel = 0;
  for (let n = fromN; n <= toN; n++) if (!used.has(n)) cancel++;
  const net_issue = totnum - cancel;
  const fromRaw =
    series.find((p) => p.num === fromN)?.raw || prefix + String(fromN);
  const toRaw = series.find((p) => p.num === toN)?.raw || prefix + String(toN);

  return {
    doc_num: docNum,
    doc_typ: docTyp,
    docs: [
      {
        num: 1,
        from: fromRaw,
        to: toRaw,
        totnum,
        cancel,
        net_issue,
      },
    ],
  };
}

export function buildDocIssue(taxInvoiceRows, monthNum, yearNum) {
  const invoiceRows = (taxInvoiceRows || []).filter(
    (r) => r && normalizeType(r["Type"]) === "INVOICE",
  );
  const cnRows = (taxInvoiceRows || []).filter(
    (r) => r && normalizeType(r["Type"]) === "CREDIT NOTE",
  );

  const invDoc = buildDocRange(
    invoiceRows,
    1,
    "Invoices for outward supply",
    monthNum,
    yearNum,
  );
  const cnDoc = buildDocRange(
    cnRows,
    5,
    "Credit Note",
    monthNum,
    yearNum,
  );

  return { doc_det: [invDoc, cnDoc] };
}

export function buildSummary(sales, returns, output) {
  const salesCount = sales ? sales.length : 0;
  const returnCount = returns ? returns.length : 0;
  const totalSalesTsv = sales
    ? sales.reduce((a, r) => a + r2(toNum(r.total_taxable_sale_value)), 0)
    : 0;
  const totalReturnTsv = returns
    ? returns.reduce((a, r) => a + r2(toNum(r.total_taxable_sale_value)), 0)
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
    docIssue: (output?.doc_issue?.doc_det || []).map((d) => ({
      doc_num: d.doc_num,
      doc_typ: d.doc_typ,
      ...(d.docs && d.docs[0] ? d.docs[0] : {}),
    })),
  };
}
