import assert from 'node:assert/strict';
import { readRoute, routeHash } from '../src/utils/navigation.js';
for (const route of [{ screen: 'dashboard' }, { screen: 'clients' },
  { screen: 'filing', clientId: 'client with & symbols', month: 9, year: 2026 }]) {
  assert.deepEqual(readRoute(routeHash(route)), route);
}
assert.deepEqual(readRoute(''), { screen: 'dashboard' });
assert.deepEqual(readRoute('#/filing?client=a&month=13&year=2026'), { screen: 'dashboard' });
assert.deepEqual(readRoute('#/filing?month=9&year=2026'), { screen: 'dashboard' });
console.log('PASS: dashboard, client list, and monthly filing URLs round-trip; invalid routes fall back safely.');
