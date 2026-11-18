// Run: node tests/installments.test.js
const assert = require('assert');
const I = require('../js/installments.js');
const today = new Date(2026, 10, 10); // Nov 10, 2026
const phone = { id: 'p', start: '2026-05', terms: 12, monthly: 5200, principal: 54990, dueDay: 5, paidTerms: 7 };
const s = I.stats(phone, today);
assert.strictEqual(s.total, 62400); assert.strictEqual(s.remaining, 5 * 5200);
assert.strictEqual(s.expected, 7); assert.strictEqual(s.behind, 0); assert.strictEqual(s.endYm, '2027-04');
assert.strictEqual(I.stats({ ...phone, paidTerms: 5 }, today).behind, 2, 'late detection');
assert.strictEqual(I.stats({ ...phone, paidTerms: 12 }, today).status, 'done');
assert.strictEqual(I.stats({ ...phone, principal: 62400 }, today).interest, 0, '0% plan');
assert.deepStrictEqual(I.cells({ ...phone, paidTerms: 5 }, today).slice(4, 8).map((c) => c.state), ['paid', 'late', 'late', 'future']);
const fc = I.forecast([{ ...phone, paidTerms: 5 }], '2026-11', 12);
assert.strictEqual(fc.reduce((a, m) => a + m.total, 0), 7 * 5200, 'forecast covers all unpaid terms');
console.log('✅ Installment engine tests passed');
