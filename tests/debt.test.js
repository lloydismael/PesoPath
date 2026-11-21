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

assert.strictEqual(E.estimateApr(20100, 10201, 2), 12, 'estimates a reducing-balance APR for two fixed monthly payments');
assert.strictEqual(E.estimateApr(10000, 10200, 1), 24, 'annualizes the monthly rate for one payment');
assert.strictEqual(E.estimateApr(0.90, 0.30, 3), 0, 'decimal currency amounts can repay the balance with no interest');
assert.strictEqual(E.estimateApr(100, 33.33, 3), null, 'rejects payments that cannot repay the balance even at 0%');
assert.strictEqual(E.estimateApr(100, 20, 5.5), null, 'rejects a fractional number of payments');
console.log('✅ Debt engine tests passed');
