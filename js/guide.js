/* PesoPath — first-time setup guide
 * - Welcome chooser on first launch (own setup vs. demo data)
 * - Prioritized checklist (Required → Debt picture → Plan your money) with locks
 * - Spotlight: dims the page and highlights exactly what to click
 * - Field highlighting inside forms (numbered, turns green when filled)
 * - Auto-detects completion and offers the next step
 */
const Guide = (() => {
  const { $, esc } = UI;
  let ctx = null;            // { ui, render, A }
  let pending = null;        // step whose form we expect to open
  let spotEl = null, spotStep = null;
  let prevDone = null;       // Set of step ids done at last check
  let queuedNext = null;     // completed step waiting for modal to close

  const S = () => Store.get();
  const ob = () => S().settings.onboard;
  const save = () => Store.save();

  /* ---------- Step definitions (ordered by priority) ---------- */
  const GROUPS = {
    must: { icon: '🚩', label: 'Do these first', badge: ['bad', 'Required'] },
    debt: { icon: '💳', label: 'Your debt picture', badge: ['warn', 'Recommended'] },
    plan: { icon: '🎯', label: 'Plan your money', badge: ['info', 'Recommended'] },
  };
  const STEPS = [
    { id: 'profile', group: 'must', icon: '👤', title: 'Tell us about you & your income', mins: 1,
      why: 'Your take-home pay and paydays power your budget, paycheck plan and cash-flow forecast.',
      done: () => !!ob().done.profile, start: () => ctx.A.openProfile(),
      fields: [['name', 'So we can greet you'], ['monthlyIncome', 'Take-home pay after deductions'], ['payFreq', 'When your salary arrives']] },
    { id: 'account', group: 'must', icon: '🏦', title: 'Add where your money is', mins: 1, needs: ['profile'],
      why: 'Your main bank, e-wallet (GCash/Maya) or cash with its balance today. Every peso is recorded against an account.',
      done: (s) => s.accounts.length > 0, route: 'accounts', target: '#view [data-action="addAccount"]',
      tipTitle: 'Click “＋ Add account”', tipText: 'Start with the account your salary goes into. You can add more later.',
      fields: [['name', 'e.g. “BDO Savings” or “GCash”'], ['type', 'What kind of account it is'], ['opening', 'Its balance right now']] },
    { id: 'income', group: 'must', icon: '💼', title: 'Record your latest income', mins: 1, needs: ['account'],
      why: 'Log your most recent salary so “Left to spend” and the 50/30/20 check use real numbers.',
      done: (s) => s.transactions.some((t) => t.type === 'income'), route: 'transactions', target: '#view [data-action="addTx"]',
      tipTitle: 'Click “＋ Add”', tipText: 'We’ll pre-select “Income” for you.', preset: { type: 'income' },
      fields: [['type', 'Already set to ➕ Income'], ['amount', 'How much you received'], ['date', 'When you received it'], ['incomeCat', 'Salary or side income'], ['accountId', 'Where the money landed']] },
    { id: 'debts', group: 'debt', icon: '💳', title: 'List your debts', mins: 2, needs: ['profile'], skippable: 'I have no debts 🎉',
      why: 'Credit cards, loans, lending apps, family loans. This unlocks your debt-free date and payoff order.',
      done: (s) => s.debts.length > 0, route: 'debts', prep: (ui) => { ui.debtTab = 'list'; }, target: '#view [data-action="addDebt"]',
      tipTitle: 'Click “＋ Add debt”', tipText: 'Add your highest-interest debt first (usually credit cards or lending apps). Repeat for each debt.',
      fields: [['name', 'Who you owe'], ['balance', 'Amount you still owe'], ['minPayment', 'Amount due every month'], ['apr', 'Enter the yearly rate or leave blank and add the remaining term for a fixed-payment loan'], ['dueDay', 'Day of the month it’s due']] },
    { id: 'installments', group: 'debt', icon: '📦', title: 'Add your installments', mins: 1, needs: ['account'], skippable: 'No installments',
      why: 'Gadgets or appliances on Home Credit, SPayLater, BillEase or card installment. Tracks every term until fully paid.',
      done: (s) => s.installments.length > 0, route: 'installments', prep: (ui) => { ui.instTab = 'active'; }, target: '#view [data-action="addInst"]',
      tipTitle: 'Click “＋ Add installment”', tipText: 'You can enter how many terms you’ve already paid.',
      fields: [['name', 'What you bought'], ['principal', 'Cash price — used to compute interest'], ['monthly', 'Monthly amortization'], ['terms', 'Total number of months'], ['start', 'Month of your 1st payment'], ['paidTerms', 'How many you’ve paid so far']] },
    { id: 'bills', group: 'debt', icon: '🧾', title: 'Add recurring bills', mins: 1, needs: ['account'], skippable: 'No regular bills',
      why: 'Rent, Meralco, water, internet, subscriptions — so due dates show on your calendar and dashboard.',
      done: (s) => s.bills.length > 0, route: 'bills', target: '#view [data-action="addBill"]',
      tipTitle: 'Click “＋ Add bill”', tipText: 'Start with rent or your biggest bill.',
      fields: [['name', 'e.g. Rent, Meralco, Netflix'], ['amount', 'Usual monthly amount'], ['dueDay', 'Day of the month it’s due'], ['categoryId', 'Which budget category it belongs to']] },
    { id: 'budget', group: 'plan', icon: '🎯', title: 'Create your monthly budget', mins: 1, needs: ['profile'],
      why: 'We suggest an amount per category from your income, debts and bills (50/30/20). Adjust anything you like.',
      done: (s) => Object.values(s.budgets).some((v) => +v > 0), route: 'budget', prep: (ui) => { ui.budgetTab = 'category'; }, target: '#view [data-action="autoBudget"]',
      tipTitle: 'Click “✨ Suggest my budget”', tipText: 'Review the suggested amounts, change any you like, then press Apply.' },
    { id: 'ef', group: 'plan', icon: '🛡️', title: 'Start your emergency fund', mins: 1, needs: ['profile'], skippable: 'Later',
      why: 'A starter fund stops new emergencies from becoming new debt. Build it before paying extra on debts.',
      done: (s) => s.goals.some((g) => g.emergency), route: 'goals', target: '#view [data-action="addGoal"][data-id="ef"]',
      tipTitle: 'Click “Create”', tipText: 'We suggest about 3 months of expenses as the target — change it if needed.',
      fields: [['target', 'Your goal amount'], ['saved', 'Anything already set aside']] },
    { id: 'strategy', group: 'plan', icon: '🧭', title: 'Pick your debt payoff strategy', mins: 1, needs: ['debts'], skippable: 'Keep Avalanche',
      why: 'Avalanche saves the most interest; Snowball gives quick wins. You can switch anytime.',
      applies: (s) => s.debts.length > 0, done: () => !!ob().done.strategy,
      route: 'debts', prep: (ui) => { ui.debtTab = 'plan'; }, target: '#view select[data-action="setStrategy"]',
      tipTitle: 'Choose your strategy here', tipText: '🏔️ Avalanche = highest interest first (saves the most). ⛄ Snowball = smallest balance first (quick wins).',
      tipButton: ['Use Avalanche (recommended)', () => { S().settings.strategy = 'avalanche'; ob().done.strategy = true; save(); ctx.render(); }] },
  ];

  /* ---------- Status ---------- */
  const applicable = () => STEPS.filter((st) => !st.applies || st.applies(S()));
  const isComplete = (st) => !!(st.done(S()) || ob().skipped[st.id]);
  const isSkipped = (st) => !st.done(S()) && !!ob().skipped[st.id];
  const byId = (id) => STEPS.find((x) => x.id === id);
  const isLocked = (st) => (st.needs || []).some((n) => { const d = byId(n); return d && !isComplete(d); });
  const nextStep = () => applicable().find((st) => !isComplete(st) && !isLocked(st));
  function progress() {
    const list = applicable(), done = list.filter(isComplete).length;
    return { done, total: list.length, pct: Math.round((done / list.length) * 100) };
  }
  const isActive = () => ob().active && !ob().finished;
  const stepNo = (st) => applicable().indexOf(st) + 1;

  /* ---------- Checklist HTML (drawer + dashboard) ---------- */
  function checklistHtml() {
    const nx = nextStep();
    let html = '<div class="checklist">', last = '';
    applicable().forEach((st, i) => {
      if (st.group !== last) {
        const g = GROUPS[st.group]; last = st.group;
        html += `<div class="cl-group">${g.icon} ${g.label} <span class="badge ${g.badge[0]}">${g.badge[1]}</span></div>`;
      }
      const done = isComplete(st), skipped = isSkipped(st), locked = !done && isLocked(st), isNext = nx === st;
      const needName = locked ? byId(st.needs.find((n) => !isComplete(byId(n)))).title : '';
      html += `<div class="cl-item ${done ? 'done' : ''} ${skipped ? 'skipped' : ''} ${locked ? 'locked' : ''} ${isNext ? 'next' : ''}" data-step="${st.id}">
        <div class="num">${done ? (skipped ? '–' : '✓') : locked ? '🔒' : i + 1}</div>
        <div class="grow"><div class="t">${st.icon} ${esc(st.title)} ${isNext ? '<span class="badge warn">👉 Next up</span>' : ''}${skipped ? '<span class="badge muted">Skipped</span>' : ''}</div>
          <small>${locked ? `Unlocks after “${esc(needName)}”` : esc(st.why)}</small>
          ${!done && !locked ? `<div class="acts"><button class="btn sm ${isNext ? 'primary' : ''}" data-g="start" data-id="${st.id}">${isNext ? 'Start now →' : 'Start'}</button>${st.skippable ? `<button class="btn sm ghost" data-g="skip" data-id="${st.id}">${esc(st.skippable)}</button>` : ''}<small style="align-self:center">~${st.mins} min</small></div>` : ''}
          ${skipped ? `<div class="acts"><button class="btn sm ghost" data-g="start" data-id="${st.id}">Set it up anyway</button></div>` : ''}
        </div></div>`;
    });
    return html + '</div>';
  }

  /** Dashboard hero card while setup is in progress */
  function heroHtml() {
    const p = progress(), nx = nextStep(), name = S().settings.name;
    return `<div class="card setup-hero">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div><h3 style="font-size:20px">👋 Welcome${name ? ', ' + esc(name) : ''}! Let’s set up PesoPath</h3><small>Follow the steps in order — the most important ones come first. About 5–8 minutes.</small></div>
        <span style="font-size:28px;font-weight:800">${p.done}/${p.total}</span></div>
      <div class="progress" style="margin-top:12px;height:10px"><i style="width:${p.pct}%"></i></div>
      ${nx ? `<div class="next-box"><div class="ico" style="background:var(--warn-50);font-size:22px">${nx.icon}</div>
        <div style="flex:1;min-width:180px"><small>STEP ${stepNo(nx)} · ${GROUPS[nx.group].badge[1].toUpperCase()}</small><div style="font-weight:700;font-size:15px">${esc(nx.title)}</div><small>${esc(nx.why)}</small></div>
        <button class="btn primary lg" data-g="start" data-id="${nx.id}">Start →</button></div>` : ''}
    </div>`;
  }

  /* ---------- Floating button + drawer ---------- */
  function renderChrome() {
    const fab = $('#guideFab'), dr = $('#guideDrawer');
    if (!isActive()) { fab.hidden = true; dr.hidden = true; return; }
    const p = progress();
    fab.hidden = !dr.hidden;
    fab.innerHTML = `${UI.ring(p.pct, 34, '', '#f59e0b').replace('font-size="11"', 'font-size="9" style="fill:#fff"')}<span><span class="fab-full">Setup guide · </span>${p.done}/${p.total}</span>`;
    if (!dr.hidden) drawHtml();
  }
  function drawHtml() {
    const p = progress();
    $('#guideDrawer').innerHTML = `<div class="gd-head"><div style="display:flex;justify-content:space-between;align-items:center"><h3>🧭 Setup guide</h3><button class="icon-btn" data-g="close" aria-label="Close">✕</button></div>
      <small>${p.done} of ${p.total} steps done · Required steps first</small><div class="progress" style="margin-top:8px"><i style="width:${p.pct}%"></i></div></div>
      <div class="gd-body">${checklistHtml()}</div>
      <div class="gd-foot"><button class="btn sm ghost" data-g="close">I’ll continue later</button><button class="btn sm ghost" data-g="end">Turn off guide</button></div>`;
  }
  function openPanel() { clearSpot(); $('#guideNext').hidden = true; $('#guideDrawer').hidden = false; ob().panel = true; save(); renderChrome(); }
  function closePanel() { $('#guideDrawer').hidden = true; ob().panel = false; save(); renderChrome(); }

  /* ---------- Spotlight ---------- */
  function clearSpot() {
    spotEl = null; spotStep = null;
    const L = $('#spotLayer'); L.hidden = true; L.innerHTML = '';
  }
  function waitFor(sel, cb, tries = 30) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return cb(el);
    if (tries <= 0) { UI.toast('Couldn’t find that button — open the setup guide to try again'); return; }
    setTimeout(() => waitFor(sel, cb, tries - 1), 80);
  }
  function spot(el, st) {
    spotEl = el; spotStep = st;
    el.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    setTimeout(drawSpot, 60);
    // the click goes through to the real button; the spotlight then hands over to the form
    const release = () => { el.removeEventListener('click', release, true); el.removeEventListener('change', release, true); if (spotEl === el) clearSpot(); };
    el.addEventListener('click', release, true);
    el.addEventListener('change', release, true);
  }
  function drawSpot() {
    if (!spotEl || !document.body.contains(spotEl)) { clearSpot(); return; }
    const st = spotStep, r = spotEl.getBoundingClientRect(), pad = 8;
    const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = r.width + pad * 2, h = r.height + pad * 2;
    const W = window.innerWidth, H = window.innerHeight;
    const L = $('#spotLayer');
    const p = progress();
    const below = y + h + 200 < H;
    const tipLeft = Math.min(Math.max(12, x + w / 2 - 165), W - Math.min(330, W - 24) - 12);
    const tipTop = below ? y + h + 14 : Math.max(12, y - 14);
    const arrowLeft = Math.min(Math.max(16, x + w / 2 - tipLeft - 7), 300);
    L.innerHTML = `
      <div class="spot-block" style="left:0;top:0;width:100%;height:${y}px"></div>
      <div class="spot-block" style="left:0;top:${y + h}px;width:100%;bottom:0"></div>
      <div class="spot-block" style="left:0;top:${y}px;width:${x}px;height:${h}px"></div>
      <div class="spot-block" style="left:${x + w}px;top:${y}px;right:0;height:${h}px"></div>
      <div class="spot-hole" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>
      <div class="spot-tip" style="left:${tipLeft}px;${below ? `top:${tipTop}px` : `bottom:${H - tipTop}px`}">
        <span class="arrow" style="left:${arrowLeft}px;${below ? 'top:-7px' : 'bottom:-7px'}"></span>
        <div class="st-step">Step ${stepNo(st)} of ${p.total} · ${esc(st.title)}</div>
        <h4><span class="hand">${below ? '👆' : '👇'}</span> ${esc(st.tipTitle)}</h4>
        <p>${esc(st.tipText)}</p>
        <div class="row-actions" style="justify-content:flex-start">
          ${st.tipButton ? `<button class="btn sm primary" data-g="tipbtn">${esc(st.tipButton[0])}</button>` : ''}
          ${st.skippable && !st.tipButton ? `<button class="btn sm ghost" data-g="skip" data-id="${st.id}">${esc(st.skippable)}</button>` : ''}
          <button class="btn sm ghost" data-g="exitspot">Exit</button>
        </div></div>`;
    L.hidden = false;
  }

  /* ---------- Start a step ---------- */
  function start(id) {
    const st = byId(id); if (!st) return;
    if (isLocked(st)) { const need = byId(st.needs.find((n) => !isComplete(byId(n)))); UI.toast(`First: ${need.title}`); return start(need.id); }
    $('#guideDrawer').hidden = true; $('#guideNext').hidden = true; clearSpot();
    if (!ob().active) { ob().active = true; ob().finished = false; save(); }
    pending = st;
    if (UI.isModalOpen()) UI.closeModal();
    pending = st;
    if (st.start) { st.start(); renderChrome(); return; }
    if (st.prep) st.prep(ctx.ui);
    if (location.hash !== '#/' + st.route) location.hash = '#/' + st.route; else ctx.render();
    setTimeout(() => waitFor(st.target, (el) => spot(el, st)), 60);
  }

  /* ---------- Form highlighting ---------- */
  function onModal(body) {
    const st = pending;
    if (!st) return;
    const frm = body.querySelector('#mform');
    const isAuto = body.querySelector('[data-guide-auto]');
    if (!frm && !isAuto) return;
    const fields = (st.fields || []).filter(([n]) => frm && frm.querySelector(`[data-f="${n}"]`));
    if (frm && st.fields && !fields.length) return; // a different form opened
    if (st.preset && frm) Object.entries(st.preset).forEach(([k, v]) => { const el = frm.elements[k]; if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } });
    const hint = document.createElement('div');
    hint.className = 'guide-hint';
    hint.innerHTML = `<span style="font-size:20px">🧭</span><div><b>Step ${stepNo(st)} of ${progress().total}: ${esc(st.title)}</b><br>${fields.length ? `Fill in the <b>${fields.length} highlighted field${fields.length > 1 ? 's' : ''}</b> (in order 1→${fields.length}), then press <b>${esc(frm.querySelector('[type=submit]').textContent)}</b>.` : 'Review the numbers, adjust any you like, then press <b>Apply</b>.'}</div>`;
    body.prepend(hint);
    fields.forEach(([n, help], i) => {
      const lab = frm.querySelector(`[data-f="${n}"]`);
      lab.classList.add('guide-hl'); lab.dataset.gstep = i + 1;
      const hs = document.createElement('span'); hs.className = 'field-help'; hs.textContent = '👉 ' + help; lab.appendChild(hs);
      const inp = lab.querySelector('input,select');
      const mark = () => lab.classList.toggle('filled', !!(inp && String(inp.value).trim() !== '' && !(inp.type === 'number' && inp.required && +inp.value === 0 && n !== 'opening' && n !== 'paidTerms' && n !== 'saved')));
      if (inp) { inp.addEventListener('input', mark); inp.addEventListener('change', mark); mark(); }
    });
    const sub = body.querySelector('[type=submit], [data-guide-apply]'); if (sub) sub.classList.add('guide-save');
    const first = fields.length && frm.querySelector(`[data-f="${fields[0][0]}"] input, [data-f="${fields[0][0]}"] select`);
    if (first) setTimeout(() => first.focus(), 60);
  }
  function onModalClose() {
    pending = null;
    if (queuedNext) { const q = queuedNext; queuedNext = null; setTimeout(() => showNext(q), 150); }
  }

  /* ---------- Completion detection ---------- */
  function afterRender() {
    if (!ctx) return;
    const nowDone = new Set(applicable().filter(isComplete).map((s) => s.id));
    if (prevDone && isActive()) {
      const fresh = [...nowDone].filter((id) => !prevDone.has(id));
      if (fresh.length) {
        const st = byId(fresh[fresh.length - 1]);
        if (!nextStep() && progress().done === progress().total) { prevDone = nowDone; setTimeout(finish, 300); renderChrome(); return; }
        if (UI.isModalOpen()) queuedNext = st; else setTimeout(() => showNext(st), 150);
      }
    }
    prevDone = nowDone;
    if (spotEl && !document.body.contains(spotEl)) clearSpot();
    renderChrome();
  }

  function showNext(doneStep) {
    if (!isActive()) return;
    const nx = nextStep(), box = $('#guideNext');
    if (!nx) { if (progress().done === progress().total) finish(); return; }
    const skipped = isSkipped(doneStep);
    box.innerHTML = `<div class="big">${skipped ? '⏭️' : '✅'}</div><div style="flex:1;min-width:0"><small>${skipped ? 'Skipped' : 'Done'}: ${esc(doneStep.title)}</small>
      <div style="font-weight:700">Next: ${nx.icon} ${esc(nx.title)}</div><small>Step ${stepNo(nx)} of ${progress().total}</small></div>
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn primary sm" data-g="start" data-id="${nx.id}">Continue →</button><button class="btn ghost sm" data-g="later">Later</button></div>`;
    box.hidden = false;
  }

  function finish() {
    if (ob().finished) return;
    ob().finished = true; ob().active = false; save();
    clearSpot(); $('#guideNext').hidden = true; renderChrome();
    const s = S();
    UI.openModal('🎉 You’re all set!', `<div class="welcome"><div class="big">🎉</div><h2>Setup complete</h2><p class="muted">PesoPath now knows your money. Here’s your routine:</p></div>
      <ol class="steps" style="margin-top:10px">
        <li><span class="dot">1</span><div><b>Every day:</b> add expenses with “＋ Add Transaction”.</div></li>
        <li><span class="dot">2</span><div><b>Every payday:</b> log income, pay bills, installments and debt minimums from the dashboard.</div></li>
        <li><span class="dot">3</span><div><b>Every week:</b> check Reports → leak detector and cash-flow forecast.</div></li>
        <li><span class="dot">4</span><div><b>Follow “Your next best step”</b> on the dashboard to get debt-free.</div></li></ol>
      <div class="callout" style="margin:12px 0">${s.accounts.length} account(s) · ${s.debts.length} debt(s) · ${s.installments.length} installment(s) · ${s.bills.length} bill(s)</div>
      <div class="row-actions"><button class="btn primary" id="finishOk">Go to my dashboard</button></div>`, (b) => {
      b.querySelector('#finishOk').onclick = () => { UI.closeModal(); location.hash = '#/dashboard'; ctx.render(); };
    });
  }

  /* ---------- Welcome (first launch) ---------- */
  function welcome() {
    UI.openModal('Welcome to PesoPath', `<div class="welcome"><div class="big">🌿</div><h2>Plan today. Be debt-free tomorrow.</h2>
      <p class="muted">Track spending, build a budget, and get a clear plan for which debts to pay first.</p></div>
      <div class="choice">
        <button class="rec" data-w="own"><span class="e">🚀</span><div><b>Set up my own money <span class="badge ok">Recommended</span></b><small>A step-by-step guide shows you exactly what to click. About 5–8 minutes.</small></div></button>
        <button data-w="demo"><span class="e">👀</span><div><b>Explore with demo data first</b><small>See how everything works with sample numbers. Start your own setup anytime.</small></div></button>
      </div>
      <p class="muted" style="text-align:center;margin-top:12px;font-size:12px">🔒 Your data stays in this browser. Nothing is uploaded.</p>`, (b) => {
      b.querySelector('[data-w="own"]').onclick = () => { ob().welcome = false; save(); UI.closeModal(); start('profile'); };
      b.querySelector('[data-w="demo"]').onclick = () => { Store.reset('demo'); UI.closeModal(); location.hash = '#/dashboard'; ctx.render(); UI.toast('Demo data loaded — tap “Start my own setup” anytime'); };
    }, { noClose: true, noFocus: true });
  }

  function skip(id) { ob().skipped[id] = true; save(); clearSpot(); ctx.render(); }
  function markDone(id) { ob().done[id] = true; save(); }
  function restart() { Object.assign(ob(), { active: true, finished: false, skipped: {}, welcome: false }); save(); prevDone = null; ctx.render(); openPanel(); }
  function stop() { Object.assign(ob(), { active: false, finished: true }); save(); clearSpot(); $('#guideNext').hidden = true; renderChrome(); UI.toast('Guide turned off — restart it anytime in Settings'); }

  /* ---------- Init ---------- */
  function init(c) {
    ctx = c;
    UI.hooks.open.push(onModal);
    UI.hooks.close.push(onModalClose);
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-g]'); if (!el) return;
      const g = el.dataset.g;
      if (g === 'start') start(el.dataset.id);
      else if (g === 'skip') skip(el.dataset.id);
      else if (g === 'close') closePanel();
      else if (g === 'end') stop();
      else if (g === 'later') { $('#guideNext').hidden = true; $('#guideFab').classList.add('pulse'); }
      else if (g === 'exitspot') { clearSpot(); pending = null; }
      else if (g === 'tipbtn' && spotStep && spotStep.tipButton) { const fn = spotStep.tipButton[1]; clearSpot(); fn(); }
    });
    $('#guideFab').onclick = () => { $('#guideFab').classList.remove('pulse'); openPanel(); };
    const re = () => { if (spotEl) drawSpot(); };
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && spotEl) clearSpot(); });
    if (ob().panel && isActive()) $('#guideDrawer').hidden = false;
  }

  return { init, afterRender, start, welcome, checklistHtml, heroHtml, progress, isActive, markDone, restart, openPanel, nextStep };
})();
