/* PesoPath — debt payoff engine (avalanche / snowball / custom) */
const DebtEngine = (() => {
  const MAX_MONTHS = 600;

  function estimateApr(balance, payment, months) {
    if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(payment) || payment <= 0 ||
        !Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return null;
    const total = payment * months;
    if (!Number.isFinite(total)) return null;
    if (Math.abs(total - balance) <= Math.max(total, balance) * Number.EPSILON) return 0;
    if (total < balance) return null;

    // Solve for the monthly rate that discounts the remaining payments to the balance.
    const target = balance / payment;
    let low = 0, high = 1 / target;
    if (!Number.isFinite(high)) return null;
    for (let i = 0; i < 64; i++) {
      const rate = low + (high - low) / 2;
      const factor = -Math.expm1(-months * Math.log1p(rate)) / rate;
      if (factor > target) low = rate; else high = rate;
    }
    const apr = (low + (high - low) / 2) * 1200;
    return Number.isFinite(apr) ? Number(apr.toFixed(2)) : null;
  }

  function order(debts, strategy, customOrder = []) {
    const list = debts.filter((d) => d.balance > 0).slice();
    if (strategy === 'snowball') return list.sort((a, b) => a.balance - b.balance || b.apr - a.apr);
    if (strategy === 'custom') {
      const idx = (d) => { const i = customOrder.indexOf(d.id); return i < 0 ? 999 : i; };
      return list.sort((a, b) => idx(a) - idx(b));
    }
    return list.sort((a, b) => b.apr - a.apr || a.balance - b.balance);
  }

  function simulate(debts, { strategy = 'avalanche', extra = 0, customOrder = [], rollover = true } = {}) {
    const ds = order(debts, strategy, customOrder).map((d) => ({ id: d.id, name: d.name, bal: +d.balance, apr: +d.apr, min: +d.minPayment, interest: 0, paidOffMonth: null }));
    if (!ds.length) return { months: 0, totalInterest: 0, debts: [], feasible: true, timeline: [] };
    const budget = ds.reduce((s, d) => s + d.min, 0) + extra;
    let month = 0, totalInterest = 0;
    const timeline = [];
    while (ds.some((d) => d.bal > 0.005) && month < MAX_MONTHS) {
      month++;
      ds.forEach((d) => { if (d.bal > 0) { const i = d.bal * d.apr / 1200; d.bal += i; d.interest += i; totalInterest += i; } });
      let pool = rollover ? budget : ds.reduce((s, d) => s + (d.bal > 0 ? d.min : 0), 0) + extra;
      ds.forEach((d) => { if (d.bal > 0) { const p = Math.min(d.min, d.bal, pool); d.bal -= p; pool -= p; } });
      for (const d of ds) { if (pool <= 0) break; if (d.bal > 0) { const p = Math.min(d.bal, pool); d.bal -= p; pool -= p; } }
      ds.forEach((d) => { if (d.bal <= 0.005 && d.paidOffMonth === null) { d.bal = 0; d.paidOffMonth = month; } });
      timeline.push(ds.reduce((s, d) => s + d.bal, 0));
    }
    const feasible = ds.every((d) => d.bal <= 0.005);
    return { months: month, totalInterest, debts: ds, feasible, timeline, budget };
  }

  const baseline = (debts) => simulate(debts, { strategy: 'avalanche', extra: 0, rollover: false });

  function monthLabel(offset) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  }

  function flag(d, today = new Date()) {
    if (d.balance <= 0) return { level: 'done', label: 'Paid off', cls: 'ok' };
    if (d.overdue) return { level: 'red', label: 'Overdue', cls: 'bad' };
    if (+d.apr >= 24) return { level: 'red', label: 'Urgent · high interest', cls: 'bad' };
    const diff = ((+d.dueDay - today.getDate()) + 31) % 31;
    if (diff <= 7) return { level: 'orange', label: diff === 0 ? 'Due today' : `Due in ${diff}d`, cls: 'warn' };
    return { level: 'green', label: 'Stable', cls: 'ok' };
  }

  return { MAX_MONTHS, estimateApr, order, simulate, baseline, monthLabel, flag };
})();
if (typeof module !== 'undefined') module.exports = DebtEngine;
