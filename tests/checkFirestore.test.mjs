import assert from 'node:assert/strict';
import { checkFirestore } from '../src/utils/checkFirestore.js';
const input = { projectId: 'project-a', databaseId: '(default)', uid: 'user-a', token: 'test-token' };
await checkFirestore({ ...input, fetcher: async (url, options) => {
  assert.match(url, /projects\/project-a\/databases\/\(default\)\/documents\/users\/user-a\/clients/);
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  return { ok: true };
} });
for (const [status, code] of [[404, 'not-found'], [403, 'permission-denied'], [503, 'unavailable']]) {
  await assert.rejects(checkFirestore({ ...input, fetcher: async () => ({ ok: false, status, json: async () => ({ error: { message: 'Server error' } }) }) }), error => error.code === code);
}
console.log('PASS: Firestore startup verifies the signed-in user path and distinguishes missing databases, rules, and service errors.');
