/* PesoPath — page views (each returns HTML; actions are wired via data-action) */
const Views = (() => {
  const { money, esc, pct, progress, shortDate, monthName, monthShort } = UI;
  const S = () => Store.get();
  const QUOTES = ['Discipline today, freedom tomorrow.', 'Every peso needs a job.', 'Small steps today. A debt-free tomorrow.', 'Don’t save what is left after spending; spend what is left after saving.', 'A better you is a debt-free you.'];
  const ACC_ICON = { bank: '🏦', ewallet: '📱', cash: '💵', credit_card: '💳', other: '📁' };
  const DEBT_TYPES = { credit_card: 'Credit card', bnpl: 'BNPL / Lending app', personal_loan: 'Personal loan', salary_loan: 'Salary loan', car_loan: 'Car loan', housing: 'Housing (Pag-IBIG)', informal: 'Family / informal', other: 'Other' };
  const INST_COLORS = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#14b8a6'];
  const INST_STATUS = { done: ['ok', '✅ Completed'], late: ['bad', 'Late'], due: ['warn', 'Due soon'], ahead: ['info', 'Ahead'], ontrack: ['ok', 'On track'] };

  const emergencyGoal = () => S().goals.find((g) => g.emergency);
  const nowYm = () => Store.monthKey(Store.todayISO());
  const instList = () => S().installments.map((it, i) => ({ it, st: Installments.stats(it), color: INST_COLORS[i % INST_COLORS.length] }));
  const instDueIn = (ym) => S().installments.filter((it) => { const k = Installments.monthsBetween(it.start, ym); return k >= 0 && k < +it.terms; });
  const emptyCta = (icon, text, action, label, id = '') => `<div class="empty"><div style="font-size:34px">${icon}</div>${text}<br><button class="btn primary" data-action="${action}" ${id ? `data-id="${id}"` : ''}>${label}</button></div>`;

  function advisorSteps(ym) {
    const s = S(), debts = s.debts.filter((d) => d.balance > 0);
    const income = Store.expectedIncome(ym);
    const mins = debts.reduce((a, d) => a + +d.minPayment, 0) + Store.installmentMonthly();
    const lateInst = instList().some((x) => x.st.behind > 0);
    const ef = emergencyGoal(), efSaved = ef ? +ef.saved : 0;
    const avgExp = Store.avgMonthlyExpense(ym);
    const steps = [
      { t: 'Pay the minimum on every debt & installment', d: 'Avoids late fees, penalties and credit damage.', done: (debts.length === 0 || mins <= income) && !debts.some((d) => d.overdue) && !lateInst },
      { t: `Build a starter emergency fund (${money(s.settings.starterEF)})`, d: 'So new emergencies don’t become new debt.', done: efSaved >= s.settings.starterEF },
      { t: 'Kill high-interest debt (24%+ APR)', d: 'Credit cards, BNPL, online lending apps.', done: !debts.some((d) => d.apr >= 24) },
      { t: 'Clear overdue / penalty-bearing accounts', d: 'Collections, legal-risk debts, late installments.', done: !debts.some((d) => d.overdue) && !lateInst },
      { t: 'Pay off medium-interest debt (10–23% APR)', d: 'Personal and salary loans.', done: !debts.some((d) => d.apr >= 10 && d.apr < 24) },
      { t: 'Pay off low-interest debt (<10% APR)', d: 'Pag-IBIG housing, car loans.', done: debts.length === 0 },
      { t: `Full emergency fund (3–6 months ≈ ${money(avgExp * 3)}–${money(avgExp * 6)})`, d: 'Your safety net.', done: efSaved >= avgExp * 3 && avgExp > 0 },
      { t: 'Invest & build wealth', d: 'MP2, index funds, retirement.', done: false },
    ];
    const nowIdx = steps.findIndex((x) => !x.done);
    return steps.map((x, i) => ({ ...x, now: i === nowIdx }));
  }

  function debtPlan(extraOverride) {
    const s = S().settings;
    return DebtEngine.simulate(S().debts, { strategy: s.strategy, extra: extraOverride ?? +s.extra, customOrder: s.customOrder });
  }

  function upcomingBills(days = 7) {
    const today = new Date(), out = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      S().bills.forEach((b) => { if (Math.min(b.dueDay, last) === d.getDate() && !(b.paid || {})[ym]) out.push({ ...b, inDays: i, ym, kind: 'bill' }); });
      S().debts.forEach((db) => { if (db.balance > 0 && Math.min(db.dueDay, last) === d.getDate()) out.push({ id: db.id, name: db.name, amount: db.minPayment, inDays: i, kind: 'debt' }); });
    }
    instList().forEach(({ it, st }) => {
      if (st.done) return;
      if (st.behind > 0) out.push({ id: it.id, name: `${it.name} (${st.behind} late)`, amount: st.behind * st.monthly, inDays: 0, overdue: true, kind: 'inst' });
      else if (st.daysToNext <= days) out.push({ id: it.id, name: `${it.name} ${st.paid + 1}/${st.terms}`, amount: st.monthly, inDays: Math.max(0, st.daysToNext), kind: 'inst' });
    });
    return out.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || a.inDays - b.inDays);
  }

  function txRow(t) {
    const c = Store.cat(t.categoryId), a = Store.acct(t.accountId), to = Store.acct(t.toAccountId);
    const sign = t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : '';
    const label = t.type === 'transfer' ? `Transfer → ${to ? to.name : '?'}` : (c ? c.name : 'Uncategorized');
    return `<div class="item transaction-item"><div class="ico" style="background:${c ? c.color + '22' : 'var(--info-50)'}">${t.type === 'transfer' ? '🔁' : c ? c.icon : '❔'}</div>
      <div class="grow"><div class="title">${esc(t.note || label)}</div><small>${esc(label)} · ${esc(a ? a.name : '—')} · ${shortDate(t.date)}</small></div>
      <div class="${sign}" style="font-weight:700">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${money(t.amount)}</div>
      <div class="row-actions"><button class="icon-btn" data-action="editTx" data-id="${t.id}" aria-label="Edit transaction ${esc(t.note || label)}" title="Edit">✎</button><button class="icon-btn" data-action="delTx" data-id="${t.id}" aria-label="Delete transaction ${esc(t.note || label)}" title="Delete">🗑</button></div></div>`;
  }

  function payButton(b) {
    if (b.kind === 'bill') return `<button class="btn sm" data-action="payBill" data-id="${b.id}" data-ym="${b.ym}">Pay</button>`;
    if (b.kind === 'inst') return `<button class="btn sm ${b.overdue ? 'danger' : ''}" data-action="payInst" data-id="${b.id}">Pay</button>`;
    return `<button class="btn sm" data-action="payDebt" data-id="${b.id}">Pay</button>`;
  }

  /* ---------- Dashboard ---------- */
  function dashboard(ym) {
    const s = S(), ob = s.settings.onboard, tot = Store.monthTotals(ym);
    const assets = Store.totalAssets(), debt = Store.totalDebt(), instBal = Store.installmentBalance();
    const totalBudget = Object.keys(s.budgets).reduce((a, id) => a + Store.budgetFor(id, ym), 0);
    const used = pct(tot.expense, totalBudget);
    const plan = debtPlan();
    const steps = advisorSteps(ym), now = steps.find((x) => x.now);
    const bills = upcomingBills(7);
    const recent = s.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const orig = s.debts.reduce((a, d) => a + (+d.original || +d.balance), 0);
    const insts = instList().filter((x) => !x.st.done);
    const setup = Guide.isActive();

    let top = '';
    if (ob.demo) top += `<div class="demo-banner"><span>👀 <b>You’re exploring demo data.</b> These are sample numbers, not yours.</span><button class="btn primary sm" data-action="startOwn">🚀 Start my own setup</button></div>`;
    if (setup) top += `<div class="grid g2" style="margin-bottom:16px;align-items:start">${Guide.heroHtml()}<div class="card"><div class="card-head"><h3>🧭 Setup checklist</h3><small>Most important first</small></div><div style="max-height:420px;overflow:auto;padding-right:4px">${Guide.checklistHtml()}</div></div></div>`;
    else top += `<p class="muted" style="margin:-8px 0 14px">${greet}${s.settings.name ? ', <b>' + esc(s.settings.name) + '</b>' : ''} 👋 Stay on track. You got this!</p>`;

    const budgetCard = totalBudget
      ? `<div style="display:flex;gap:16px;align-items:center">${UI.ring(used)}<div><div style="font-size:20px;font-weight:700">${money(tot.expense)}</div><small>of ${money(totalBudget)} budgeted</small><div style="margin-top:8px">${used >= 100 ? '<span class="badge bad">Over budget</span>' : used >= 80 ? '<span class="badge warn">Careful – 80%+</span>' : '<span class="badge ok">On track</span>'}</div></div></div>`
      : emptyCta('🎯', 'No budget yet.', 'go', '✨ Create my budget', 'budget');
    const debtCard = !s.debts.length
      ? (ob.skipped.debts ? '<div class="callout">🎉 No debts — focus on your emergency fund and goals.</div>' : emptyCta('💳', 'Add your debts to see your debt-free date.', 'go', '＋ Add debts', 'debts'))
      : debt <= 0 ? '<div class="callout">🎉 You are debt-free!</div>'
      : plan.feasible ? `<div style="font-size:26px;font-weight:800">${plan.months} <small style="font-size:14px">months</small></div>
          <small>Debt-free by <b>${DebtEngine.monthLabel(plan.months)}</b> using <b>${s.settings.strategy}</b> + ${money(s.settings.extra)}/mo extra</small>
          <div style="margin-top:10px">${progress(pct(orig - debt, orig))}</div><small>${pct(orig - debt, orig)}% of original debt paid</small>`
      : '<div class="tip">⚠️ Payments don’t cover interest. Increase minimums or extra payment.</div>';

    return `${top}
    <div class="grid g4">
      <div class="card stat hero"><div class="label">Net worth</div><div class="value">${money(Store.netWorth())}</div><small>Assets ${money(assets)} · Debts ${money(debt)} · Installments ${money(instBal)}</small></div>
      <div class="card stat"><div class="label">Income · ${monthName(ym)}</div><div class="value pos">${money(tot.income)}</div>${!tot.income && s.settings.monthlyIncome ? `<small>Expected ${money(s.settings.monthlyIncome)}</small>` : ''}</div>
      <div class="card stat"><div class="label">Expenses</div><div class="value neg">${money(tot.expense)}</div></div>
      ${tot.income > 0 ? `<div class="card stat"><div class="label">Left to spend</div><div class="value" style="color:var(--info)">${money(tot.income - tot.expense)}</div><small>Income − expenses this month</small></div>`
        : `<div class="card stat"><div class="label">Cash on hand</div><div class="value" style="color:var(--info)">${money(Store.liquid())}</div><small>No income logged yet this month</small></div>`}
    </div>

    <div class="grid g3" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>Budget used</h3><a href="#/budget">Details ›</a></div>${budgetCard}</div>
      <div class="card"><div class="card-head"><h3>🏁 Debt-free countdown</h3><a href="#/debts">Plan ›</a></div>${debtCard}</div>
      <div class="card">
        <div class="card-head"><h3>👉 Your next best step</h3><a href="#/debts">Why ›</a></div>
        ${setup ? '<div class="empty"><div style="font-size:34px">🧭</div>Finish the setup checklist to get personalized advice.</div>' : `
        ${now ? `<div class="callout"><b>${now.t}</b><br><small>${now.d}</small></div>` : ''}
        <small style="display:block;margin-top:10px">${steps.filter((x) => x.done).length} of ${steps.length} steps complete</small>
        <div style="margin-top:6px">${progress(pct(steps.filter((x) => x.done).length, steps.length))}</div>`}
      </div>
    </div>

    <div class="grid g3" style="margin-top:16px">
      <div class="card">
        <h3 style="margin-bottom:12px">Quick actions</h3>
        <div class="quick">
          <button data-action="addTx"><span>➕</span>Add</button>
          <button data-action="go" data-id="installments"><span>📦</span>Installments</button>
          <button data-action="payDebtPick"><span>💳</span>Pay debt</button>
          <button data-action="afford"><span>🤔</span>Afford?</button>
        </div>
        <div class="quote" style="margin-top:14px">“${QUOTES[new Date().getDate() % QUOTES.length]}” 🌱</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Due in the next 7 days</h3><a href="#/bills">All bills ›</a></div>
        <div class="list">${bills.length ? bills.map((b) => `<div class="item"><div class="ico">${b.kind === 'debt' ? '💳' : b.kind === 'inst' ? '📦' : '🧾'}</div><div class="grow"><div class="title">${esc(b.name)}</div><small class="${b.overdue ? 'neg' : ''}">${b.overdue ? 'Overdue!' : b.inDays === 0 ? 'Due today' : 'In ' + b.inDays + ' day(s)'}</small></div><b>${money(b.amount)}</b>${payButton(b)}</div>`).join('')
          : s.bills.length || s.debts.length || s.installments.length ? '<div class="empty">Nothing due. 🎉</div>' : emptyCta('🧾', 'Add bills so due dates show here.', 'go', '＋ Add bills', 'bills')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>📦 Installments</h3><a href="#/installments">View all ›</a></div>
        ${insts.length ? `<small>${money(Store.installmentMonthly())}/month · ${money(instBal)} remaining</small>
        <div style="margin-top:6px">${insts.slice(0, 4).map(({ it, st, color }) => `<div class="mini-inst"><div class="ico" style="width:34px;height:34px;background:${color}22">${esc(it.icon || '📦')}</div>
          <div style="min-width:0"><div style="display:flex;justify-content:space-between;gap:6px"><b class="title" style="font-size:13px">${esc(it.name)}</b><small>${st.paid}/${st.terms}</small></div>
          <div class="progress" style="margin-top:5px"><i style="width:${st.pct}%;background:${st.behind ? 'var(--bad)' : color}"></i></div></div>
          ${st.behind ? '<span class="badge bad">Late</span>' : `<b style="font-size:12px">${st.pct}%</b>`}</div>`).join('')}</div>`
        : '<div class="empty">No active installments 🎉</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Recent transactions</h3><a href="#/transactions">View all ›</a></div>
      <div class="list">${recent.length ? recent.map(txRow).join('') : emptyCta('🧾', 'No transactions yet.', 'addTx', '＋ Add your first transaction')}</div>
    </div>`;
  }

  /* ---------- Transactions ---------- */
  function transactions(ym, ui) {
    const f = ui.txFilter || { type: '', cat: '', q: '' };
    let list = Store.txInMonth(ym).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (f.type) list = list.filter((t) => t.type === f.type);
    if (f.cat) list = list.filter((t) => t.categoryId === f.cat);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((t) => (t.note || '').toLowerCase().includes(q)); }
    const tot = list.reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
    return `<div class="card">
      <div class="toolbar">
        <button class="btn primary sm" data-action="addTx">＋ Add</button>
        <select data-filter="type"><option value="">All types</option>${['expense', 'income', 'transfer'].map((t) => `<option ${f.type === t ? 'selected' : ''} value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select>
        <select data-filter="cat"><option value="">All categories</option>${S().categories.map((c) => `<option ${f.cat === c.id ? 'selected' : ''} value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select>
        <input data-filter="q" placeholder="Search notes…" value="${esc(f.q)}" />
        <span style="flex:1"></span>
        <button class="btn ghost sm" data-action="importCsv">⬆ Import CSV</button>
        <button class="btn ghost sm" data-action="exportCsv">⬇ Export CSV</button>
      </div>
      <small>${list.length} transaction(s) · Net ${money(tot)}</small>
      <div class="list" style="margin-top:6px">${list.length ? list.map(txRow).join('') : S().transactions.length ? '<div class="empty">No transactions for this month/filter.</div>' : '<div class="empty"><div style="font-size:34px">🧾</div>No transactions yet. Use “＋ Add” to record income or an expense.</div>'}</div>
    </div>`;
  }

  /* ---------- Budget ---------- */
  function budget(ym, ui) {
    const s = S(), tab = ui.budgetTab || 'category';
    const spent = Store.spendByCategory(ym), tot = Store.monthTotals(ym);
    const inc = Store.expectedIncome(ym);
    const cats = s.categories.filter((c) => c.group !== 'income');
    const totalBudget = cats.reduce((a, c) => a + Store.budgetFor(c.id, ym), 0);
    const totalSpent = cats.reduce((a, c) => a + (spent[c.id] || 0), 0);
    const [y, m] = ym.split('-').map(Number);
    const daysLeft = Math.max(0, new Date(y, m, 0).getDate() - (nowYm() === ym ? new Date().getDate() : 0));

    const head = `${!totalBudget ? `<div class="card setup-hero" style="margin-bottom:16px"><h3>🎯 You don’t have a budget yet</h3><small>We’ll suggest an amount for every category based on your income (${money(inc)}), debts, installments and bills using the 50/30/20 rule.</small>
        <div style="margin-top:12px"><button class="btn lg budget-suggest" data-action="autoBudget">✨ Suggest my budget</button></div></div>` : ''}
    <div class="grid g3">
      <div class="card" style="display:flex;gap:16px;align-items:center">${UI.ring(pct(totalSpent, totalBudget))}<div><div style="font-size:20px;font-weight:700">${money(totalSpent)}</div><small>of ${money(totalBudget)}</small></div></div>
      <div class="card stat"><div class="label">Remaining</div><div class="value ${totalBudget - totalSpent < 0 ? 'neg' : 'pos'}">${money(totalBudget - totalSpent)}</div><small>${daysLeft} day(s) left · ${money(Math.max(0, totalBudget - totalSpent) / Math.max(1, daysLeft))}/day</small></div>
      <div class="card stat"><div class="label">Zero-based check: income − budgeted</div><div class="value ${inc - totalBudget < 0 ? 'neg' : ''}">${money(inc - totalBudget)}</div><small>${inc - totalBudget > 0 ? 'Give these pesos a job!' : inc - totalBudget === 0 ? 'Every peso has a job ✅' : 'Budgeted more than income'}</small></div>
    </div>`;

    const tabs = `<div class="toolbar" style="margin-top:16px"><div class="tabs">${[['category', 'By Category'], ['method', 'By Method'], ['paycheck', 'By Paycheck']].map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-action="tab" data-key="budgetTab" data-id="${k}">${l}</button>`).join('')}</div><span style="flex:1"></span>
      <label class="check"><input type="checkbox" data-action="toggleRollover" ${s.settings.rollover ? 'checked' : ''}/> Roll over unused budget</label>
      ${totalBudget ? '<button class="btn sm" data-action="autoBudget">✨ Re-suggest</button>' : ''}<button class="btn sm" data-action="afford">🤔 Can I afford this?</button><button class="btn sm primary" data-action="addCat">＋ Category</button></div>`;

    let body = '';
    if (tab === 'category') {
      body = `<div class="card"><div class="list">${cats.map((c) => {
        const b = Store.budgetFor(c.id, ym), sp = spent[c.id] || 0, p = pct(sp, b);
        return `<div class="item"><div class="ico" style="background:${c.color}22">${c.icon}</div><div class="grow"><div style="display:flex;justify-content:space-between;gap:8px"><span class="title">${esc(c.name)} <span class="badge info">${c.group}</span></span><small>${money(sp)} / ${b ? money(b) : 'no budget'}</small></div>
          <div style="margin-top:6px">${progress(b ? p : 0)}</div>${b && p >= 100 ? '<small class="neg">Over budget!</small>' : b && p >= 80 ? '<small style="color:var(--warn)">80% reached</small>' : ''}</div>
          <b style="width:44px;text-align:right">${b ? p + '%' : ''}</b><button class="btn sm ghost" data-action="setBudget" data-id="${c.id}">Set</button></div>`;
      }).join('')}</div></div>`;
    } else if (tab === 'method') {
      const groups = { needs: 0, wants: 0, savings: 0 };
      cats.forEach((c) => { groups[c.group] = (groups[c.group] || 0) + (spent[c.id] || 0); });
      const base = inc || 1;
      const row = (k, label, target, desc) => { const p = pct(groups[k], base); return `<div class="item"><div class="grow"><div style="display:flex;justify-content:space-between"><b>${label}</b><small>${money(groups[k])} · ${p}% of income (target ${target}%)</small></div><div style="margin-top:6px">${progress(target ? (p / target) * 100 : 0)}</div><small>${desc}</small></div>${k === 'savings' ? (p >= target ? '<span class="badge ok">On target</span>' : '<span class="badge warn">Below target</span>') : p > target ? '<span class="badge bad">Over</span>' : '<span class="badge ok">OK</span>'}</div>`; };
      body = `<div class="grid g2"><div class="card"><h3>50 / 30 / 20 rule</h3><p class="muted">Based on ${money(inc)} income this month.</p><div class="list">
        ${row('needs', 'Needs', 50, 'Housing, food, transport, utilities, health')}${row('wants', 'Wants', 30, 'Shopping, subscriptions, dining out')}${row('savings', 'Savings & debt', 20, 'Debt payments, installments, emergency fund, goals')}</div></div>
        <div class="card"><h3>Envelope method</h3><p class="muted">Each category is an “envelope”. When it’s empty, stop spending.</p><div class="list">${cats.filter((c) => Store.budgetFor(c.id, ym)).map((c) => { const left = Store.budgetFor(c.id, ym) - (spent[c.id] || 0); return `<div class="item"><span>✉️</span><div class="grow">${c.icon} ${esc(c.name)}</div><b class="${left < 0 ? 'neg' : 'pos'}">${money(left)} left</b></div>`; }).join('') || '<div class="empty">Set a budget to fill your envelopes.</div>'}</div></div></div>`;
    } else {
      const pd = s.settings.paydays.map(Number).sort((a, b) => a - b);
      const last = new Date(y, m, 0).getDate();
      const periods = pd.map((d, i) => ({ start: Math.min(d, last), end: i < pd.length - 1 ? Math.min(pd[i + 1], last) - 1 : last + Math.min(pd[0], last) - 1 }));
      body = `<div class="grid g2">${periods.map((p, i) => {
        const inPeriod = (day) => (p.end <= last ? day >= p.start && day <= p.end : day >= p.start || day <= p.end - last);
        const due = [
          ...s.bills.map((b) => ({ n: b.name, a: b.amount, d: Math.min(b.dueDay, last) })),
          ...s.debts.filter((d) => d.balance > 0).map((d) => ({ n: d.name + ' (min)', a: d.minPayment, d: Math.min(d.dueDay, last) })),
          ...instDueIn(ym).map((it) => ({ n: '📦 ' + it.name, a: it.monthly, d: Math.min(it.dueDay, last) })),
        ].filter((x) => inPeriod(x.d)).sort((a, b) => a.d - b.d);
        const sum = due.reduce((a, x) => a + +x.a, 0);
        const pay = s.transactions.filter((t) => t.type === 'income' && Store.monthKey(t.date) === ym && inPeriod(+t.date.slice(8))).reduce((a, t) => a + t.amount, 0);
        return `<div class="card"><div class="card-head"><h3>Paycheck ${i + 1} · day ${p.start}</h3><span class="badge info">covers to day ${p.end > last ? p.end - last + ' (next mo.)' : p.end}</span></div>
          <div class="grid g2"><div class="stat"><div class="label">Income received</div><div class="value pos">${money(pay)}</div></div><div class="stat"><div class="label">Bills, minimums & installments</div><div class="value neg">${money(sum)}</div></div></div>
          <div class="list" style="margin-top:8px">${due.map((x) => `<div class="item"><small style="width:46px">Day ${x.d}</small><div class="grow">${esc(x.n)}</div><b>${money(x.a)}</b></div>`).join('') || '<div class="empty">No bills in this period</div>'}</div>
          <div class="callout" style="margin-top:8px">Free to allocate: <b>${money(pay - sum)}</b></div></div>`;
      }).join('')}</div>`;
    }
    return head + tabs + body;
  }

  /* ---------- Debts ---------- */
  function debts(ym, ui) {
    const s = S(), tab = ui.debtTab || 'list';
    const active = s.debts.filter((d) => d.balance > 0);
    const total = Store.totalDebt(), mins = active.reduce((a, d) => a + +d.minPayment, 0);
    const instM = Store.installmentMonthly();
    const income = Store.expectedIncome(ym);
    const dti = pct(mins + instM, income);
    const head = `<div class="grid g4">
      <div class="card stat hero"><div class="label">Total debt</div><div class="value">${money(total)}</div><small>${active.length} active debt(s) · + ${money(Store.installmentBalance())} in installments</small></div>
      <div class="card stat"><div class="label">Monthly minimums</div><div class="value">${money(mins)}</div><small>+ ${money(instM)} installments</small></div>
      <div class="card stat"><div class="label">Debt-to-income (payments)</div><div class="value ${dti > 36 ? 'neg' : dti > 20 ? '' : 'pos'}">${dti}%</div><small>${dti > 36 ? '🔴 High – focus on payoff' : dti > 20 ? '🟠 Moderate' : '🟢 Healthy'} · incl. installments</small></div>
      <div class="card stat"><div class="label">Strategy</div><div class="value" style="text-transform:capitalize">${s.settings.strategy}</div><small>+ ${money(s.settings.extra)}/mo extra</small></div>
    </div>
    <div class="toolbar" style="margin-top:16px"><div class="tabs">${[['list', 'Debts'], ['plan', 'Payoff Plan'], ['sim', 'Simulator'], ['priority', 'What to prioritize']].map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-action="tab" data-key="debtTab" data-id="${k}">${l}</button>`).join('')}</div><span style="flex:1"></span><button class="btn primary sm" data-action="addDebt">＋ Add debt</button></div>`;

    let body = '';
    if (tab === 'list') {
      body = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Debt</th><th>Type</th><th class="num">Balance</th><th class="num">APR</th><th class="num">Minimum</th><th class="num">Due</th><th>Flag</th><th></th></tr></thead><tbody>
      ${s.debts.map((d) => { const f = DebtEngine.flag(d); const paid = pct((+d.original || +d.balance) - d.balance, +d.original || +d.balance); return `<tr><td><b>${esc(d.name)}</b><div style="width:140px;margin-top:4px">${progress(paid)}</div><small>${paid}% paid</small></td><td>${DEBT_TYPES[d.type] || d.type}</td><td class="num">${money(d.balance)}</td><td class="num">${d.apr}%</td><td class="num">${money(d.minPayment)}</td><td class="num">Day ${d.dueDay}</td><td><span class="badge ${f.cls}">${f.label}</span></td>
        <td><div class="row-actions">${d.balance > 0 ? `<button class="btn sm" data-action="payDebt" data-id="${d.id}">Pay</button>` : ''}<button class="icon-btn" data-action="editDebt" data-id="${d.id}" aria-label="Edit debt ${esc(d.name)}">✎</button><button class="icon-btn" data-action="delDebt" data-id="${d.id}" aria-label="Delete debt ${esc(d.name)}">🗑</button></div></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty"><div style="font-size:34px">💳</div>No debts yet. Click “＋ Add debt” for each credit card, loan or lending app.</td></tr>'}
      </tbody></table></div>
      <div style="margin-top:10px" class="badges"><span class="badge bad">🔴 APR ≥ 24% or overdue = Urgent</span><span class="badge warn">🟠 Due within 7 days</span><span class="badge ok">🟢 Low interest / stable</span></div>
      <div class="callout" style="margin-top:12px">📦 Fixed-term purchases (gadgets, appliances via Home Credit, SPayLater, card installments) are tracked in <a href="#/installments">Installments</a>.</div></div>`;
    } else if (tab === 'plan') {
      const plan = debtPlan();
      const ordered = DebtEngine.order(s.debts, s.settings.strategy, s.settings.customOrder);
      body = `<div class="grid g2"><div class="card">
        <div class="card-head"><h3>Recommended order</h3><select data-action="setStrategy" style="width:auto">${[['avalanche', 'Avalanche – highest interest first'], ['snowball', 'Snowball – smallest balance first'], ['custom', 'Custom order']].map(([k, l]) => `<option value="${k}" ${s.settings.strategy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="list">${ordered.map((d, i) => { const r = plan.debts.find((x) => x.id === d.id); const f = DebtEngine.flag(d); return `<div class="item"><div class="rank">${i + 1}</div><div class="grow"><div class="title">${esc(d.name)} ${i === 0 ? '<span class="badge bad">Focus here</span>' : ''}</div><small>${money(d.balance)} @ ${d.apr}% APR · <span class="badge ${f.cls}">${f.label}</span></small></div>
          <div style="text-align:right"><small>Paid off</small><div><b>${r && r.paidOffMonth ? DebtEngine.monthLabel(r.paidOffMonth) : '—'}</b></div></div>
          ${s.settings.strategy === 'custom' ? `<div style="display:flex;flex-direction:column"><button class="icon-btn" data-action="moveDebt" data-id="${d.id}" data-dir="-1" aria-label="Move ${esc(d.name)} up">▲</button><button class="icon-btn" data-action="moveDebt" data-id="${d.id}" data-dir="1" aria-label="Move ${esc(d.name)} down">▼</button></div>` : ''}</div>`; }).join('') || '<div class="empty">No active debts 🎉</div>'}</div>
        <div class="tip" style="margin-top:12px">💡 <div>Always pay the <b>minimum on all debts</b>, then throw every extra peso at #1. When it’s gone, its payment <b>rolls over</b> to #2 (snowball effect).</div></div>
      </div>
      <div class="card"><h3>Projected total debt</h3><p class="muted">${!active.length ? 'Add debts to see your projection.' : plan.feasible ? `Debt-free in <b>${plan.months} months</b> (${DebtEngine.monthLabel(plan.months)}) · Total interest ${money(plan.totalInterest)}` : 'Not feasible with current payments – increase the extra amount.'}</p>
        ${UI.line([total, ...(plan.timeline || [])], { color: '#ef4444', labels: [[0, 'Now'], [(plan.timeline || []).length, DebtEngine.monthLabel(plan.months)]] })}
        <p class="muted">Monthly debt budget: <b>${money(plan.budget || 0)}</b> (minimums ${money(mins)} + extra ${money(s.settings.extra)})</p></div></div>`;
    } else if (tab === 'sim') {
      const extra = ui.simExtra ?? +s.settings.extra;
      const base = DebtEngine.baseline(s.debts);
      const av = DebtEngine.simulate(s.debts, { strategy: 'avalanche', extra });
      const sn = DebtEngine.simulate(s.debts, { strategy: 'snowball', extra });
      const col = (title, r, note) => `<div class="card"><h4>${title}</h4><small>${note}</small>
        <div class="grid g2" style="margin-top:10px"><div class="stat"><div class="label">Debt-free</div><div class="value" style="font-size:18px">${r.feasible ? DebtEngine.monthLabel(r.months) : 'Never ⚠️'}</div><small>${r.feasible ? r.months + ' months' : ''}</small></div>
        <div class="stat"><div class="label">Interest paid</div><div class="value neg" style="font-size:18px">${money(r.totalInterest)}</div>${r !== base && base.feasible && r.feasible && base.months ? `<small class="pos">Saves ${money(base.totalInterest - r.totalInterest)} · ${base.months - r.months} mo sooner</small>` : ''}</div></div></div>`;
      body = `<div class="card"><h3>Extra monthly payment: <span id="simVal">${money(extra)}</span></h3>
        <input type="range" min="0" max="20000" step="500" value="${extra}" data-action="simExtra" />
        <div class="row-actions" style="margin-top:8px"><button class="btn sm primary" data-action="saveExtra" data-id="${extra}">Use ${money(extra)} in my plan</button></div></div>
        <div class="grid g3" style="margin-top:16px">${col('Minimums only', base, 'No extra, no rollover')}${col('🏔️ Avalanche', av, 'Highest interest first – saves the most')}${col('⛄ Snowball', sn, 'Smallest balance first – quick wins')}</div>
        <div class="card" style="margin-top:16px">${UI.bars(['Minimums', 'Avalanche', 'Snowball'], [{ label: 'Months to debt-free', color: '#3b82f6', values: [base.months, av.months, sn.months] }], 170)}</div>`;
    } else {
      const steps = advisorSteps(ym);
      body = `<div class="grid g2"><div class="card"><h3>Your debt-freedom roadmap</h3><p class="muted">Follow these in order. The highlighted step is where you are now.</p>
        <ol class="steps">${steps.map((x, i) => `<li class="${x.done ? 'done' : x.now ? 'now' : ''}"><span class="dot">${x.done ? '✓' : i + 1}</span><div>${x.t}<br><small>${x.d}</small></div></li>`).join('')}</ol></div>
        <div class="card"><h3>Debts by urgency</h3><div class="list">${active.slice().sort((a, b) => (b.overdue - a.overdue) || b.apr - a.apr).map((d) => { const f = DebtEngine.flag(d); const tier = d.overdue ? 'Overdue – fix now' : d.apr >= 24 ? 'High interest' : d.apr >= 10 ? 'Medium interest' : 'Low interest'; const mInt = (d.balance * d.apr) / 1200; return `<div class="item"><div class="ico">${f.level === 'red' ? '🔴' : f.level === 'orange' ? '🟠' : '🟢'}</div><div class="grow"><div class="title">${esc(d.name)}</div><small>${tier} · costs you ~${money(mInt)}/month in interest</small></div><b>${d.apr}%</b></div>`; }).join('') || '<div class="empty">No active debts 🎉</div>'}</div>
        <div class="tip" style="margin-top:12px">📌 <div>Lending apps & credit cards in the PH often charge 24–60%/yr. Pay those first. Low-rate loans like Pag-IBIG can wait while you build your emergency fund. Never miss an installment — late fees on BNPL add up fast.</div></div></div></div>`;
    }
    return head + body;
  }

  /* ---------- Installments ---------- */
  function segBar(it, color) {
    const cells = Installments.cells(it);
    return `<div class="segbar" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.map((c) => `<div class="seg ${c.state}" style="${c.state === 'paid' ? `background:${color}` : ''}" title="Term ${c.i} · ${monthShort(c.ym)} · ${c.state === 'paid' ? 'Paid' : c.state === 'late' ? 'LATE' : c.state === 'next' ? 'Next due' : 'Upcoming'}"></div>`).join('')}</div>`;
  }

  function instCard({ it, st, color }) {
    const [cls, label] = INST_STATUS[st.status];
    const nextTxt = st.done ? 'Done' : st.behind ? `<span class="neg">${st.behind} term(s) late</span>` : st.daysToNext === 0 ? 'Today' : `${st.nextDue.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${st.daysToNext}d`;
    return `<div class="card inst-card ${st.behind ? 'late' : ''}">
      <div class="inst-top"><div class="ico" style="background:${color}22;width:46px;height:46px;font-size:22px">${esc(it.icon || '📦')}</div>
        <div class="grow"><div class="title" style="font-size:15px">${esc(it.name)}</div><small>${esc(it.provider || '—')} · <span class="badge ${cls}">${label}</span></small></div>
        ${UI.ring(st.pct, 72, '', st.behind ? 'var(--bad)' : color)}</div>
      ${segBar(it, color)}
      <div style="display:flex;justify-content:space-between;font-size:12px"><b>${st.paid} of ${st.terms} paid</b><small>${st.left} left · ends ${monthName(st.endYm)}</small></div>
      <div class="kv">
        <div><small>Monthly</small><b>${money(st.monthly)}</b></div>
        <div><small>Paid so far</small><b class="pos">${money(st.paidAmt)}</b></div>
        <div><small>Remaining</small><b class="neg">${money(st.remaining)}</b></div>
        <div><small>Next due</small><b>${nextTxt}</b></div>
      </div>
      <small>Cash price ${money(st.principal)} · Total cost ${money(st.total)} · ${st.interest > 0 ? `<span class="neg">Interest ${money(st.interest)} (${st.addOnRate.toFixed(2)}%/mo add-on)</span>` : '<span class="pos">0% interest ✅</span>'}</small>
      <div class="row-actions">
        ${st.done ? '' : `<button class="btn sm ${st.behind ? 'danger' : 'primary'}" data-action="payInst" data-id="${it.id}">${st.behind ? `Catch up (${st.behind})` : 'Pay this month'}</button>`}
        <button class="icon-btn" data-action="editInst" data-id="${it.id}" aria-label="Edit installment ${esc(it.name)}" title="Edit">✎</button><button class="icon-btn" data-action="delInst" data-id="${it.id}" aria-label="Delete installment ${esc(it.name)}" title="Delete">🗑</button>
      </div></div>`;
  }

  function gantt(list) {
    if (!list.length) return '<div class="empty">No installments to show</div>';
    const from = list.map((x) => x.it.start).sort()[0];
    const to = list.map((x) => x.st.endYm).sort().slice(-1)[0];
    const n = Installments.monthsBetween(from, to) + 1;
    const lw = 170, w = 980, rh = 36, top = 26, h = top + rh * list.length + 8, H = h + 16;
    const cw = (w - lw - 10) / n;
    const every = Math.max(1, Math.ceil(n / 12));
    let g = '';
    for (let k = 0; k < n; k++) {
      const x = lw + k * cw;
      if (k % every === 0) g += `<text x="${x + 2}" y="14" font-size="10" style="fill:var(--muted)">${esc(monthShort(Installments.addMonths(from, k)))}</text><line x1="${x}" y1="${top - 6}" x2="${x}" y2="${h}" class="chart-axis"/>`;
    }
    list.forEach(({ it, st, color }, r) => {
      const y = top + r * rh, x0 = lw + Installments.monthsBetween(from, it.start) * cw;
      g += `<text x="0" y="${y + rh / 2 + 4}" font-size="12" font-weight="600">${esc((it.icon || '') + ' ' + it.name).slice(0, 22)}</text>`;
      g += `<rect x="${x0}" y="${y + 6}" width="${st.terms * cw}" height="${rh - 14}" rx="6" fill="${color}" opacity=".18"/>`;
      if (st.paid) g += `<rect x="${x0}" y="${y + 6}" width="${st.paid * cw}" height="${rh - 14}" rx="6" fill="${color}"/>`;
      if (st.behind) g += `<rect x="${x0 + st.paid * cw}" y="${y + 6}" width="${st.behind * cw}" height="${rh - 14}" rx="6" fill="var(--bad)" opacity=".75"><title>${st.behind} late</title></rect>`;
      g += `<text x="${x0 + st.terms * cw + 6}" y="${y + rh / 2 + 4}" font-size="11" style="fill:var(--muted)">${st.paid}/${st.terms}</text>`;
    });
    const t = new Date(), dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const tx = lw + (Installments.monthsBetween(from, nowYm()) + (t.getDate() - 1) / dim) * cw;
    if (tx >= lw && tx <= w) g += `<line x1="${tx}" y1="${top - 6}" x2="${tx}" y2="${h}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="4 3"/><text x="${tx}" y="${H - 3}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--bad)">Today</text>`;
    const rows = list.map(({ it, st }) => `<tr><th scope="row">${esc(it.name)}</th><td>${esc(monthName(it.start))}</td><td>${esc(monthName(st.endYm))}</td><td>${st.paid} / ${st.terms}</td><td>${st.behind}</td></tr>`).join('');
    return `<div class="chart-scroll timeline-chart"><svg aria-hidden="true" viewBox="0 0 ${w + 40} ${H}" width="100%">${g}</svg></div><small class="chart-scroll-hint">Scroll to see the full chart</small>
      <details class="chart-data"><summary>View timeline data</summary><div class="table-wrap"><table><thead><tr><th scope="col">Installment</th><th scope="col">Starts</th><th scope="col">Ends</th><th scope="col">Paid / total terms</th><th scope="col">Late terms</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  function installments(ym, ui) {
    const tab = ui.instTab || 'active';
    const all = instList(), active = all.filter((x) => !x.st.done), done = all.filter((x) => x.st.done);
    const total = active.reduce((a, x) => a + x.st.total, 0), paidAmt = active.reduce((a, x) => a + x.st.paidAmt, 0);
    const remaining = total - paidAmt, monthly = Store.installmentMonthly();
    const income = Store.expectedIncome(ym);
    const late = active.filter((x) => x.st.behind > 0);
    const lastEnd = active.map((x) => x.st.endYm).sort().slice(-1)[0];
    const interest = all.reduce((a, x) => a + x.st.interest, 0);
    const fc = Installments.forecast(active.map((x) => x.it), nowYm(), 12);
    const series = active.map(({ it, color }) => ({ label: it.name, color, values: fc.map((m) => m.parts[it.id] || 0) }));
    const freed = active.slice().sort((a, b) => a.st.endYm.localeCompare(b.st.endYm));

    const head = `<div class="grid g4">
      <div class="card stat hero rose"><div class="label">Remaining to pay</div><div class="value">${money(remaining)}</div><small>${active.length} active · ${done.length} completed</small></div>
      <div class="card stat"><div class="label">Monthly commitment</div><div class="value">${money(monthly)}</div><small>${income ? pct(monthly, income) + '% of income' : '—'}</small></div>
      <div class="card" style="display:flex;gap:14px;align-items:center">${UI.ring(pct(paidAmt, total), 84, '', '#f43f5e')}<div class="stat"><div class="label">Overall progress</div><div style="font-weight:700">${money(paidAmt)}</div><small>of ${money(total)} paid</small></div></div>
      <div class="card stat"><div class="label">Installment-free by</div><div class="value">${lastEnd ? esc(monthName(lastEnd)) : '🎉 Now'}</div><small>Total interest across plans: ${money(interest)}</small></div>
    </div>
    ${late.length ? `<div class="tip" style="margin-top:16px;background:var(--bad-50)">⚠️ <div><b>${late.length} installment(s) behind schedule:</b> ${late.map((x) => `${esc(x.it.name)} (${x.st.behind} term)`).join(', ')}. Pay these first to avoid late fees and credit-score damage.</div></div>` : ''}
    <div class="toolbar" style="margin-top:16px"><button class="btn primary sm" data-action="addInst">＋ Add installment</button><div class="tabs">${[['active', `Active (${active.length})`], ['timeline', 'Timeline'], ['done', `Completed (${done.length})`]].map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-action="tab" data-key="instTab" data-id="${k}">${l}</button>`).join('')}</div>
      <span style="flex:1"></span><div class="seg-legend"><span><i style="background:linear-gradient(90deg,#f43f5e,#8b5cf6,#0ea5e9)"></i>Paid</span><span><i style="background:var(--warn)"></i>Next due</span><span><i style="background:var(--bad)"></i>Late</span><span><i style="background:var(--line)"></i>Upcoming</span></div></div>`;

    let body = '';
    if (tab === 'active') {
      body = active.length ? `<div class="grid g2">${active.sort((a, b) => b.st.behind - a.st.behind || a.st.left - b.st.left).map(instCard).join('')}</div>` : '<div class="card empty"><div style="font-size:34px">📦</div>No active installments. Bought a gadget or appliance on installment? Click “＋ Add installment”.</div>';
      if (active.length) body += `<div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>Monthly commitment · next 12 months</h3><p class="muted">Watch your monthly payments shrink as each plan finishes.</p>${UI.stacked(fc.map((m) => monthShort(m.ym)), series)}</div>
        <div class="card"><h3>🔓 Money freed up</h3><p class="muted">When each plan ends, its monthly payment goes back to you — put it on debt or savings.</p>
          <div class="list">${freed.map(({ it, st, color }) => `<div class="item"><div class="ico" style="background:${color}22">${esc(it.icon || '📦')}</div><div class="grow"><div class="title">${esc(it.name)}</div><small>Last payment ${esc(monthName(st.endYm))} · ${st.left} to go</small></div><b class="pos">+${money(st.monthly)}/mo</b></div>`).join('')}</div>
          <div class="callout" style="margin-top:10px">💡 Redirecting ${money(monthly)} into your debt plan after these finish could make you debt-free much sooner. Try it in the <a href="#/debts">Simulator</a>.</div></div></div>`;
    } else if (tab === 'timeline') {
      body = `<div class="card"><h3>Installment timeline</h3><p class="muted">Solid = paid · light = remaining · red = late · dashed line = today</p>${gantt(all)}</div>`;
    } else {
      body = `<div class="card"><div class="list">${done.map(({ it, st, color }) => `<div class="item"><div class="ico" style="background:${color}22">${esc(it.icon || '📦')}</div><div class="grow"><div class="title">${esc(it.name)} <span class="badge ok">🎉 Fully paid</span></div><small>${esc(it.provider || '')} · ${st.terms} terms · finished ${esc(monthName(st.endYm))}</small></div><b>${money(st.total)}</b><button class="icon-btn" data-action="delInst" data-id="${it.id}" aria-label="Delete installment ${esc(it.name)}">🗑</button></div>`).join('') || '<div class="empty">No completed installments yet — you’ll get there!</div>'}</div></div>`;
    }
    return head + body;
  }

  /* ---------- Goals ---------- */
  function goals(ym) {
    const s = S(), avg = Store.avgMonthlyExpense(ym), ef = emergencyGoal();
    const now = Date.now();
    return `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>🛡️ Emergency fund</h3>${ef ? `<button class="btn sm primary" data-action="contribute" data-id="${ef.id}">＋ Add money</button>` : ''}</div>
        ${ef ? `<div style="font-size:22px;font-weight:700">${money(ef.saved)} <small>/ ${money(ef.target)}</small></div><div style="margin:8px 0">${progress(pct(ef.saved, ef.target))}</div>
        <div class="list"><div class="item"><div class="grow">Starter fund</div><b>${money(s.settings.starterEF)}</b>${ef.saved >= s.settings.starterEF ? '<span class="badge ok">Done</span>' : '<span class="badge warn">In progress</span>'}</div>
        <div class="item"><div class="grow">3 months of expenses</div><b>${money(avg * 3)}</b>${ef.saved >= avg * 3 && avg ? '<span class="badge ok">Done</span>' : ''}</div>
        <div class="item"><div class="grow">6 months of expenses</div><b>${money(avg * 6)}</b>${ef.saved >= avg * 6 && avg ? '<span class="badge ok">Done</span>' : ''}</div></div>
        <small>Based on your average monthly expenses of ${money(avg)}.</small>` : emptyCta('🛡️', 'No emergency fund yet. Start with a small starter fund.', 'addGoal', 'Create', 'ef')}</div>
      <div class="card"><div class="card-head"><h3>🛒 24-hour cooling-off wishlist</h3><button class="btn sm" data-action="addWish">＋ Add</button></div>
        <p class="muted">Add impulse buys here. Wait 24 hours before deciding — especially before signing up for a new installment.</p>
        <div class="list">${s.wishlist.map((w) => { const ready = now - w.added >= 864e5; return `<div class="item"><div class="ico">🛍️</div><div class="grow"><div class="title">${esc(w.name)}</div><small>${ready ? 'Cooling-off done – still want it?' : `Wait ${Math.ceil((864e5 - (now - w.added)) / 36e5)}h more`}</small></div><b>${money(w.price)}</b><button class="icon-btn" title="Skip it (saved!)" aria-label="Skip ${esc(w.name)}" data-action="delWish" data-id="${w.id}">✅</button></div>`; }).join('') || '<div class="empty">Nothing on the list. 👏</div>'}</div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Goals & sinking funds</h3><button class="btn sm primary" data-action="addGoal">＋ New goal</button></div>
      <div class="grid g3">${s.goals.filter((g) => !g.emergency).map((g) => {
        const left = g.target - g.saved;
        let perMonth = '';
        if (g.deadline && left > 0) { const ms = Math.max(1, Math.round((new Date(g.deadline) - new Date()) / (30.4 * 864e5))); perMonth = `<small>Save ${money(left / ms)}/mo to hit it by ${shortDate(g.deadline)}</small>`; }
        return `<div class="card" style="box-shadow:none"><div style="display:flex;gap:10px;align-items:center"><div class="ico">${g.icon || '🎯'}</div><div class="grow"><b>${esc(g.name)}</b><br><small>${money(g.saved)} / ${money(g.target)}</small></div><b>${pct(g.saved, g.target)}%</b></div>
          <div style="margin:10px 0">${progress(pct(g.saved, g.target))}</div>${perMonth}
          <div class="row-actions" style="margin-top:8px"><button class="btn sm" data-action="contribute" data-id="${g.id}">＋ Add money</button><button class="icon-btn" data-action="editGoal" data-id="${g.id}" aria-label="Edit goal ${esc(g.name)}">✎</button><button class="icon-btn" data-action="delGoal" data-id="${g.id}" aria-label="Delete goal ${esc(g.name)}">🗑</button></div></div>`;
      }).join('') || '<div class="empty">No goals yet. Saving for Christmas, school fees or a trip? Add a goal.</div>'}</div></div>`;
  }

  /* ---------- Bills ---------- */
  function bills(ym) {
    const s = S(), [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate();
    const subs = s.bills.filter((b) => b.subscription);
    const subTotal = subs.reduce((a, b) => a + +b.amount, 0);
    const events = {};
    s.bills.forEach((b) => { const d = Math.min(b.dueDay, last); (events[d] = events[d] || []).push({ n: b.name, cls: (b.paid || {})[ym] ? 'ok' : 'warn' }); });
    s.debts.filter((d) => d.balance > 0).forEach((d) => { const dd = Math.min(d.dueDay, last); (events[dd] = events[dd] || []).push({ n: d.name, cls: 'bad' }); });
    instDueIn(ym).forEach((it) => { const k = Installments.monthsBetween(it.start, ym); const dd = Math.min(it.dueDay, last); (events[dd] = events[dd] || []).push({ n: `📦 ${it.name} ${k + 1}/${it.terms}`, cls: k < it.paidTerms ? 'ok' : 'info' }); });
    const firstDow = new Date(y, m - 1, 1).getDay();
    let cal = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div style="font-size:11px;color:var(--muted);text-align:center">${d}</div>`).join('');
    for (let i = 0; i < firstDow; i++) cal += '<div></div>';
    const isCur = nowYm() === ym;
    for (let d = 1; d <= last; d++) cal += `<div style="border:1px solid var(--line);border-radius:8px;min-height:58px;padding:4px;font-size:11px;min-width:0;${isCur && d === new Date().getDate() ? 'outline:2px solid var(--primary)' : ''}"><b>${d}</b>${(events[d] || []).map((e) => `<div class="badge ${e.cls}" style="display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis">${esc(e.n)}</div>`).join('')}</div>`;

    return `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>Bills · ${monthName(ym)}</h3><button class="btn sm primary" data-action="addBill">＋ Add bill</button></div>
        <div class="list">${s.bills.slice().sort((a, b) => a.dueDay - b.dueDay).map((b) => { const paid = (b.paid || {})[ym]; return `<div class="item bill-item"><div class="ico">${b.subscription ? '🔁' : '🧾'}</div><div class="grow"><div class="title">${esc(b.name)}</div><small>Due day ${b.dueDay}</small></div><b>${money(b.amount)}</b>
          <div class="row-actions bill-actions">${paid ? '<span class="badge ok">Paid</span>' : `<button class="btn sm" data-action="payBill" data-id="${b.id}" data-ym="${ym}">Mark paid</button>`}<button class="icon-btn" data-action="editBill" data-id="${b.id}" aria-label="Edit bill ${esc(b.name)}">✎</button><button class="icon-btn" data-action="delBill" data-id="${b.id}" aria-label="Delete bill ${esc(b.name)}">🗑</button></div></div>`; }).join('') || '<div class="empty"><div style="font-size:34px">🧾</div>No bills yet. Add rent, Meralco, water, internet and subscriptions.</div>'}</div></div>
      <div class="card"><div class="card-head"><h3>🔁 Subscriptions</h3><span class="badge info">${money(subTotal)}/mo · ${money(subTotal * 12)}/yr</span></div>
        <div class="list">${subs.map((b) => `<div class="item"><div class="grow"><div class="title">${esc(b.name)}</div><small>${money(b.amount * 12)} per year</small></div><b>${money(b.amount)}</b><button class="btn sm danger" data-action="delBill" data-id="${b.id}">Cancel?</button></div>`).join('') || '<div class="empty">No subscriptions tracked. Tick “This is a subscription” when adding a bill.</div>'}</div>
        <div class="tip" style="margin-top:12px">✂️ <div>Cancelling subscriptions you rarely use frees up money for debt payoff. ${subTotal ? `All of these together = ${money(subTotal * 12)}/year.` : ''}</div></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">📅 Bill calendar</h3><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">${cal}</div>
      <div class="badges" style="margin-top:10px"><span class="badge warn">Unpaid bill</span><span class="badge ok">Paid</span><span class="badge bad">Debt due</span><span class="badge info">Installment due</span></div></div>`;
  }

  /* ---------- Reports ---------- */
  function reports(ym) {
    const s = S(), spent = Store.spendByCategory(ym), prevSpent = Store.spendByCategory(Store.shiftMonth(ym, -1));
    const items = Object.entries(spent).map(([id, v]) => { const c = Store.cat(id); return { label: c ? c.name : 'Other', color: c ? c.color : '#999', value: v }; }).sort((a, b) => b.value - a.value);
    const tot = Store.monthTotals(ym);
    const months = [...Array(6)].map((_, i) => Store.shiftMonth(ym, i - 5));
    const mt = months.map(Store.monthTotals);
    const leaks = Object.entries(spent).map(([id, v]) => ({ c: Store.cat(id), v, p: prevSpent[id] || 0 })).filter((x) => x.c && x.p > 0 && x.v > x.p && !['Debt Payment', 'Savings', 'Installments'].includes(x.c.name)).map((x) => ({ ...x, ch: Math.round(((x.v - x.p) / x.p) * 100) })).sort((a, b) => b.ch - a.ch).slice(0, 5);

    const today = new Date(), pd = s.settings.paydays.map(Number).sort((a, b) => a - b);
    const next = pd.find((d) => d > today.getDate());
    const nextDate = new Date(today.getFullYear(), today.getMonth() + (next ? 0 : 1), next || pd[0]);
    const daysTo = Math.max(1, Math.round((nextDate - today) / 864e5));
    const dueBefore = upcomingBills(daysTo);
    const dueSum = dueBefore.reduce((a, b) => a + +b.amount, 0);
    const liquid = Store.liquid();

    const paidOff = s.debts.filter((d) => d.balance <= 0).length;
    const days = nowYm() === ym ? today.getDate() : new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
    const spendDays = new Set(Store.txInMonth(ym).filter((t) => t.type === 'expense').map((t) => t.date));
    const noSpend = days - spendDays.size;
    const ef = emergencyGoal();
    const insts = instList();
    const ach = [['🥇', '1st debt paid off', paidOff >= 1], ['🏆', 'All debts paid', s.debts.length && paidOff === s.debts.length], ['📦', 'Installment completed', insts.some((x) => x.st.done)], ['⏱️', 'No late installments', insts.length && !insts.some((x) => x.st.behind)], ['🛡️', 'Starter emergency fund', ef && ef.saved >= s.settings.starterEF], ['🧘', '5+ no-spend days', s.transactions.length && noSpend >= 5], ['📈', 'Positive cash flow', tot.net > 0], ['🎯', 'Stayed under budget', Object.keys(s.budgets).length && tot.expense <= Object.keys(s.budgets).reduce((a, id) => a + Store.budgetFor(id, ym), 0)]];

    return `<div class="grid g2">
      <div class="card"><h3 style="margin-bottom:12px">Spending by category</h3>${UI.donut(items, UI.moneyText(tot.expense), 'Total expenses')}</div>
      <div class="card"><h3 style="margin-bottom:12px">Income vs expenses (6 months)</h3>${UI.bars(months.map((x) => monthName(x).slice(0, 3)), [{ label: 'Income', color: '#16a34a', values: mt.map((t) => t.income) }, { label: 'Expenses', color: '#ef4444', values: mt.map((t) => t.expense) }])}</div>
      <div class="card"><h3>🔍 Leak detector</h3><p class="muted">Categories where spending crept up vs last month.</p><div class="list">${leaks.map((l) => `<div class="item"><div class="ico" style="background:${l.c.color}22">${l.c.icon}</div><div class="grow"><div class="title">${esc(l.c.name)}</div><small>${money(l.p)} → ${money(l.v)}</small></div><span class="badge bad">↑ ${l.ch}%</span></div>`).join('') || `<div class="empty">${s.transactions.length ? 'No leaks found. Nice! 👏' : 'Needs at least 2 months of transactions.'}</div>`}</div></div>
      <div class="card"><h3>💧 Cash-flow forecast</h3><p class="muted">Until next payday: <b>${nextDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</b> (${daysTo} days)</p>
        <div class="list"><div class="item"><div class="grow">Cash on hand (all accounts)</div><b>${money(liquid)}</b></div><div class="item"><div class="grow">Bills, minimums & installments due before payday (${dueBefore.length})</div><b class="neg">−${money(dueSum)}</b></div>
        <div class="item"><div class="grow"><b>Projected balance on payday</b></div><b class="${liquid - dueSum < 0 ? 'neg' : 'pos'}">${money(liquid - dueSum)}</b></div><div class="item"><div class="grow">Safe to spend per day</div><b>${money(Math.max(0, liquid - dueSum) / daysTo)}</b></div></div></div>
      <div class="card"><h3>Net worth</h3><div class="list">${s.accounts.map((a) => `<div class="item"><div class="ico">${ACC_ICON[a.type] || '📁'}</div><div class="grow">${esc(a.name)}</div><b>${money(Store.accountBalance(a.id))}</b></div>`).join('')}
        <div class="item"><div class="ico">🎯</div><div class="grow">Savings goals</div><b>${money(s.goals.reduce((a, g) => a + +g.saved, 0))}</b></div>
        <div class="item"><div class="ico">💳</div><div class="grow">Debts</div><b class="neg">−${money(Store.totalDebt())}</b></div>
        <div class="item"><div class="ico">📦</div><div class="grow">Installments remaining</div><b class="neg">−${money(Store.installmentBalance())}</b></div>
        <div class="item"><div class="grow"><b>Net worth</b></div><b>${money(Store.netWorth())}</b></div></div></div>
      <div class="card"><h3>🏅 Milestones</h3><p class="muted">${noSpend} no-spend day(s) in ${monthName(ym)}.</p><div class="badges">${ach.map(([i, t, on]) => `<div class="ach ${on ? 'on' : ''}">${i} ${t}</div>`).join('')}</div>
        <h4 style="margin-top:16px">Weekly check-in</h4><ul class="muted" style="padding-left:18px"><li>Net this month: ${money(tot.net)}</li><li>Top category: ${items[0] ? esc(items[0].label) + ' (' + money(items[0].value) + ')' : '—'}</li><li>Debt remaining: ${money(Store.totalDebt())}</li><li>Installments remaining: ${money(Store.installmentBalance())}</li></ul></div>
    </div>`;
  }

  /* ---------- Accounts ---------- */
  function accounts() {
    const s = S();
    return `<div class="card"><div class="card-head"><h3>Accounts</h3><button class="btn sm primary" data-action="addAccount">＋ Add account</button></div>
      <div class="list">${s.accounts.map((a) => `<div class="item account-item"><div class="ico">${ACC_ICON[a.type] || '📁'}</div><div class="grow"><div class="title">${esc(a.name)}</div><small>${a.type} · opening ${money(a.opening)}</small></div><b class="account-balance">${money(Store.accountBalance(a.id))}</b><div class="row-actions account-actions"><button class="btn sm ghost" data-action="transfer" data-id="${a.id}">Transfer</button><button class="icon-btn" data-action="editAccount" data-id="${a.id}" aria-label="Edit account ${esc(a.name)}">✎</button><button class="icon-btn" data-action="delAccount" data-id="${a.id}" aria-label="Delete account ${esc(a.name)}">🗑</button></div></div>`).join('') || '<div class="empty"><div style="font-size:34px">🏦</div>No accounts yet. Add your bank, e-wallet (GCash/Maya) or cash with “＋ Add account”.</div>'}</div>
      <div class="callout" style="margin-top:12px">💡 Credit cards and loans go under <a href="#/debts">Debts</a>; fixed-term purchases go under <a href="#/installments">Installments</a>. Transfers between accounts are not counted as spending.</div></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Categories</h3><button class="btn sm primary" data-action="addCat">＋ Add category</button></div>
      <div class="badges">${s.categories.map((c) => `<span class="badge info" style="background:${c.color}22;color:inherit;font-size:13px;padding:6px 10px">${c.icon} ${esc(c.name)} · ${c.group} <a class="category-edit" href="#" data-action="editCat" data-id="${c.id}" aria-label="Edit category ${esc(c.name)}" style="text-decoration:none">✎</a></span>`).join('')}</div></div>`;
  }

  /* ---------- Settings ---------- */
  function settings() {
    const st = S().settings, gp = Guide.progress();
    return `<div class="grid g2"><div class="card"><h3 style="margin-bottom:12px">Preferences</h3>
      <form class="form" id="settingsForm">
        <label class="field">Your name<input name="name" value="${esc(st.name)}"/></label>
        <div class="two"><label class="field">Monthly take-home income<input type="number" name="monthlyIncome" value="${st.monthlyIncome}"/></label><label class="field">Paydays (comma separated)<input name="paydays" value="${esc(st.paydays.join(', '))}"/></label></div>
        <div class="two"><label class="field">Payoff strategy<select name="strategy">${['avalanche', 'snowball', 'custom'].map((k) => `<option ${st.strategy === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="field">Extra debt payment / month<input type="number" name="extra" value="${st.extra}"/></label></div>
        <div class="two"><label class="field">Starter emergency fund target<input type="number" name="starterEF" value="${st.starterEF}"/></label><label class="field">Currency symbol<input name="currency" value="${esc(st.currency)}"/></label></div>
        <label class="check"><input type="checkbox" name="rollover" ${st.rollover ? 'checked' : ''}/> Roll over unused category budget to next month</label>
        <div class="row-actions"><button class="btn primary">Save preferences</button></div>
      </form></div>
      <div class="card"><h3 style="margin-bottom:12px">Setup, data & privacy</h3><p class="muted">All data is stored locally in your browser (localStorage). Nothing is sent to a server.</p>
        <div class="list">
          <div class="item"><div class="grow">Appearance<br><small>Switch between light and OLED black</small></div><button class="btn sm ghost" id="settingsThemeBtn" type="button"></button></div>
          <div class="item"><div class="grow">Privacy mode<br><small>Hide summary amounts; entry fields remain visible</small></div><button class="btn sm ghost" id="settingsPrivacyBtn" type="button"></button></div>
          <div class="item"><div class="grow">🧭 Setup guide <br><small>${gp.done}/${gp.total} steps done</small></div><button class="btn sm primary" data-action="restartGuide">${Guide.isActive() ? 'Open guide' : 'Restart guide'}</button></div>
          <div class="item"><div class="grow">Backup all data (JSON)</div><button class="btn sm" data-action="exportJson">Export</button></div>
          <div class="item"><div class="grow">Restore from backup</div><button class="btn sm" data-action="importJson">Import</button></div>
          <div class="item"><div class="grow">Export transactions (CSV / Excel)</div><button class="btn sm" data-action="exportCsv">Export CSV</button></div>
          <div class="item"><div class="grow">PIN lock on open</div><button class="btn sm" data-action="setPin">${st.pin ? 'Change / remove' : 'Set PIN'}</button></div>
          <div class="item"><div class="grow">Load demo data</div><button class="btn sm danger" data-action="resetDemo">Load demo</button></div>
          <div class="item"><div class="grow">Start fresh (guided setup)</div><button class="btn sm danger" data-action="resetEmpty">Clear all</button></div>
        </div></div></div>`;
  }

  function more() {
    const links = [['installments', '📦', 'Installments'], ['budget', '🎯', 'Budget'], ['goals', '🐷', 'Goals & Savings'], ['bills', '🧾', 'Bills & Subscriptions'], ['reports', '📊', 'Insights & Reports'], ['accounts', '🏦', 'Accounts & Categories'], ['settings', '⚙️', 'Settings']];
    return `<div class="card"><div class="list">${links.map(([r, i, l]) => `<a class="item" href="#/${r}" style="color:inherit;text-decoration:none"><div class="ico">${i}</div><div class="grow"><b>${l}</b></div>›</a>`).join('')}</div></div>`;
  }

  return { dashboard, transactions, budget, debts, installments, goals, bills, reports, accounts, settings, more, DEBT_TYPES, ACC_ICON, advisorSteps };
})();
