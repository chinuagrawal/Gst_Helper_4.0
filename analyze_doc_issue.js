const XLSX = require("xlsx");
const path = require("path");

const taxWB = XLSX.readFile(path.join(__dirname, "Tax_invoice_details.xlsx"));
const taxRows = XLSX.utils.sheet_to_json(taxWB.Sheets[taxWB.SheetNames[0]]);

const salesWB = XLSX.readFile(path.join(__dirname, "tcs_sales.xlsx"));
const salesRows = XLSX.utils.sheet_to_json(
  salesWB.Sheets[salesWB.SheetNames[0]],
);

const retWB = XLSX.readFile(path.join(__dirname, "tcs_sales_return.xlsx"));
const retRows = XLSX.utils.sheet_to_json(retWB.Sheets[retWB.SheetNames[0]]);

const ref = require("./R1_08EKGPA4015M1Z8_08_2026.json");

console.log("=== TAX INVOICE DETAILS (Invoice No.) ===");
console.log("Total rows:", taxRows.length);
console.log("Types present:", [...new Set(taxRows.map((r) => r["Type"]))]);
console.log("Sample Invoice Nos (first 10):");
const invRows = taxRows.filter((r) => r["Type"] === "INVOICE");
console.log("INVOICE type count:", invRows.length);
invRows
  .slice(0, 10)
  .forEach((r) =>
    console.log(
      `  [${r["Order Date"]}] ${r["Invoice No."]}  SO:${r["Suborder No."]}`,
    ),
  );

console.log("\nUnique Invoice No. prefix patterns:");
const prefixes = {};
invRows.forEach((r) => {
  const inv = String(r["Invoice No."] || "");
  const m = inv.match(/^([A-Za-z]+)/);
  if (m) {
    prefixes[m[1]] = (prefixes[m[1]] || 0) + 1;
  }
});
console.log(prefixes);

console.log("\nExtract numeric parts from Invoice Nos:");
const invNumbers = invRows
  .map((r) => {
    const inv = String(r["Invoice No."] || "");
    const digits = inv.match(/(\d+)(?!.*\d)/);
    return {
      raw: inv,
      date: r["Order Date"],
      num: digits ? parseInt(digits[1]) : null,
      so: r["Suborder No."],
    };
  })
  .filter((x) => x.num);
console.log("With numeric suffix:", invNumbers.length);
invNumbers.sort((a, b) => a.num - b.num);
console.log("Min num:", invNumbers[0]);
console.log("Max num:", invNumbers[invNumbers.length - 1]);

console.log("\nUnique prefix + number pattern:");
const invPatterns = {};
invRows.forEach((r) => {
  const inv = String(r["Invoice No."] || "");
  const m = inv.match(/^([A-Za-z]+\d+)(\d+)$/);
  if (m) {
    const key = m[1];
    if (!invPatterns[key])
      invPatterns[key] = { count: 0, min: Infinity, max: -Infinity };
    invPatterns[key].count++;
    invPatterns[key].min = Math.min(invPatterns[key].min, parseInt(m[2]));
    invPatterns[key].max = Math.max(invPatterns[key].max, parseInt(m[2]));
  }
});
console.log(invPatterns);

console.log("\nAlternative: prefix includes state-like 27?");
const invAltPatterns = {};
invRows.forEach((r) => {
  const inv = String(r["Invoice No."] || "");
  const m = inv.match(/^([A-Za-z]+\d{2})(\d+)$/);
  if (m) {
    const key = m[1];
    if (!invAltPatterns[key])
      invAltPatterns[key] = {
        count: 0,
        min: Infinity,
        max: -Infinity,
        samples: [],
      };
    invAltPatterns[key].count++;
    invAltPatterns[key].min = Math.min(invAltPatterns[key].min, parseInt(m[2]));
    invAltPatterns[key].max = Math.max(invAltPatterns[key].max, parseInt(m[2]));
    if (invAltPatterns[key].samples.length < 3)
      invAltPatterns[key].samples.push(inv);
  } else {
    console.log("  NO MATCH alt:", inv);
  }
});
console.log(invAltPatterns);

