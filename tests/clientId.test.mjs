import assert from 'node:assert/strict';
import { createClientId } from '../src/utils/clientId.js';

assert.equal(createClientId({ randomUUID: () => 'secure-client-id' }), 'secure-client-id');
const httpCrypto = { getRandomValues: bytes => { bytes.fill(42); return bytes; } };
assert.equal(createClientId(httpCrypto), '2a'.repeat(16));
assert.match(createClientId({}), /^client-/);
assert.match(createClientId(null), /^client-/);
assert.equal(new Set(Array.from({ length: 100 }, () => createClientId({}))).size, 100);
console.log('PASS: client IDs work on HTTPS, ordinary HTTP, and without browser crypto.');
