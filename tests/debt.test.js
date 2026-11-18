// Run: node tests/debt.test.js
const assert = require('assert');
const E = require('../js/debt.js');
const debts = [
  { id: 'cc', name: 'Credit Card', balance: 35000, apr: 36, minPayment: 1750 },
  { id: 'bnpl', name: 'BNPL', balance: 12000, apr: 30, minPayment: 1200 },
  { id: 'car', name: 'Car Loan', balance: 80000, apr: 6, minPayment: 4500 },
];
assert.strictEqual(E.order(debts, 'avalanche')[0].id, 'cc', 'avalanche targets highest APR');
assert.strictEqual(E.order(debts, 'snowball')[0].id, 'bnpl', 'snowball targets smallest balance');
const base = E.baseline(debts), av = E.simulate(debts, { strategy: 'avalanche', extra: 2000 });
assert.ok(av.feasible && av.months < base.months, 'extra payment pays off sooner');
assert.ok(av.totalInterest < base.totalInterest, 'extra payment saves interest');
assert.ok(!E.simulate([{ id: 'x', balance: 100000, apr: 36, minPayment: 1000 }]).feasible, 'detects min < interest');
assert.strictEqual(E.simulate([]).months, 0, 'no debts = 0 months');
console.log('✅ Debt engine tests passed');