console.log("\nFilter by filing period 082026 (August 2026):");
const aug26Rows = invRows.filter((r) => {
  const d = r["Order Date"];
  return (
    d &&
    (d.startsWith("2026-08") ||
      d.startsWith("08/") ||
      d.includes("/08/2026") ||
      d.includes("-08-2026"))
  );
});
console.log("August 2026 INVOICE rows:", aug26Rows.length);
const augInvPatterns = {};
aug26Rows.forEach((r) => {
  const inv = String(r["Invoice No."] || "");
  const m = inv.match(/^([A-Za-z]+\d{2})(\d+)$/);
  if (m) {
    const key = m[1];
    if (!augInvPatterns[key])
      augInvPatterns[key] = {
        count: 0,
        min: Infinity,
        max: -Infinity,
        samples: [],
      };
    augInvPatterns[key].count++;
    augInvPatterns[key].min = Math.min(augInvPatterns[key].min, parseInt(m[2]));
    augInvPatterns[key].max = Math.max(augInvPatterns[key].max, parseInt(m[2]));
    if (augInvPatterns[key].samples.length < 5)
      augInvPatterns[key].samples.push(inv);
  }
});
console.log(augInvPatterns);

console.log("\n=== SALES FILE identifier column ===");
const salesIds = [...new Set(salesRows.map((r) => r.identifier))];
console.log("Unique sales identifiers:", salesIds);
console.log("Sample sales identifier + suborder:");
salesRows
  .slice(0, 5)
  .forEach((r) =>
    console.log(
      `  id=${r.identifier} so=${r.sub_order_num} date=${r.order_date}`,
    ),
  );

console.log("\n=== RETURNS FILE identifier column ===");
const retIds = [...new Set(retRows.map((r) => r.identifier))];
console.log("Unique return identifiers:", retIds);
console.log("Total return rows:", retRows.length);
console.log("Sample return identifier + suborder + manifest:");
retRows
  .slice(0, 5)
  .forEach((r) =>
    console.log(
      `  id=${r.identifier} so=${r.sub_order_num} date=${r.manifest_date || r.order_date}`,
    ),
  );

console.log("\n=== Build credit-note style sequence from returns ===");
console.log(
  "Reference credit doc: from=pph4k27C259 to=pph4k27C413 totnum=155 cancel=30 net=125",
);
console.log("Pattern: identifier(pph4k) + state(27) + C + number (259..413)");
const retPatterns = {};
retRows.forEach((r) => {
  const id = String(r.identifier || "");
  const m = id.match(/^([A-Za-z]+)(\d*)$/);
  if (m) {
    const key = m[1];
    if (!retPatterns[key]) retPatterns[key] = { count: 0 };
    retPatterns[key].count++;
  }
});
console.log("Return identifier prefixes:", retPatterns);

console.log("\n=== Check: returns month filtering (August 2026) ===");
const augRet = retRows.filter((r) => {
  const d = r.manifest_date || r.order_date;
  return d && (d.startsWith("2026-08") || d.startsWith("08/"));
});
console.log("August 2026 return rows:", augRet.length);
console.log(
  "Expected from ref: totnum=155, net=125 so actual used=125, cancel=30",
);

console.log("\n=== REF doc_issue values ===");
console.log(JSON.stringify(ref.doc_issue, null, 2));

console.log(
  "\n=== CROSS-MATCH: Check if sales identifiers match Tax Invoice Nos ===",
);
console.log(
  "First 5 sales identifiers:",
  salesRows.slice(0, 5).map((r) => r.identifier),
);
console.log(
  "First 5 Tax Invoice prefixes:",
  invRows.slice(0, 5).map((r) => {
    const inv = String(r["Invoice No."] || "");
    const m = inv.match(/^([A-Za-z]+)/);
    return m ? m[1] : inv;
  }),
);
