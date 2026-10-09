import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { generateOutput } from "./gst-helper/src/utils/calculator.js";
import {
  compareToReference,
  validateOutputStructure,
} from "./gst-helper/src/utils/compare.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSheet(file) {
  const wb = XLSX.readFile(path.join(__dirname, file), { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

const salesRows = loadSheet("tcs_sales.xlsx");
const retRows = loadSheet("tcs_sales_return.xlsx");
const taxRows = loadSheet("Tax_invoice_details.xlsx");
const ref = JSON.parse(
  fs.readFileSync(path.join(__dirname, "R1_08EKGPA4015M1Z8_08_2026.json"), "utf8"),
);

const month = 8;
const year = 2026;
const fp = "082026";
const output = generateOutput(salesRows, retRows, taxRows, fp, month, year);

console.log("sales gstin", salesRows[0]?.gstin);
console.log("sales identifier", salesRows[0]?.identifier);
console.log("output keys", Object.keys(output).join(", "));
console.log("structure", validateOutputStructure(output));
console.log("doc_issue", JSON.stringify(output.doc_issue, null, 2));
console.log("ref doc_issue", JSON.stringify(ref.doc_issue, null, 2));

const cmp = compareToReference(output, ref);
console.log("comparison ok?", cmp.ok, "diffs", cmp.diffs.length);
const docDiffs = cmp.diffs.filter((d) => String(d.path).startsWith("doc_issue"));
console.log("doc_issue diffs", docDiffs.length ? JSON.stringify(docDiffs, null, 2) : "none");
if (cmp.diffs.length && cmp.diffs.length <= 40) {
  console.log("all diffs", JSON.stringify(cmp.diffs, null, 2));
} else if (cmp.diffs.length > 40) {
  console.log("first 40 diffs", JSON.stringify(cmp.diffs.slice(0, 40), null, 2));
}

fs.writeFileSync(path.join(__dirname, "e2e_output.json"), JSON.stringify(output, null, 2));
console.log("written e2e_output.json");
