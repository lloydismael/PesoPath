/* PesoPath — app shell: routing, actions, forms */
(() => {
  const { $, esc, form, toast, confirm, openModal, closeModal } = UI;
  Store.load();
  const S = () => Store.get();
  const ui = { ym: Store.monthKey(Store.todayISO()) };

  const ROUTES = {
    dashboard: ['🏠', 'Dashboard', 'Your money at a glance'],
    transactions: ['🧾', 'Transactions', 'Track every peso in and out'],
    budget: ['🎯', 'Budget', 'Give every peso a job'],
    debts: ['💳', 'Debts', 'Your path to debt freedom'],
    installments: ['📦', 'Installments', 'Track every hulugan until it’s fully paid'],
    goals: ['🐷', 'Goals', 'Emergency fund, sinking funds & wishlist'],
    bills: ['📅', 'Bills', 'Due dates & subscriptions'],
    reports: ['📊', 'Reports', 'Insights, trends & forecast'],
    accounts: ['🏦', 'Accounts', 'Banks, e-wallets, cash & categories'],
    settings: ['⚙️', 'Settings', 'Preferences, backup & privacy'],
    more: ['☰', 'More', ''],
  };
  const BOTTOM = ['dashboard', 'transactions', 'debts', 'installments', 'more'];
  const route = () => { const r = location.hash.replace('#/', ''); return ROUTES[r] ? r : 'dashboard'; };

  /* ---------- Render ---------- */
  function render() {
    const r = route(), s = S();
    document.documentElement.dataset.theme = s.settings.theme;
    document.body.classList.toggle('privacy', !!s.settings.privacy);
    const lateCount = s.installments.filter((it) => Installments.stats(it).behind > 0).length;
    $('#nav').innerHTML = Object.entries(ROUTES).filter(([k]) => k !== 'more').map(([k, [i, l]]) => `<a class="nav-link ${k === r ? 'active' : ''}" href="#/${k}"><span>${i}</span>${l}${k === 'installments' && lateCount ? ` <span class="badge bad" style="margin-left:auto">${lateCount}</span>` : ''}</a>`).join('');
    $('#bottomNav').innerHTML = BOTTOM.map((k) => `<a class="${k === r || (k === 'more' && !BOTTOM.includes(r)) ? 'active' : ''}" href="#/${k}"><span>${ROUTES[k][0]}</span>${k === 'dashboard' ? 'Home' : ROUTES[k][1]}</a>`).join('');
    $('#pageTitle').textContent = ROUTES[r][1];
    $('#pageSub').textContent = ROUTES[r][2];
    $('#monthLabel').textContent = UI.monthName(ui.ym);
    $('#privacyBtn').textContent = s.settings.privacy ? '👁 Show' : '🙈 Privacy';
    $('#themeBtn').textContent = s.settings.theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    $('#view').innerHTML = Views[r](ui.ym, ui);
    if (r === 'settings') bindSettings();
    Guide.afterRender();
  }
  const refresh = (msg) => { render(); if (msg) toast(msg); };

  /* ---------- Option helpers ---------- */
  const accOpts = () => S().accounts.map((a) => [a.id, `${Views.ACC_ICON[a.type] || ''} ${a.name}`]);
  const catOpts = (type) => S().categories.filter((c) => (type === 'income' ? c.group === 'income' : c.group !== 'income')).map((c) => [c.id, `${c.icon} ${c.name}`]);
  /** No account yet? Guide the user to add one instead of failing silently */
  const needAccount = () => {
    if (S().accounts.length) return false;
    toast('First, add where your money is 🏦');
    Guide.start('account');
    return true;
  };

  /* ---------- Budget suggestion (50/30/20, respects bills, debts & installments) ---------- */
  function suggestBudget() {
    const s = S(), inc = Store.expectedIncome(ui.ym); if (!inc) return null;
    const by = (n) => Store.catByName(n);
    const billsIn = (n) => { const c = by(n); return c ? s.bills.filter((b) => b.categoryId === c.id).reduce((a, b) => a + +b.amount, 0) : 0; };
    const needs = inc * 0.5, wants = inc * 0.3, save = inc * 0.2;
    const debtMin = s.debts.filter((d) => d.balance > 0).reduce((a, d) => a + +d.minPayment, 0), inst = Store.installmentMonthly();
    const r50 = (x) => Math.max(0, Math.round(x / 50) * 50);
    const out = {}, set = (n, v) => { const c = by(n); if (c) out[c.id] = r50(v); };
    set('Housing', Math.max(billsIn('Housing'), needs * 0.4)); set('Food', needs * 0.3); set('Transport', needs * 0.15);
    set('Utilities', Math.max(billsIn('Utilities'), needs * 0.1)); set('Health', needs * 0.05);
    const subs = Math.max(billsIn('Subscriptions'), wants * 0.1);
    let wantsLeft = wants - subs, savings = save - debtMin - inst, warn = '';
    if (savings < 0) { wantsLeft += savings; savings = 0; warn = `Your debt minimums + installments (${UI.money(debtMin + inst)}) are more than 20% of income, so we took the difference from “Wants”.`; }
    if (wantsLeft < 0) { wantsLeft = 0; warn = `⚠️ Debt + installment payments (${UI.money(debtMin + inst)}) are very high for your income. Avoid new debt and consider extra income or restructuring.`; }
    set('Subscriptions', subs); set('Wants', wantsLeft); set('Debt Payment', debtMin); set('Installments', inst); set('Savings', savings);
    return { inc, out, warn, debtMin, inst };
  }

  /* ---------- Actions ---------- */
  const A = {
    go: (id) => { location.hash = '#/' + id; },
    tab: (id, el) => { ui[el.dataset.key] = id; render(); },

    /* Setup guide */
    openProfile: () => profileForm(),
    guideStart: (id) => Guide.start(id),
    restartGuide: () => (Guide.isActive() ? Guide.openPanel() : Guide.restart()),
    startOwn: () => confirm('Remove the demo data and start your own guided setup?', () => { Store.reset('empty'); location.hash = '#/dashboard'; render(); Guide.start('profile'); }, 'Start my setup'),

    addTx: () => txForm(null),
    editTx: (id) => txForm(S().transactions.find((t) => t.id === id)),
    delTx: (id) => confirm('Delete this transaction?', () => { Store.remove('transactions', id); refresh('Transaction deleted'); }),

    setBudget: (id) => { const c = Store.cat(id); form({ title: `Monthly budget · ${c.icon} ${c.name}`, fields: [{ name: 'amount', label: 'Amount per month', type: 'number', value: S().budgets[id] || '', min: 0 }], onSubmit: (v) => { S().budgets[id] = v.amount; Store.save(); refresh('Budget saved'); } }); },
    autoBudget: () => {
      const sug = suggestBudget();
      if (!sug) { toast('Tell us your monthly income first'); return profileForm(); }
      const cats = S().categories.filter((c) => c.group !== 'income');
      const grp = { needs: 'Needs · 50%', wants: 'Wants · 30%', savings: 'Savings & debt · 20%' };
      form({ title: '✨ Your suggested budget', submitLabel: 'Apply budget', wide: true,
        intro: `<div class="callout" style="margin-bottom:12px">Based on <b>${UI.money(sug.inc)}</b>/month: Needs ${UI.money(sug.inc * 0.5)} · Wants ${UI.money(sug.inc * 0.3)} · Savings & debt ${UI.money(sug.inc * 0.2)}.<br><small>Bills you added set the minimum for their category. Debt Payment = your minimums; Installments = your monthly amortizations.</small></div>${sug.warn ? `<div class="tip" style="margin-bottom:12px">${sug.warn}</div>` : ''}`,
        fields: cats.map((c) => ({ name: c.id, label: `${c.icon} ${c.name} (${grp[c.group] || c.group})`, type: 'number', value: sug.out[c.id] ?? (S().budgets[c.id] || 0), min: 0, half: true })),
        onChange: (v) => { const t = Object.values(v).reduce((a, x) => a + (+x || 0), 0), d = sug.inc - t; return `<div class="callout">Total budgeted <b>${UI.money(t)}</b> of ${UI.money(sug.inc)} · ${d === 0 ? '✅ every peso has a job' : d > 0 ? `<span class="pos">${UI.money(d)} unassigned</span>` : `<span class="neg">${UI.money(-d)} over income</span>`}</div>`; },
        onSubmit: (v) => { Object.entries(v).forEach(([id, amt]) => { S().budgets[id] = +amt || 0; }); Store.save(); refresh('Budget applied 🎯'); } });
    },
    toggleRollover: () => { S().settings.rollover = !S().settings.rollover; Store.save(); refresh(); },
    addCat: () => catForm(), editCat: (id) => catForm(Store.cat(id)),

    afford: () => form({ title: '🤔 Can I afford this?', submitLabel: 'Check', fields: [{ name: 'name', label: 'What is it?', placeholder: 'e.g. New shoes' }, { name: 'price', label: 'Price', type: 'number', required: true, min: 1 }, { name: 'cat', label: 'Category', type: 'select', options: catOpts('expense'), value: (Store.catByName('Wants') || {}).id }],
      onSubmit: (v) => { setTimeout(() => affordResult(v), 0); } }),

    addDebt: () => debtForm(), editDebt: (id) => debtForm(S().debts.find((d) => d.id === id)),
    delDebt: (id) => confirm('Delete this debt?', () => { Store.remove('debts', id); refresh('Debt deleted'); }),
    payDebt: (id) => { if (needAccount()) return; const d = S().debts.find((x) => x.id === id); form({ title: `Pay ${d.name}`, submitLabel: 'Record payment', fields: [{ name: 'amount', label: `Amount (balance ${d.balance.toLocaleString()})`, type: 'number', value: d.minPayment, required: true, min: 1 }, { name: 'acc', label: 'Pay from', type: 'select', options: accOpts() }, { name: 'date', label: 'Date', type: 'date', value: Store.todayISO() }],
      onSubmit: (v) => { Store.payDebt(id, v.amount, v.acc, v.date); const left = S().debts.find((x) => x.id === id).balance; refresh(left <= 0 ? `🎉 ${d.name} is PAID OFF!` : 'Payment recorded'); } }); },
    payDebtPick: () => { const act = S().debts.filter((d) => d.balance > 0); if (!act.length) return S().debts.length ? toast('No active debts 🎉') : Guide.start('debts'); A.payDebt(DebtEngine.order(act, S().settings.strategy, S().settings.customOrder)[0].id); },
    setStrategy: (_, el) => { S().settings.strategy = el.value; Guide.markDone('strategy'); Store.save(); refresh(`Strategy set to ${el.value}`); },
    moveDebt: (id, el) => { const s = S().settings, ordered = DebtEngine.order(S().debts, 'custom', s.customOrder).map((d) => d.id); const i = ordered.indexOf(id), j = i + Number(el.dataset.dir); if (j < 0 || j >= ordered.length) return; [ordered[i], ordered[j]] = [ordered[j], ordered[i]]; s.customOrder = ordered; Store.save(); render(); },
    saveExtra: (id) => { S().settings.extra = Number(id); Store.save(); refresh('Extra payment saved to your plan'); },

    addInst: () => instForm(), editInst: (id) => instForm(S().installments.find((x) => x.id === id)),
    delInst: (id) => confirm('Delete this installment? (Past payment transactions are kept.)', () => { S().transactions.forEach((t) => { if (t.installmentId === id) delete t.installmentId; }); Store.remove('installments', id); refresh('Installment deleted'); }),
    payInst: (id) => {
      if (needAccount()) return;
      const it = S().installments.find((x) => x.id === id), st = Installments.stats(it);
      if (st.done) return toast('Already fully paid 🎉');
      const opts = [[1, `1 term (${st.paid + 1}/${st.terms})`]];
      if (st.behind > 1) opts.push([st.behind, `Catch up: ${st.behind} late terms`]);
      if (st.left > 1) opts.push([st.left, `Pay off all ${st.left} remaining terms`]);
      form({ title: `Pay ${it.icon || ''} ${it.name}`, submitLabel: 'Record payment',
        intro: st.behind ? `<div class="tip" style="margin-bottom:12px;background:var(--bad-50)">⚠️ ${st.behind} term(s) overdue. Paying now stops further late fees.</div>` : '',
        fields: [{ name: 'count', label: 'How many terms?', type: 'select', options: opts, value: st.behind > 1 ? st.behind : 1 }, { name: 'acc', label: 'Pay from', type: 'select', options: accOpts(), value: it.accountId }, { name: 'date', label: 'Date', type: 'date', value: Store.todayISO() }],
        onChange: (v) => { const n = +v.count; const after = Math.min(st.terms, st.paid + n); return `<div class="callout">Amount: <b>${UI.money(n * st.monthly)}</b><div style="margin:8px 0">${UI.progress(UI.pct(after, st.terms))}</div><small>After this: ${after}/${st.terms} paid (${UI.pct(after, st.terms)}%) · ${UI.money((st.terms - after) * st.monthly)} remaining</small></div>`; },
        onSubmit: (v) => { Store.payInstallment(id, +v.count, v.acc, v.date); const ns = Installments.stats(S().installments.find((x) => x.id === id)); refresh(ns.done ? `🎉 ${it.name} is FULLY PAID!` : `Paid · ${ns.paid}/${ns.terms} done`); } });
    },

    addGoal: (id) => goalForm(null, id === 'ef'), editGoal: (id) => goalForm(S().goals.find((g) => g.id === id)),
    delGoal: (id) => confirm('Delete this goal?', () => { Store.remove('goals', id); refresh(); }),
    contribute: (id) => { if (needAccount()) return; const g = S().goals.find((x) => x.id === id); form({ title: `Add money to ${g.name}`, fields: [{ name: 'amount', label: 'Amount', type: 'number', required: true, min: 1 }, { name: 'acc', label: 'From account', type: 'select', options: accOpts() }], onSubmit: (v) => { Store.contributeGoal(id, v.amount, v.acc); refresh(g.saved >= g.target ? `🎉 Goal reached: ${g.name}!` : 'Saved!'); } }); },
    addWish: () => form({ title: 'Add to cooling-off wishlist', fields: [{ name: 'name', label: 'Item', required: true }, { name: 'price', label: 'Price', type: 'number', required: true }], onSubmit: (v) => { S().wishlist.push({ id: Store.uid(), ...v, added: Date.now() }); Store.save(); refresh('Added. Revisit in 24 hours.'); } }),
    delWish: (id) => { S().wishlist = S().wishlist.filter((w) => w.id !== id); Store.save(); refresh('Removed from wishlist 💪'); },

    addBill: () => billForm(), editBill: (id) => billForm(S().bills.find((b) => b.id === id)),
    delBill: (id) => confirm('Remove this bill/subscription?', () => { Store.remove('bills', id); refresh('Removed'); }),
    payBill: (id, el) => { if (needAccount()) return; Store.payBill(id, el.dataset.ym || ui.ym); refresh('Bill marked as paid'); },

    addAccount: () => accountForm(), editAccount: (id) => accountForm(Store.acct(id)),
    delAccount: (id) => { if (S().transactions.some((t) => t.accountId === id || t.toAccountId === id)) return toast('Account has transactions – delete those first'); confirm('Delete this account?', () => { Store.remove('accounts', id); refresh(); }); },
    transfer: (id) => { if (S().accounts.length < 2) return toast('Add a second account to transfer between them'); form({ title: 'Transfer between accounts', fields: [{ name: 'from', label: 'From', type: 'select', options: accOpts(), value: id }, { name: 'to', label: 'To', type: 'select', options: accOpts(), value: S().accounts.find((a) => a.id !== id).id }, { name: 'amount', label: 'Amount', type: 'number', required: true, min: 1 }, { name: 'date', label: 'Date', type: 'date', value: Store.todayISO() }],
      onSubmit: (v) => { if (v.from === v.to) { toast('Pick two different accounts'); return false; } Store.upsert('transactions', { type: 'transfer', amount: v.amount, accountId: v.from, toAccountId: v.to, categoryId: null, date: v.date, note: 'Transfer' }); refresh('Transfer saved'); } }); },

    exportCsv: () => {
      const rows = [['Date', 'Type', 'Category', 'Account', 'To Account', 'Amount', 'Note']].concat(S().transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.type, (Store.cat(t.categoryId) || {}).name || '', (Store.acct(t.accountId) || {}).name || '', (Store.acct(t.toAccountId) || {}).name || '', t.amount, t.note || '']));
      UI.download(`pesopath-transactions-${Store.todayISO()}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    },
    importCsv: () => { if (needAccount()) return; openModal('Import bank statement (CSV)', `<div class="form"><p class="muted">CSV with headers <b>Date, Description, Amount</b> (optional <b>Category</b>). Negative amounts = expenses, positive = income. Dates as YYYY-MM-DD.</p>
      <label class="field">Account<select id="impAcc">${accOpts().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><input type="file" id="impFile" accept=".csv,text/csv"/><div class="row-actions"><button class="btn primary" id="impGo">Import</button></div></div>`, (b) => {
      $('#impGo', b).onclick = () => { const f = $('#impFile', b).files[0]; if (!f) return toast('Choose a file'); const acc = $('#impAcc', b).value; f.text().then((txt) => { const n = importCsv(txt, acc); closeModal(); refresh(`Imported ${n} transaction(s)`); }); };
    }); },
    exportJson: () => UI.download(`pesopath-backup-${Store.todayISO()}.json`, JSON.stringify(S(), null, 2), 'application/json'),
    importJson: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => inp.files[0].text().then((t) => { try { const d = JSON.parse(t); if (!d.settings || !d.transactions) throw 0; Store.replace(d); refresh('Backup restored'); } catch (e) { toast('Invalid backup file'); } }); inp.click(); },
    resetDemo: () => confirm('Replace everything with demo data?', () => { Store.reset('demo'); location.hash = '#/dashboard'; refresh('Demo data loaded'); }),
    resetEmpty: () => confirm('Delete ALL data and start a fresh guided setup?', () => { Store.reset('empty'); location.hash = '#/dashboard'; render(); Guide.start('profile'); }, 'Clear & start setup'),
    setPin: () => form({ title: 'PIN lock', fields: [{ name: 'pin', label: 'New 4–6 digit PIN (leave blank to remove)', type: 'password' }], onSubmit: (v) => { if (v.pin && !/^\d{4,6}$/.test(v.pin)) { toast('PIN must be 4–6 digits'); return false; } S().settings.pin = v.pin || ''; Store.save(); refresh(v.pin ? 'PIN set' : 'PIN removed'); } }),
  };

  /* ---------- Forms ---------- */
  function profileForm() {
    const st = S().settings;
    const preset = ['15,30', '5,20', '10,25', '30', '15'];
    const cur = st.paydays.join(',');
    form({ title: '👤 About you', submitLabel: 'Save & continue', guideKey: 'profile',
      intro: '<p class="muted" style="margin:0 0 12px">This helps PesoPath suggest a budget and plan around your paydays. You can change it later in Settings.</p>',
      fields: [
        { name: 'name', label: 'Your first name', value: st.name, placeholder: 'e.g. Juan' },
        { name: 'monthlyIncome', label: 'Monthly take-home income', type: 'number', value: st.monthlyIncome || '', required: true, min: 1, placeholder: 'e.g. 35000' },
        { name: 'payFreq', label: 'When do you get paid?', type: 'select', value: preset.includes(cur) ? cur : 'custom',
          options: [['15,30', 'Twice a month — 15th & 30th (kinsenas)'], ['5,20', 'Twice a month — 5th & 20th'], ['10,25', 'Twice a month — 10th & 25th'], ['30', 'Once a month — 30th'], ['15', 'Once a month — 15th'], ['custom', 'Other days…']] },
        { name: 'paydaysCustom', label: 'Paydays (day of month, comma separated)', value: preset.includes(cur) ? '' : cur, placeholder: 'e.g. 7, 22', show: (v) => v.payFreq === 'custom' },
        { name: 'currency', label: 'Currency symbol', value: st.currency, half: true },
        { name: 'starterEF', label: 'Starter emergency fund goal', type: 'number', value: st.starterEF, half: true, min: 0 },
      ],
      onSubmit: (v) => {
        const raw = v.payFreq === 'custom' ? v.paydaysCustom : v.payFreq;
        const pd = raw.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 31);
        if (!pd.length) { toast('Enter at least one payday (1–31)'); return false; }
        Object.assign(st, { name: v.name.trim(), monthlyIncome: v.monthlyIncome, paydays: pd, currency: v.currency.trim() || '₱', starterEF: v.starterEF || 0 });
        Guide.markDone('profile'); Store.save();
        refresh(`Nice to meet you${st.name ? ', ' + st.name : ''}! 👋`);
      } });
  }
  function txForm(t) {
    if (needAccount()) return;
    const isEdit = !!(t && t.id);
    const type = (t && t.type) || 'expense';
    const s = S().settings;
    form({
      title: isEdit ? 'Edit transaction' : 'Add transaction',
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: [['expense', '➖ Expense'], ['income', '➕ Income'], ['transfer', '🔁 Transfer']], value: type },
        { name: 'amount', label: 'Amount', type: 'number', value: t ? t.amount : '', required: true, min: 0.01, half: true, placeholder: !t && s.monthlyIncome ? `e.g. ${Math.round(s.monthlyIncome / Math.max(1, s.paydays.length))}` : '' },
        { name: 'date', label: 'Date', type: 'date', value: t ? t.date : Store.todayISO(), required: true, half: true },
        { name: 'categoryId', label: 'Category', type: 'select', options: catOpts('expense'), value: t && t.categoryId, show: (v) => v.type === 'expense' },
        { name: 'incomeCat', label: 'Income source', type: 'select', options: catOpts('income'), value: t && t.categoryId, show: (v) => v.type === 'income' },
        { name: 'accountId', label: 'Account', type: 'select', options: accOpts(), value: t && t.accountId },
        { name: 'toAccountId', label: 'To account', type: 'select', options: accOpts(), value: t && t.toAccountId, show: (v) => v.type === 'transfer' },
        { name: 'note', label: 'Note', value: t ? t.note : '', placeholder: 'e.g. Groceries at SM, Salary' },
        { name: 'recurring', label: 'Make this recurring monthly (adds it to Bills)', type: 'checkbox', show: (v) => v.type === 'expense' && !isEdit },
      ],
      onSubmit: (v) => {
        if (v.type === 'transfer' && v.accountId === v.toAccountId) { toast('Pick two different accounts'); return false; }
        const rec = { type: v.type, amount: v.amount, date: v.date, accountId: v.accountId, note: v.note.trim(), categoryId: v.type === 'expense' ? v.categoryId : v.type === 'income' ? v.incomeCat : null, toAccountId: v.type === 'transfer' ? v.toAccountId : null };
        if (!rec.note && v.type === 'income') rec.note = (Store.cat(v.incomeCat) || {}).name || 'Income';
        if (isEdit) rec.id = t.id;
        Store.upsert('transactions', rec);
        if (v.recurring) { const c = Store.cat(v.categoryId); Store.upsert('bills', { name: v.note || (c ? c.name : 'Bill'), amount: v.amount, dueDay: +v.date.slice(8), categoryId: v.categoryId, accountId: v.accountId, subscription: c && c.name === 'Subscriptions', paid: { [v.date.slice(0, 7)]: true } }); }
        checkOverspend(rec);
        refresh(isEdit ? 'Transaction updated' : 'Transaction added');
      },
    });
  }
  function checkOverspend(t) {
    if (t.type !== 'expense' || !t.categoryId) return;
    const ym = t.date.slice(0, 7), b = Store.budgetFor(t.categoryId, ym); if (!b) return;
    const p = UI.pct(Store.spendByCategory(ym)[t.categoryId] || 0, b), c = Store.cat(t.categoryId);
    if (p >= 100) setTimeout(() => toast(`🔴 ${c.name} is over budget (${p}%)`), 2400);
    else if (p >= 80) setTimeout(() => toast(`🟠 ${c.name} budget at ${p}%`), 2400);
  }
  function instForm(it) {
    if (needAccount()) return;
    form({ title: it ? 'Edit installment' : 'Add installment',
      intro: it ? '' : '<div class="tip" style="margin-bottom:12px">💡 For gadgets, appliances, furniture etc. bought via Home Credit, SPayLater, BillEase, Atome or credit-card installment.</div>',
      fields: [
        { name: 'name', label: 'Item', value: it && it.name, required: true, placeholder: 'e.g. iPhone 16, Ref, Sofa' },
        { name: 'icon', label: 'Emoji', value: (it && it.icon) || '📦', half: true },
        { name: 'provider', label: 'Provider', value: it && it.provider, placeholder: 'Home Credit, SPayLater…', half: true },
        { name: 'principal', label: 'Cash price', type: 'number', value: it && it.principal, required: true, min: 1, half: true },
        { name: 'monthly', label: 'Monthly amortization', type: 'number', value: it && it.monthly, required: true, min: 1, half: true },
        { name: 'terms', label: 'Terms (months)', type: 'number', value: it ? it.terms : 12, required: true, min: 1, max: 120, step: 1, half: true },
        { name: 'dueDay', label: 'Due day of month', type: 'number', value: it ? it.dueDay : 15, required: true, min: 1, max: 31, step: 1, half: true },
        { name: 'start', label: 'First payment month', type: 'month', value: it ? it.start : Store.monthKey(Store.todayISO()), required: true, half: true },
        { name: 'paidTerms', label: 'Terms already paid', type: 'number', value: it ? it.paidTerms : 0, min: 0, step: 1, half: true },
        { name: 'accountId', label: 'Usually paid from', type: 'select', options: accOpts(), value: it && it.accountId },
      ],
      onChange: (v) => {
        if (!v.monthly || !v.terms || !v.start) return '';
        const st = Installments.stats({ ...v, paidTerms: Math.min(v.paidTerms, v.terms) });
        return `<div class="callout"><div style="display:flex;justify-content:space-between"><span>Total you’ll pay</span><b>${UI.money(st.total)}</b></div>
          <div style="display:flex;justify-content:space-between"><span>Interest / markup</span><b class="${st.interest ? 'neg' : 'pos'}">${st.interest ? UI.money(st.interest) + ` (${st.addOnRate.toFixed(2)}%/mo)` : '0% ✅'}</b></div>
          <div style="display:flex;justify-content:space-between"><span>Last payment</span><b>${UI.monthName(st.endYm)}</b></div>
          <div style="margin-top:8px">${UI.progress(st.pct)}</div><small>${st.paid}/${st.terms} paid${st.behind ? ` · <span class="neg">${st.behind} behind schedule</span>` : ''}</small></div>`;
      },
      onSubmit: (v) => {
        if (v.paidTerms > v.terms) { toast('Paid terms can’t exceed total terms'); return false; }
        if (v.dueDay < 1 || v.dueDay > 31) { toast('Due day must be 1–31'); return false; }
        if (v.monthly * v.terms < v.principal) { toast('Monthly × terms is less than the cash price — check the numbers'); return false; }
        Store.upsert('installments', { ...(it ? { id: it.id } : {}), ...v, terms: Math.round(v.terms), paidTerms: Math.round(v.paidTerms), dueDay: Math.round(v.dueDay) });
        refresh('Installment saved');
      } });
  }
  function catForm(c) {
    form({ title: c ? 'Edit category' : 'New category', fields: [{ name: 'name', label: 'Name', value: c && c.name, required: true }, { name: 'icon', label: 'Emoji icon', value: (c && c.icon) || '🏷️', half: true }, { name: 'color', label: 'Color', type: 'color', value: (c && c.color) || '#16a34a', half: true }, { name: 'group', label: 'Group', type: 'select', options: [['needs', 'Needs'], ['wants', 'Wants'], ['savings', 'Savings & debt'], ['income', 'Income']], value: c && c.group }],
      extraButtons: c ? `<button type="button" class="btn danger" id="delCat">Delete</button>` : '',
      onSubmit: (v) => { Store.upsert('categories', { ...(c ? { id: c.id } : {}), ...v }); refresh('Category saved'); } });
    if (c) $('#delCat').onclick = () => { if (S().transactions.some((t) => t.categoryId === c.id)) return toast('Category is in use'); Store.remove('categories', c.id); delete S().budgets[c.id]; Store.save(); closeModal(); refresh('Category deleted'); };
  }
  function debtForm(d) {
    form({ title: d ? 'Edit debt' : 'Add debt',
      intro: d ? '' : '<div class="tip" style="margin-bottom:12px">💡 Monthly rate × 12 = APR. e.g. 3%/month ≈ 36% APR. Not sure? Credit cards ≈ 36%, lending apps 36–60%, salary loans ≈ 10–12%.</div>',
      fields: [
        { name: 'name', label: 'Creditor / name', value: d && d.name, required: true, placeholder: 'e.g. BPI Credit Card' },
        { name: 'type', label: 'Type', type: 'select', options: Object.entries(Views.DEBT_TYPES), value: d && d.type },
        { name: 'balance', label: 'Current balance', type: 'number', value: d && d.balance, required: true, min: 0, half: true },
        { name: 'apr', label: 'Interest rate (APR % per year)', type: 'number', value: d && d.apr, required: true, min: 0, half: true },
        { name: 'minPayment', label: 'Minimum monthly payment', type: 'number', value: d && d.minPayment, required: true, min: 0, half: true },
        { name: 'dueDay', label: 'Due day of month', type: 'number', value: (d && d.dueDay) || 15, required: true, min: 1, step: 1, half: true },
        { name: 'overdue', label: 'Currently overdue / in collections', type: 'checkbox', value: d && d.overdue },
      ], onSubmit: (v) => {
        if (v.dueDay < 1 || v.dueDay > 31) { toast('Due day must be 1–31'); return false; }
        const tip = v.apr > 0 && v.minPayment <= (v.balance * v.apr) / 1200 ? ' ⚠️ Minimum doesn’t cover interest!' : '';
        Store.upsert('debts', { ...(d ? { id: d.id, original: Math.max(+d.original || 0, v.balance) } : { original: v.balance }), ...v });
        refresh((d ? 'Debt saved' : 'Debt added — add another or continue') + tip);
      } });
  }
  function goalForm(g, emergency) {
    const avg = Store.avgMonthlyExpense(ui.ym) || (+S().settings.monthlyIncome * 0.8);
    form({ title: g ? 'Edit goal' : emergency ? 'Create emergency fund' : 'New goal', fields: [
      { name: 'name', label: 'Goal name', value: g ? g.name : emergency ? 'Emergency Fund' : '', required: true },
      { name: 'icon', label: 'Emoji', value: (g && g.icon) || (emergency ? '🛡️' : '🎯'), half: true },
      { name: 'deadline', label: 'Target date (optional)', type: 'date', value: g && g.deadline, half: true },
      { name: 'target', label: 'Target amount', type: 'number', value: g ? g.target : emergency ? Math.round((avg * 3) / 1000) * 1000 || 60000 : '', required: true, min: 1, half: true },
      { name: 'saved', label: 'Already saved', type: 'number', value: g ? g.saved : 0, min: 0, half: true },
    ], onSubmit: (v) => { Store.upsert('goals', { ...(g ? { id: g.id } : { emergency: !!emergency }), ...v }); refresh('Goal saved'); } });
  }
  function billForm(b) {
    form({ title: b ? 'Edit bill' : 'Add bill / subscription', fields: [
      { name: 'name', label: 'Name', value: b && b.name, required: true, placeholder: 'e.g. Meralco' },
      { name: 'amount', label: 'Amount', type: 'number', value: b && b.amount, required: true, half: true },
      { name: 'dueDay', label: 'Due day', type: 'number', value: (b && b.dueDay) || 15, required: true, min: 1, step: 1, half: true },
      { name: 'categoryId', label: 'Category', type: 'select', options: catOpts('expense'), value: (b && b.categoryId) || (Store.catByName('Housing') || {}).id },
      { name: 'accountId', label: 'Paid from', type: 'select', options: accOpts(), value: b && b.accountId },
      { name: 'subscription', label: 'This is a subscription (Netflix, Spotify…)', type: 'checkbox', value: b && b.subscription },
    ], onSubmit: (v) => {
      if (v.dueDay < 1 || v.dueDay > 31) { toast('Due day must be 1–31'); return false; }
      Store.upsert('bills', { ...(b ? { id: b.id } : { paid: {} }), ...v }); refresh(b ? 'Bill saved' : 'Bill added — add another or continue');
    } });
    // Smart category guess from the bill name (until the user picks one themselves)
    const f = $('#mform'); let touched = !!b;
    f.elements.categoryId.addEventListener('change', (e) => { if (e.isTrusted) touched = true; });
    const RULES = [[/rent|upa|condo|apartment|dorm|amortization|association/i, 'Housing', false], [/meralco|electric|veco|water|maynilad|manila water|pldt|globe|smart|converge|sky|internet|wifi|fiber|gas|lpg|postpaid/i, 'Utilities', false],
      [/netflix|spotify|youtube|disney|hbo|prime|apple|icloud|google one|viu|iwant|canva|chatgpt|gym/i, 'Subscriptions', true], [/insurance|philhealth|hmo|maxicare|medicine/i, 'Health', false], [/tuition|school/i, 'Housing', false]];
    f.elements.name.addEventListener('input', () => {
      if (touched) return;
      const hit = RULES.find(([re]) => re.test(f.elements.name.value)); if (!hit) return;
      const c = Store.catByName(hit[1]); if (!c) return;
      f.elements.categoryId.value = c.id; f.elements.subscription.checked = hit[2];
      f.elements.categoryId.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function accountForm(a) {
    form({ title: a ? 'Edit account' : 'Add account', fields: [
      { name: 'name', label: 'Account name', value: a && a.name, required: true, placeholder: 'e.g. BDO Savings, GCash' },
      { name: 'type', label: 'Type', type: 'select', options: [['bank', '🏦 Bank'], ['ewallet', '📱 E-wallet'], ['cash', '💵 Cash'], ['other', '📁 Other']], value: a && a.type },
      { name: 'opening', label: 'Current balance', type: 'number', value: a ? a.opening : '', placeholder: '0' },
    ], onSubmit: (v) => { Store.upsert('accounts', { ...(a ? { id: a.id } : {}), ...v }); refresh('Account saved'); } });
  }

  function affordResult(v) {
    const s = S(), ym = Store.monthKey(Store.todayISO());
    const b = Store.budgetFor(v.cat, ym), sp = Store.spendByCategory(ym)[v.cat] || 0, left = b - sp;
    const tot = Store.monthTotals(ym), free = Store.expectedIncome(ym) - tot.expense;
    const ef = s.goals.find((g) => g.emergency), efOk = ef && ef.saved >= s.settings.starterEF;
    const highDebt = s.debts.some((d) => d.balance > 0 && d.apr >= 24);
    const lateInst = s.installments.some((it) => Installments.stats(it).behind > 0);
    const checks = [
      [b ? left >= v.price : false, b ? `Category budget left: ${UI.money(left)}` : 'No budget set for this category'],
      [free >= v.price, `Left to spend this month: ${UI.money(free)}`],
      [efOk, efOk ? 'Starter emergency fund is in place' : 'Starter emergency fund not complete'],
      [!highDebt, highDebt ? 'You still have high-interest (24%+) debt' : 'No high-interest debt'],
      [!lateInst, lateInst ? 'You have late installment payments' : 'All installments are on schedule'],
    ];
    const score = checks.filter((c) => c[0]).length;
    const verdict = score === checks.length ? ['ok', '✅ Yes, you can afford it.'] : score >= 3 ? ['warn', '🟠 Maybe — wait 24h and decide.'] : ['bad', '🔴 Not right now.'];
    openModal(`${v.name || 'This purchase'} · ${S().settings.currency}${Number(v.price).toLocaleString()}`, `<div class="callout" style="font-size:16px"><span class="badge ${verdict[0]}" style="font-size:14px">${verdict[1]}</span></div>
      <div class="list" style="margin-top:8px">${checks.map(([ok, t]) => `<div class="item"><span>${ok ? '✅' : '❌'}</span><div class="grow">${t}</div></div>`).join('')}</div>
      <div class="row-actions" style="margin-top:12px"><button class="btn ghost" id="toWish">Add to 24h wishlist</button><button class="btn primary" id="okBtn">Got it</button></div>`, (b2) => {
      $('#okBtn', b2).onclick = closeModal;
      $('#toWish', b2).onclick = () => { S().wishlist.push({ id: Store.uid(), name: v.name || 'Item', price: v.price, added: Date.now() }); Store.save(); closeModal(); refresh('Added to wishlist'); };
    });
  }

  function importCsv(txt, acc) {
    const lines = txt.trim().split(/\r?\n/); if (lines.length < 2) return 0;
    const split = (l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    const head = split(lines[0]).map((h) => h.toLowerCase());
    const di = head.findIndex((h) => h.includes('date')), ni = head.findIndex((h) => /desc|note|details|particular/.test(h)), ai = head.findIndex((h) => h.includes('amount')), ci = head.findIndex((h) => h.includes('category'));
    if (di < 0 || ai < 0) { toast('CSV needs Date and Amount columns'); return 0; }
    let n = 0;
    lines.slice(1).forEach((l) => {
      const c = split(l); const amt = parseFloat(String(c[ai]).replace(/[^\d.-]/g, '')); const d = new Date(c[di]);
      if (!isFinite(amt) || isNaN(d)) return;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const cat = ci >= 0 ? S().categories.find((x) => x.name.toLowerCase() === String(c[ci]).toLowerCase()) : null;
      S().transactions.push({ id: Store.uid(), type: amt < 0 ? 'expense' : 'income', amount: Math.abs(amt), categoryId: cat ? cat.id : null, accountId: acc, toAccountId: null, date: iso, note: ni >= 0 ? c[ni] : '' });
      n++;
    });
    Store.save(); return n;
  }

  function bindSettings() {
    $('#settingsForm').onsubmit = (e) => {
      e.preventDefault(); const f = e.target.elements, st = S().settings;
      st.name = f.name.value.trim(); st.currency = f.currency.value.trim() || '₱';
      st.monthlyIncome = Number(f.monthlyIncome.value) || 0;
      const pd = f.paydays.value.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 31);
      st.paydays = pd.length ? pd : [15, 30];
      st.strategy = f.strategy.value; st.extra = Number(f.extra.value) || 0; st.starterEF = Number(f.starterEF.value) || 0; st.rollover = f.rollover.checked;
      Store.save(); refresh('Preferences saved');
    };
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.type === 'range') return;
    const fn = A[el.dataset.action]; if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el.dataset.id, el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('select[data-action]')) A[el.dataset.action](el.dataset.id, el);
    if (el.matches('[data-filter]')) { ui.txFilter = { ...(ui.txFilter || { type: '', cat: '', q: '' }), [el.dataset.filter]: el.value }; render(); }
    if (el.matches('input[type=range][data-action="simExtra"]')) { ui.simExtra = Number(el.value); render(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('input[type=range][data-action="simExtra"]')) $('#simVal').innerHTML = UI.money(el.value);
    if (el.matches('input[data-filter="q"]')) { clearTimeout(el._t); el._t = setTimeout(() => { ui.txFilter = { ...(ui.txFilter || { type: '', cat: '' }), q: el.value }; render(); const n = $('input[data-filter="q"]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); }
  });
  const canClose = () => !document.body.dataset.locked && $('#modalClose').hidden === false;
  $('#modalClose').onclick = () => { if (canClose()) closeModal(); };
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && canClose()) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && canClose()) closeModal(); });
  $('#prevMonth').onclick = () => { ui.ym = Store.shiftMonth(ui.ym, -1); render(); };
  $('#nextMonth').onclick = () => { ui.ym = Store.shiftMonth(ui.ym, 1); render(); };
  $('#quickAdd').onclick = () => A.addTx();
  $('#privacyBtn').onclick = () => { S().settings.privacy = !S().settings.privacy; Store.save(); render(); };
  $('#themeBtn').onclick = () => { S().settings.theme = S().settings.theme === 'dark' ? 'light' : 'dark'; Store.save(); render(); };
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

  /* ---------- PIN lock ---------- */
  function lock(after) {
    document.body.dataset.locked = '1';
    openModal('🔒 Enter PIN', `<form class="form" id="pinForm"><input type="password" inputmode="numeric" name="pin" placeholder="PIN" autofocus/><button class="btn primary block">Unlock</button></form>`, (b) => {
      $('#pinForm', b).onsubmit = (e) => { e.preventDefault(); if (e.target.pin.value === S().settings.pin) { delete document.body.dataset.locked; closeModal(); if (after) after(); } else toast('Wrong PIN'); };
    }, { noClose: true });
  }

  /* ---------- Boot ---------- */
  Guide.init({ ui, render, A });
  render();
  const boot = () => { if (S().settings.onboard.welcome) Guide.welcome(); };
  if (S().settings.pin) lock(boot); else boot();
  window.PesoPath = { Store, DebtEngine, Installments, Guide, render };
})();
