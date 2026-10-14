import assert from 'node:assert/strict';
import { downloadFileName, summarizeFiling, monthlyWork } from '../src/utils/filingDashboard.js';
import { filingKey } from '../src/utils/filingStorage.js';

assert.equal(downloadFileName({ tradeName: 'Chinmay' }, '092026'), 'Chinmay_092026_GSTR1.json');
assert.equal(downloadFileName({ tradeName: 'A / B: Stores' }, '102026'), 'A_B_Stores_102026_GSTR1.json');
const key = filingKey('client-a', 9, 2026);
assert.equal(summarizeFiling(key, { rows: {} }), null);
assert.equal(summarizeFiling(key, { rows: { tcs_sales: [{}] } }).status, 'Uploads incomplete');
const rows = { tcs_sales: [{}], tcs_sales_return: [{}], Tax_invoice_details: [{}] };
assert.equal(summarizeFiling(key, { rows }).status, 'Ready to generate');
const output = { gstin: '08EKGPA4015M1Z8', fp: '092026', b2cs: [],
  doc_issue: { doc_det: [{ doc_num: 1, doc_typ: 'Invoices', docs: [
    { num: 1, from: '1', to: '1', totnum: 1, cancel: 0, net_issue: 1 },
  ] }] }, supeco: { clttx: [] }, hsn: { hsn_b2c: [] } };
assert.equal(summarizeFiling(key, { rows, output }).status, 'Ready to download');
assert.equal(summarizeFiling(key, { rows, output: { ...output, fp: '102026' } }).status, 'Needs review');
assert.equal(summarizeFiling(key, { rows, output, reference: { ...output, gstin: 'different' } }).status, 'Needs review');
console.log('PASS: download naming and incomplete, generated, wrong-period, and comparison-failure statuses.');
const clients = [{ id: 'a' }, { id: 'b', active: true }, { id: 'c', active: false }];
const filings = [{ clientId: 'a', month: 9, year: 2026, uploaded: 3, completed: true },
  { clientId: 'b', month: 8, year: 2026, uploaded: 3, completed: true }];
assert.deepEqual(monthlyWork(clients, filings, 9, 2026, 'active', 'pending').map(row => row.client.id), ['b']);
assert.deepEqual(monthlyWork(clients, filings, 9, 2026, 'active', 'completed').map(row => row.client.id), ['a']);
assert.equal(monthlyWork(clients, filings, 9, 2026, 'inactive')[0].client.id, 'c');
assert.equal(monthlyWork(clients, filings, 9, 2026, 'all').length, 3);
assert.equal(monthlyWork(clients, filings, 9, 2025, 'active', 'completed').length, 0);
assert.equal(summarizeFiling(key, { rows, output, reference: { ...output, gstin: 'different' } }).completed, true);
console.log('PASS: active/inactive filtering, legacy clients, month/year isolation, and completion on JSON generation.');
