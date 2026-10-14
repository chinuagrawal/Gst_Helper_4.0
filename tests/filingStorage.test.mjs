import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { filingKey, restoreFiling, saveFiling } from '../src/utils/filingStorage.js';

const september = filingKey('client-a', 9, 2026);
const october = filingKey('client-a', 10, 2026);
const otherClient = filingKey('client-b', 9, 2026);
assert.equal(await restoreFiling(september), null);
const saved = {
  files: { sales: new Blob(['original spreadsheet bytes']) },
  rows: [{ date: new Date('2026-09-01T00:00:00Z'), value: 100 }],
  output: { fp: '092026', total: 100 },
};
await saveFiling(september, saved);
await saveFiling(october, { output: { fp: '102026', total: 200 } });
await saveFiling(otherClient, { output: { fp: '092026', total: 300 } });
const restored = await restoreFiling(september);
assert.deepEqual(restored.rows, saved.rows);
assert.deepEqual(restored.output, saved.output);
assert.equal(await restored.files.sales.text(), 'original spreadsheet bytes');
assert.equal((await restoreFiling(october)).output.total, 200);
assert.equal((await restoreFiling(otherClient)).output.total, 300);
const writes = [saveFiling(september, { version: 1 }), saveFiling(september, { version: 2 })];
assert.deepEqual(await restoreFiling(september), { version: 2 });
await Promise.all(writes);
await saveFiling(september, { rows: {}, output: null });
assert.deepEqual(await restoreFiling(september), { rows: {}, output: null });
assert.equal((await restoreFiling(october)).output.total, 200);
console.log('PASS: files, dates and output persist; clients/months stay separate; latest write wins; reset affects one month.');
