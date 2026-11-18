/* PesoPath — installment engine (pure functions, Node-testable) */
const Installments = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return ymOf(d); };
  const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
  const dueDate = (ym, day) => { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return new Date(y, m - 1, Math.min(+day, last)); };

  function stats(it, today = new Date()) {
    const terms = Math.max(1, +it.terms || 1);
    const paid = Math.min(Math.max(0, +it.paidTerms || 0), terms);
    const monthly = +it.monthly || 0;
    const total = monthly * terms, paidAmt = monthly * paid, remaining = total - paidAmt;
    const principal = +it.principal || total;
    const interest = Math.max(0, total - principal);
    const addOnRate = principal > 0 ? (interest / principal / terms) * 100 : 0;
    const endYm = addMonths(it.start, terms - 1);
    let expected = monthsBetween(it.start, ymOf(today)) + (today.getDate() >= dueDate(ymOf(today), it.dueDay).getDate() ? 1 : 0);
    expected = Math.max(0, Math.min(terms, expected));
    const behind = Math.max(0, expected - paid);
    const ahead = Math.max(0, paid - expected);
    const done = paid >= terms;
    const nextYm = done ? null : addMonths(it.start, paid);
    const nextDue = done ? null : dueDate(nextYm, it.dueDay);
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysToNext = nextDue ? Math.round((nextDue - t0) / 864e5) : null;
    const pct = Math.round((paid / terms) * 100);
    const status = done ? 'done' : behind > 0 ? 'late' : daysToNext !== null && daysToNext <= 7 ? 'due' : ahead > 0 ? 'ahead' : 'ontrack';
    return { terms, paid, left: terms - paid, monthly, total, paidAmt, remaining, principal, interest, addOnRate, endYm, expected, behind, ahead, done, nextYm, nextDue, daysToNext, pct, status };
  }

  function cells(it, today = new Date()) {
    const s = stats(it, today);
    return Array.from({ length: s.terms }, (_, i) => ({
      i: i + 1, ym: addMonths(it.start, i),
      state: i < s.paid ? 'paid' : i < s.expected ? 'late' : i === s.paid ? 'next' : 'future',
    }));
  }

  function forecast(list, fromYm, months = 12) {
    const out = Array.from({ length: months }, (_, k) => ({ ym: addMonths(fromYm, k), total: 0, parts: {} }));
    list.forEach((it) => {
      const s = stats(it);
      for (let i = s.paid; i < s.terms; i++) {
        const k = Math.max(0, monthsBetween(fromYm, addMonths(it.start, i)));
        if (k < months) { out[k].parts[it.id] = (out[k].parts[it.id] || 0) + s.monthly; out[k].total += s.monthly; }
      }
    });
    return out;
  }

  return { stats, cells, forecast, addMonths, monthsBetween, dueDate, ymOf };
})();
if (typeof module !== 'undefined') module.exports = Installments;
