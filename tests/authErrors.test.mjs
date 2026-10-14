import assert from 'node:assert/strict';
import { authErrorMessage } from '../src/utils/authErrors.js';
assert.match(authErrorMessage({ code: 'auth/operation-not-allowed' }), /SMS region policy/);
assert.match(authErrorMessage({ code: 'auth/operation-not-allowed' }), /India/);
assert.match(authErrorMessage({ code: 'auth/invalid-verification-code' }), /Incorrect OTP/);
assert.match(authErrorMessage({ code: 'auth/billing-not-enabled' }), /billing/);
assert.match(authErrorMessage({ code: 'auth/network-request-failed' }), /connection/);
assert.match(authErrorMessage({ code: 'auth/unknown' }), /auth\/unknown/);
console.log('PASS: phone-auth errors distinguish SMS region settings, billing, verification, and network failures.');
