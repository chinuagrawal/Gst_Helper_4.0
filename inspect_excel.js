const XLSX = require("xlsx");
const path = require("path");

const files = [
  "tcs_sales.xlsx",
  "tcs_sales_return.xlsx",
  "Tax_invoice_details.xlsx",
];

files.forEach((file) => {
  console.log("\n" + "=".repeat(80));
  console.log(`FILE: ${file}`);
  console.log("=".repeat(80));

  const workbook = XLSX.readFile(path.join(__dirname, file));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  console.log(`Sheet: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length > 0) {
    console.log("\n--- COLUMN HEADERS ---");
    rows[0].forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)}`));

    console.log("\n--- FIRST 5 DATA ROWS ---");
    for (let r = 1; r < Math.min(rows.length, 6); r++) {
      console.log(`\nRow ${r}:`);
      rows[r].forEach((val, i) => {
        if (val !== "" && val !== null && val !== undefined) {
          console.log(
            `  [${i}] ${rows[0][i]} = ${JSON.stringify(val)} (${typeof val})`,
          );
        }
      });
    }

    console.log(`\n--- TOTAL ROWS: ${rows.length - 1} ---`);
  }
});
