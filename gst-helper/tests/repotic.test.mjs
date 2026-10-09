import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExcelFile, detectFileByColumns, detectFilingPeriod } from '../src/utils/excelParser.js';
import { generateOutput, buildSummary, parseDateMonthYear, alignOutputOrder } from '../src/utils/calculator.js';
import { compareToReference, canDownloadOutput } from '../src/utils/compare.js';
import { getPOS, r2 } from '../src/utils/constants.js';

const inputDir = process.env.REPOTIC_INPUT_DIR || 'D:/temp new';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (name) => {
  const buffer = await fs.readFile(path.join(inputDir, `${name}.xlsx`));
  const rows = await parseExcelFile({ arrayBuffer: async () =>
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) });
  assert.equal(detectFileByColumns(rows), name);
  return rows;
};
const [sales, returns, invoices] = await Promise.all([
  load('tcs_sales'), load('tcs_sales_return'), load('Tax_invoice_details'),
]);
const reference = JSON.parse(await fs.readFile(path.join(inputDir, 'repotic output.json'), 'utf8'));
const period = detectFilingPeriod(sales);
assert.deepEqual(period, { month: 9, year: 2026 });
assert.deepEqual([sales.length, returns.length, invoices.length], [1009, 183, 1220]);
const computed = generateOutput(sales, returns, invoices, reference.fp, period.month, period.year);
const output = alignOutputOrder(computed, reference);
assert.deepEqual(output, reference, 'Every field and array position must match the supplied reference');
assert.equal(JSON.stringify(output), JSON.stringify(reference), 'Serialized JSON must match exactly');
assert.equal(compareToReference(output, reference).ok, true);
assert.equal(canDownloadOutput(output, compareToReference(output, reference)).allowed, true);
assert.equal(buildSummary(sales, returns, output).netTsv, reference.supeco.clttx[0].suppval);

// Prove the reference does not overwrite computed amounts.
const changedReference = structuredClone(reference);
changedReference.b2cs[0].iamt += 1;
const unchangedAmounts = generateOutput(sales, returns, invoices, reference.fp, 9, 2026, changedReference);
assert.equal(unchangedAmounts.b2cs[0].iamt, output.b2cs[0].iamt);
assert.equal(canDownloadOutput(output, compareToReference(output, changedReference)).allowed, false);
const extraDocument = structuredClone(reference);
extraDocument.doc_issue.doc_det[0].docs.push({ ...extraDocument.doc_issue.doc_det[0].docs[0], num: 2 });
assert.equal(compareToReference(output, extraDocument).ok, false);
const extraEco = structuredClone(reference);
extraEco.supeco.clttx.push({ ...extraEco.supeco.clttx[0] });
assert.equal(compareToReference(output, extraEco).ok, false);
assert.equal(r2(20.115), 20.12);
assert.equal(r2(1e-7), 0);
assert.equal(getPOS(''), null);
assert.equal(getPOS('DADRA AND NAGAR HAVELI AND DAMAN AND DIU'), '26');
assert.deepEqual(parseDateMonthYear('03/09/2026'), { y: 2026, m: 9 });
assert.throws(() => generateOutput([{ ...sales[0], end_customer_state_new: '' }], [], [], '092026', 9, 2026), /Unknown customer state/);

await fs.mkdir(path.join(root, 'outputs'), { recursive: true });
await fs.writeFile(path.join(root, 'outputs/repotic-matched-092026.json'), JSON.stringify(output));
console.log('PASS: 2,412 input rows; exact serialized reference match; rounding, dates, summary, comparison, and download checks.');
