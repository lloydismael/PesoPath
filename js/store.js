/* PesoPath — data store (localStorage) */
const Store = (() => {
  const KEY = 'pesopath:v1';
  let state = null;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthKey = (iso) => iso.slice(0, 7);
  const shiftMonth = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const dateIn = (ym, day) => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${ym}-${pad(Math.min(day, last))}`;
  };

  /** Onboarding state. active = guide is running; welcome = show first-run chooser */
  const newOnboard = (o = {}) => ({ active: true, welcome: false, demo: false, panel: false, done: {}, skipped: {}, finished: false, ...o });

  const CATEGORIES = [
    ['Salary', '💼', '#16a34a', 'income'],
    ['Side Income', '💡', '#22c55e', 'income'],
    ['Housing', '🏠', '#f97316', 'needs'],
    ['Food', '🍽️', '#22c55e', 'needs'],
    ['Transport', '🚗', '#3b82f6', 'needs'],
    ['Utilities', '💡', '#eab308', 'needs'],
    ['Health', '🩺', '#14b8a6', 'needs'],
    ['Subscriptions', '▶️', '#8b5cf6', 'wants'],
    ['Wants', '🛍️', '#ec4899', 'wants'],
    ['Debt Payment', '💳', '#ef4444', 'savings'],
    ['Installments', '📦', '#f43f5e', 'savings'],
    ['Savings', '🐷', '#0ea5e9', 'savings'],
  ];
  const defaultSettings = () => ({
    name: '', currency: '₱', paydays: [15, 30], monthlyIncome: 0, strategy: 'avalanche', customOrder: [],
    extra: 0, starterEF: 20000, theme: 'light', privacy: false, rollover: false, pin: '',
  });

  /** Brand-new, empty workspace (used on first run and "Start fresh") */
  function emptyState(onboard) {
    return {
      version: 1,
      settings: { ...defaultSettings(), onboard: newOnboard(onboard) },
      accounts: [], transactions: [], debts: [], installments: [], goals: [], bills: [], budgets: {}, wishlist: [],
      categories: CATEGORIES.map(([name, icon, color, group]) => ({ id: uid(), name, icon, color, group })),
    };
  }

  /* ---------- Demo seed ---------- */
  function seed() {
    const cur = monthKey(todayISO());
    const today = new Date().getDate();
    const st = emptyState({ active: false, demo: true });
    const cats = st.categories;
    const C = Object.fromEntries(cats.map((c) => [c.name, c.id]));

    const accounts = [
      { id: uid(), name: 'BPI Savings', type: 'bank', opening: 30000 },
      { id: uid(), name: 'GCash', type: 'ewallet', opening: 6500 },
      { id: uid(), name: 'Maya', type: 'ewallet', opening: 3200 },
      { id: uid(), name: 'Cash', type: 'cash', opening: 2500 },
    ];
    const A = Object.fromEntries(accounts.map((a) => [a.name, a.id]));

    const tx = [];
    const add = (ym, day, type, amount, cat, acc, note, toAcc) =>
      tx.push({ id: uid(), type, amount, categoryId: C[cat] || null, accountId: A[acc], toAccountId: toAcc ? A[toAcc] : null, date: dateIn(ym, day), note: note || '' });

    for (let i = 5; i >= 0; i--) {
      const ym = shiftMonth(cur, -i);
      const isCur = i === 0;
      const v = 1 + ((i * 7) % 5) / 25;
      const rows = [
        [15, 'income', 25000, 'Salary', 'BPI Savings', 'Payroll'],
        [30, 'income', 25000, 'Salary', 'BPI Savings', 'Payroll'],
        [5, 'expense', 10000, 'Housing', 'BPI Savings', 'Rent'],
        [3, 'expense', Math.round(1600 * v), 'Food', 'GCash', 'Groceries'],
        [10, 'expense', Math.round(1900 * v), 'Food', 'GCash', 'Groceries'],
        [17, 'expense', Math.round(1400 * v), 'Food', 'Cash', 'Eat out'],
        [6, 'expense', Math.round(1200 * v), 'Transport', 'Maya', 'Fuel'],
        [19, 'expense', Math.round(1100 * v), 'Transport', 'Maya', 'Grab'],
        [15, 'expense', Math.round(2000 * v), 'Utilities', 'BPI Savings', 'Meralco'],
        [17, 'expense', 1800, 'Utilities', 'BPI Savings', 'PLDT Home'],
        [20, 'expense', 549, 'Subscriptions', 'GCash', 'Netflix'],
        [24, 'expense', 149, 'Subscriptions', 'GCash', 'Spotify'],
        [12, 'expense', Math.round(2200 * v * (isCur ? 1.4 : 1)), 'Wants', 'GCash', 'Shopee'],
        [8, 'expense', 5000, 'Debt Payment', 'BPI Savings', 'Card payment'],
        [1, 'transfer', 6000, null, 'BPI Savings', 'Top-up GCash', 'GCash'],
        [1, 'transfer', 2500, null, 'BPI Savings', 'Top-up Maya', 'Maya'],
        [1, 'transfer', 1500, null, 'BPI Savings', 'Cash withdrawal', 'Cash'],
      ];
      rows.forEach(([d, ...r]) => { if (!isCur || d <= today) add(ym, d, ...r); });
      if (!isCur && i % 2 === 0) add(ym, 22, 'income', 4000, 'Side Income', 'GCash', 'Freelance');
    }

    const debts = [
      { name: 'BPI Credit Card', type: 'credit_card', balance: 35000, apr: 36, minPayment: 1750, dueDay: Math.min(28, today + 4) },
      { name: 'Maya Credit', type: 'bnpl', balance: 12000, apr: 30, minPayment: 1200, dueDay: 22 },
      { name: 'Personal Loan', type: 'personal_loan', balance: 60000, apr: 18, minPayment: 3200, dueDay: 10 },
      { name: 'Salary Loan', type: 'salary_loan', balance: 45000, apr: 10, minPayment: 2500, dueDay: 15 },
      { name: 'Car Loan', type: 'car_loan', balance: 80000, apr: 6, minPayment: 4500, dueDay: 5 },
    ].map((d) => ({ id: uid(), overdue: false, original: Math.round(d.balance * 1.35), ...d }));

    const expectedBy = (start, dueDay, terms) => {
      const [y, m] = start.split('-').map(Number); const [cy, cm] = cur.split('-').map(Number);
      return Math.max(0, Math.min(terms, (cy - y) * 12 + (cm - m) + (today >= dueDay ? 1 : 0)));
    };
    const installments = [
      { name: 'iPhone 16', provider: 'Home Credit', icon: '📱', principal: 54990, monthly: 5200, terms: 12, start: shiftMonth(cur, -7), dueDay: 12, lag: 0 },
      { name: 'Gaming Laptop', provider: 'BPI Card 0%', icon: '💻', principal: 48000, monthly: 2000, terms: 24, start: shiftMonth(cur, -10), dueDay: 18, lag: 0 },
      { name: 'Inverter Aircon', provider: 'SPayLater', icon: '❄️', principal: 27000, monthly: 2450, terms: 12, start: shiftMonth(cur, -3), dueDay: 3, lag: 1 },
      { name: 'Washing Machine', provider: 'Home Credit', icon: '🧺', principal: 11500, monthly: 2100, terms: 6, start: shiftMonth(cur, -8), dueDay: 25, lag: 0 },
    ].map(({ lag, ...it }) => ({ id: uid(), accountId: A['BPI Savings'], ...it, paidTerms: Math.max(0, expectedBy(it.start, it.dueDay, it.terms) - lag) }));
    const windowStart = shiftMonth(cur, -5);
    installments.forEach((it) => {
      for (let i = 0; i < it.paidTerms; i++) {
        const ym = shiftMonth(it.start, i);
        if (ym < windowStart) continue;
        tx.push({ id: uid(), type: 'expense', amount: it.monthly, categoryId: C.Installments, accountId: it.accountId, toAccountId: null, date: dateIn(ym, it.dueDay), note: `${it.name} ${i + 1}/${it.terms}`, installmentId: it.id, instTerms: 1 });
      }
    });

    const goals = [
      { id: uid(), name: 'Emergency Fund', icon: '🛡️', target: 60000, saved: 10000, deadline: '', emergency: true },
      { id: uid(), name: 'Christmas / 13th Month', icon: '🎁', target: 30000, saved: 15000, deadline: `${cur.slice(0, 4)}-12-15`, emergency: false },
      { id: uid(), name: 'New Laptop', icon: '💻', target: 50000, saved: 20000, deadline: '', emergency: false },
    ];

    const bills = [
      { name: 'Rent', amount: 10000, dueDay: 5, categoryId: C.Housing, subscription: false },
      { name: 'Meralco', amount: 2000, dueDay: 15, categoryId: C.Utilities, subscription: false },
      { name: 'PLDT Home', amount: 1800, dueDay: 17, categoryId: C.Utilities, subscription: false },
      { name: 'Netflix', amount: 549, dueDay: 20, categoryId: C.Subscriptions, subscription: true },
      { name: 'Spotify', amount: 149, dueDay: 24, categoryId: C.Subscriptions, subscription: true },
    ].map((b) => ({ id: uid(), accountId: A['BPI Savings'], paid: {}, ...b }));
    bills.forEach((b) => { if (b.dueDay <= today) b.paid[cur] = true; });

    const budgets = {
      [C.Housing]: 10000, [C.Food]: 7000, [C.Transport]: 4000, [C.Utilities]: 4000,
      [C.Subscriptions]: 1000, [C.Wants]: 3000, [C.Health]: 1500, [C['Debt Payment']]: 13150, [C.Installments]: 9650, [C.Savings]: 5000,
    };

    Object.assign(st.settings, { name: 'Juan', monthlyIncome: 50000, extra: 2000 });
    return Object.assign(st, { accounts, transactions: tx, debts, installments, goals, bills, budgets });
  }

  /** Upgrade data saved by older versions */
  function migrate(s) {
    if (!s.installments) s.installments = [];
    if (!s.categories.some((c) => c.name === 'Installments')) s.categories.push({ id: uid(), name: 'Installments', icon: '📦', color: '#f43f5e', group: 'savings' });
    s.settings = { ...defaultSettings(), ...s.settings };
    if (!s.settings.onboard) {
      // existing users with data skip the guide; empty workspaces get it
      const empty = !s.accounts.length && !s.transactions.length;
      s.settings.onboard = newOnboard({ active: empty, finished: !empty });
    }
    s.settings.onboard = newOnboard(s.settings.onboard);
    return s;
  }

  let firstRun = false;
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || state.version !== 1) { state = emptyState({ welcome: true }); firstRun = true; }
    migrate(state); save();
    return state;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  /** reset('demo') loads demo data; reset('empty') starts a fresh guided setup */
  function reset(mode) {
    state = mode === 'demo' ? seed() : emptyState({ active: true, panel: true });
    save();
  }
  function replace(newState) { state = migrate(newState); save(); }

  /* ---------- Selectors ---------- */
  const get = () => state;
  const cat = (id) => state.categories.find((c) => c.id === id);
  const catByName = (n) => state.categories.find((c) => c.name === n);
  const acct = (id) => state.accounts.find((a) => a.id === id);

  function accountBalance(id) {
    const a = acct(id); if (!a) return 0;
    return state.transactions.reduce((bal, t) => {
      if (t.type === 'income' && t.accountId === id) return bal + t.amount;
      if (t.type === 'expense' && t.accountId === id) return bal - t.amount;
      if (t.type === 'transfer') {
        if (t.accountId === id) bal -= t.amount;
        if (t.toAccountId === id) bal += t.amount;
      }
      return bal;
    }, Number(a.opening) || 0);
  }
  const totalAssets = () => state.accounts.reduce((s, a) => s + accountBalance(a.id), 0) + state.goals.reduce((s, g) => s + (Number(g.saved) || 0), 0);
  const liquid = () => state.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  const totalDebt = () => state.debts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const installmentBalance = () => state.installments.reduce((s, it) => s + Installments.stats(it).remaining, 0);
  const installmentMonthly = () => state.installments.reduce((s, it) => s + (Installments.stats(it).done ? 0 : +it.monthly), 0);
  const netWorth = () => totalAssets() - totalDebt() - installmentBalance();

  const txInMonth = (ym) => state.transactions.filter((t) => monthKey(t.date) === ym);
  function monthTotals(ym) {
    const list = txInMonth(ym);
    const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }
  /** Best estimate of monthly income: logged this/last month, else the profile value */
  function expectedIncome(ym) {
    // the profile income is the planned monthly total; logged income may be just one paycheck so far
    return Math.max(monthTotals(ym).income, +state.settings.monthlyIncome || 0) || monthTotals(shiftMonth(ym, -1)).income || 0;
  }
  function spendByCategory(ym) {
    const m = {};
    txInMonth(ym).filter((t) => t.type === 'expense').forEach((t) => { m[t.categoryId] = (m[t.categoryId] || 0) + t.amount; });
    return m;
  }
  function budgetFor(catId, ym) {
    const base = Number(state.budgets[catId]) || 0;
    if (!state.settings.rollover || !base) return base;
    const spentPrev = spendByCategory(shiftMonth(ym, -1))[catId] || 0;
    return base + Math.max(0, base - spentPrev);
  }
  function avgMonthlyExpense(ym, months = 3) {
    let s = 0, n = 0;
    for (let i = 1; i <= months; i++) { const t = monthTotals(shiftMonth(ym, -i)); if (t.expense) { s += t.expense; n++; } }
    return n ? s / n : monthTotals(ym).expense;
  }

  /* ---------- Mutations ---------- */
  function upsert(coll, item) {
    const list = state[coll];
    if (item.id) { const i = list.findIndex((x) => x.id === item.id); if (i >= 0) list[i] = { ...list[i], ...item }; else list.push(item); }
    else { item.id = uid(); list.push(item); }
    save(); return item;
  }
  function remove(coll, id) {
    if (coll === 'transactions') {
      const t = state.transactions.find((x) => x.id === id);
      if (t && t.debtId) { const d = state.debts.find((x) => x.id === t.debtId); if (d) d.balance += t.amount; }
      if (t && t.goalId) { const g = state.goals.find((x) => x.id === t.goalId); if (g) g.saved = Math.max(0, g.saved - t.amount); }
      if (t && t.installmentId) { const it = state.installments.find((x) => x.id === t.installmentId); if (it) it.paidTerms = Math.max(0, it.paidTerms - (t.instTerms || 1)); }
    }
    state[coll] = state[coll].filter((x) => x.id !== id);
    save();
  }
  function payDebt(debtId, amount, accountId, date) {
    const d = state.debts.find((x) => x.id === debtId); if (!d) return;
    const amt = Math.min(amount, d.balance);
    d.balance = Math.round((d.balance - amt) * 100) / 100;
    d.overdue = false;
    const c = catByName('Debt Payment');
    state.transactions.push({ id: uid(), type: 'expense', amount: amt, categoryId: c ? c.id : null, accountId, toAccountId: null, date: date || todayISO(), note: `Payment – ${d.name}`, debtId });
    save();
  }
  function payInstallment(id, count, accountId, date) {
    const it = state.installments.find((x) => x.id === id); if (!it) return;
    const n = Math.max(1, Math.min(count, it.terms - it.paidTerms)); if (n <= 0) return;
    const from = it.paidTerms + 1;
    it.paidTerms += n;
    const c = catByName('Installments');
    state.transactions.push({ id: uid(), type: 'expense', amount: +it.monthly * n, categoryId: c ? c.id : null, accountId: accountId || it.accountId, toAccountId: null, date: date || todayISO(),
      note: `${it.name} ${n === 1 ? from : from + '–' + (from + n - 1)}/${it.terms}`, installmentId: id, instTerms: n });
    save();
  }
  function contributeGoal(goalId, amount, accountId, date) {
    const g = state.goals.find((x) => x.id === goalId); if (!g) return;
    g.saved = (Number(g.saved) || 0) + amount;
    const c = catByName('Savings');
    state.transactions.push({ id: uid(), type: 'expense', amount, categoryId: c ? c.id : null, accountId, toAccountId: null, date: date || todayISO(), note: `Saved to ${g.name}`, goalId });
    save();
  }
  function payBill(billId, ym) {
    const b = state.bills.find((x) => x.id === billId); if (!b) return;
    b.paid = b.paid || {};
    b.paid[ym] = true;
    state.transactions.push({ id: uid(), type: 'expense', amount: b.amount, categoryId: b.categoryId, accountId: b.accountId || (state.accounts[0] && state.accounts[0].id), toAccountId: null, date: dateIn(ym, Math.min(b.dueDay, new Date().getDate())), note: b.name });
    save();
  }

  return {
    load, save, reset, replace, get, uid, todayISO, monthKey, shiftMonth, dateIn, isFirstRun: () => firstRun,
    cat, catByName, acct, accountBalance, totalAssets, liquid, totalDebt, installmentBalance, installmentMonthly, netWorth,
    txInMonth, monthTotals, expectedIncome, spendByCategory, budgetFor, avgMonthlyExpense,
    upsert, remove, payDebt, payInstallment, contributeGoal, payBill,
  };
})();
