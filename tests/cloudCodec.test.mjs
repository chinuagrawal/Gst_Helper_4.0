import assert from 'node:assert/strict';
import { encodeCloud, decodeCloud } from '../src/utils/cloudCodec.js';
const source = { rows: [{ date: new Date('2026-09-01T00:00:00Z'), blank: '', zero: 0 }], nested: { quantity: -1 }, nil: null };
assert.deepEqual(decodeCloud(JSON.parse(JSON.stringify(encodeCloud(source)))), source);
console.log('PASS: cloud snapshots preserve dates, numbers, blanks, and nested records.');
