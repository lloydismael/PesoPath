/* PesoPath — UI helpers: formatting, modal forms, toast, SVG charts */
const UI = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const amountsHidden = () => Store.get().settings.privacy;

  function money(n, opts = {}) {
    if (amountsHidden()) return '<span class="amt" aria-label="Amount hidden">Hidden</span>';
    const cur = Store.get().settings.currency || '₱';
    const v = Number(n) || 0;
    const s = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: opts.dec ?? 0 });
    return `<span class="amt">${v < 0 ? '−' : ''}${esc(cur)} ${s}</span>`;
  }
  function moneyText(n) { if (amountsHidden()) return 'Hidden'; const cur = Store.get().settings.currency || '₱'; const v = Number(n) || 0; return `${v < 0 ? '−' : ''}${cur} ${Math.abs(v).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }); };
  const monthShort = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }); };
  const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  function progress(p) {
    const cls = p >= 100 ? 'bad' : p >= 80 ? 'warn' : '';
    return `<div class="progress ${cls}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;
  }

  let tt;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }

  /* ---------- Modal (with hooks so the setup guide can highlight fields) ---------- */
  const hooks = { open: [], close: [] };
  let modalState = null;
  function openModal(title, html, onMount, opts = {}) {
    const backdrop = $('#modal'), dialog = $('.modal', backdrop);
    if (backdrop.hidden) {
      const background = [...document.body.children].filter((el) => el !== backdrop && el.id !== 'toast').map((el) => [el, el.inert, el.getAttribute('aria-hidden')]);
      modalState = { x: window.scrollX, y: window.scrollY, focus: document.activeElement, background };
      document.body.style.setProperty('--modal-scroll-top', `-${modalState.y}px`);
      document.body.style.setProperty('--modal-scroll-left', `-${modalState.x}px`);
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    dialog.classList.toggle('wide', !!opts.wide);
    backdrop.hidden = false;
    dialog.scrollTop = 0;
    $('#modalClose').hidden = !!opts.noClose;
    dialog.focus({ preventScroll: true });
    if (modalState) modalState.background.forEach(([el]) => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });
    if (onMount) onMount($('#modalBody'));
    hooks.open.forEach((fn) => fn($('#modalBody'), opts));
    const first = $('#modalBody input:not([type=checkbox]), #modalBody select');
    if (first && !opts.noFocus) setTimeout(() => { if (!backdrop.hidden && first.isConnected) first.focus({ preventScroll: true }); }, 30);
  }
  function closeModal() {
    if ($('#modal').hidden) return;
    const state = modalState;
    modalState = null;
    $('#modal').hidden = true; $('#modalBody').innerHTML = '';
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--modal-scroll-top');
    document.body.style.removeProperty('--modal-scroll-left');
    state.background.forEach(([el, inert, ariaHidden]) => {
      el.inert = inert;
      if (ariaHidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', ariaHidden);
    });
    window.scrollTo(state.x, state.y);
    hooks.close.forEach((fn) => fn());
    if ($('#modal').hidden) {
      const target = state.focus && state.focus.isConnected && state.focus !== document.body && state.focus.getClientRects().length ? state.focus : $('#view');
      target.focus({ preventScroll: true });
    }
  }
  const isModalOpen = () => !$('#modal').hidden;

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !isModalOpen()) return;
    const dialog = $('#modal .modal');
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.focus({ preventScroll: true }); }
    else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement) || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });

  /**
   * fields: [{ name, label, type, options:[[v,l]], value, required, step, half, help, show:(vals)=>bool }]
   */
  function form({ title, fields, submitLabel = 'Save', onSubmit, extraButtons = '', intro = '', onChange, wide, guideKey }) {
    const fieldHtml = (f) => {
      const v = f.value ?? '';
      const req = f.required ? 'required' : '';
      let input;
      if (f.type === 'select') input = `<select name="${f.name}" ${req}>${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
      else if (f.type === 'checkbox') return `<label class="check" data-f="${f.name}"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}/> ${esc(f.label)}</label>`;
      else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="2">${esc(v)}</textarea>`;
      else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${req} ${f.step ? `step="${f.step}"` : f.type === 'number' ? 'step="any"' : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} placeholder="${esc(f.placeholder || '')}"/>`;
      return `<label class="field" data-f="${f.name}">${esc(f.label)}${input}${f.help ? `<span class="field-help">${f.help}</span>` : ''}</label>`;
    };
    let html = '', buf = [];
    fields.forEach((f) => { if (f.half) { buf.push(fieldHtml(f)); if (buf.length === 2) { html += `<div class="two">${buf.join('')}</div>`; buf = []; } } else { if (buf.length) { html += `<div class="two">${buf.join('')}</div>`; buf = []; } html += fieldHtml(f); } });
    if (buf.length) html += `<div class="two">${buf.join('')}</div>`;

    openModal(title, `${intro}<form class="form" id="mform" data-guide-key="${esc(guideKey || '')}">${html}<div id="mpreview"></div><div class="row-actions">${extraButtons}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit">${esc(submitLabel)}</button></div></form>`, (body) => {
      const frm = $('#mform', body);
      const read = () => {
        const out = {};
        fields.forEach((f) => {
          const el = frm.elements[f.name]; if (!el) return;
          out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
        });
        return out;
      };
      const update = () => {
        const vals = read();
        fields.forEach((f) => { if (f.show) { const w = $(`[data-f="${f.name}"]`, frm); if (w) w.style.display = f.show(vals) ? '' : 'none'; } });
        if (onChange) $('#mpreview', frm).innerHTML = onChange(vals) || '';
      };
      frm.addEventListener('change', update); frm.addEventListener('input', update); update();
      body.querySelector('[data-close]').onclick = closeModal;
      frm.onsubmit = (e) => { e.preventDefault(); const r = onSubmit(read()); if (r !== false) closeModal(); };
    }, { wide, guideKey });
  }

  function confirm(msg, onYes, yesLabel = 'Yes, continue') {
    openModal('Please confirm', `<p>${esc(msg)}</p><div class="row-actions"><button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>${esc(yesLabel)}</button></div>`, (b) => {
      b.querySelector('[data-no]').onclick = closeModal;
      b.querySelector('[data-yes]').onclick = () => { closeModal(); onYes(); };
    });
  }

  /* ---------- Charts (pure SVG) ---------- */
  function chartData(headers, rows) {
    if (!rows.length) return '';
    const value = (n) => amountsHidden() ? 'Hidden' : Number.isFinite(n) ? n.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '—';
    return `<details class="chart-data"><summary>View chart data</summary><div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, ...values]) => `<tr><th scope="row">${esc(label)}</th>${values.map((n) => `<td>${esc(value(n))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  function scrollableChart(svg) {
    return `<div class="chart-scroll">${svg}</div><small class="chart-scroll-hint">Scroll to see the full chart</small>`;
  }

  function donut(items, centerTop, centerBottom, size = 180) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const r = size / 2 - 14, c = 2 * Math.PI * r;
    let off = 0;
    const arcs = total ? items.map((i) => { const len = (i.value / total) * c; const a = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${i.color}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(i.label)}</title></circle>`; off += len; return a; }).join('')
      : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
    const svg = `<svg${items.length ? ' aria-hidden="true"' : ''} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}<text x="50%" y="48%" text-anchor="middle" font-weight="700" font-size="17" class="amt">${esc(amountsHidden() ? 'Hidden' : centerTop)}</text><text x="50%" y="60%" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(centerBottom)}</text></svg>`;
    const legend = items.map((i) => `<div><i style="background:${i.color}"></i><span>${esc(i.label)}</span><span>${pct(i.value, total)}%</span></div>`).join('');
    return `<div class="donut-wrap">${svg}<div class="legend">${legend || '<div class="muted">No spending yet</div>'}</div></div>${chartData(['Category', 'Amount'], items.map((i) => [i.label, i.value]))}`;
  }

  function ring(p, size = 130, label = '', color) {
    const r = size / 2 - 10, c = 2 * Math.PI * r, len = Math.min(1, p / 100) * c;
    const col = color || (p >= 100 ? 'var(--bad)' : p >= 80 ? 'var(--warn)' : 'var(--primary)');
    const sw = size < 90 ? 8 : 12, fs = size < 60 ? 11 : size < 90 ? 15 : 22;
    return `<svg width="${size}" height="${size}" style="flex:none"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${sw}"/><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="${label ? '45%' : '50%'}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="700">${p}%</text>${label ? `<text x="50%" y="66%" text-anchor="middle" font-size="10" style="fill:var(--muted)">${esc(label)}</text>` : ''}</svg>`;
  }

  function legendHtml(series) {
    return `<div>${series.map((s) => `<span style="display:inline-flex;gap:6px;align-items:center;margin-right:14px;font-size:12px"><i style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block"></i>${esc(s.label)}</span>`).join('')}</div>`;
  }

  function bars(labels, series, h = 200) {
    const w = 560, pad = 30, max = Math.max(1, ...series.flatMap((s) => s.values));
    const gw = (w - pad) / labels.length, bw = Math.min(22, (gw - 12) / series.length);
    let out = `<line x1="${pad}" y1="${h - 20}" x2="${w}" y2="${h - 20}" class="chart-axis"/>`;
    labels.forEach((l, i) => {
      const x0 = pad + i * gw + (gw - bw * series.length) / 2;
      series.forEach((s, j) => {
        const bh = ((h - 40) * s.values[i]) / max;
        out += `<rect x="${x0 + j * bw}" y="${h - 20 - bh}" width="${bw - 3}" height="${bh}" rx="4" fill="${s.color}"><title>${esc(s.label)}: ${amountsHidden() ? 'Hidden' : Math.round(s.values[i]).toLocaleString()}</title></rect>`;
      });
      out += `<text x="${pad + i * gw + gw / 2}" y="${h - 4}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(l)}</text>`;
    });
    const svg = `<svg${labels.length ? ' aria-hidden="true"' : ''} viewBox="0 0 ${w} ${h}" width="100%">${out}</svg>`;
    return `${legendHtml(series)}${scrollableChart(svg)}${chartData(['Period', ...series.map((s) => s.label)], labels.map((label, i) => [label, ...series.map((s) => s.values[i])]))}`;
  }

  function stacked(labels, series, h = 220) {
    const w = 640, pad = 10, totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const gw = (w - pad * 2) / labels.length, bw = Math.min(34, gw - 10);
    let out = `<line x1="0" y1="${h - 20}" x2="${w}" y2="${h - 20}" class="chart-axis"/>`;
    labels.forEach((l, i) => {
      const x = pad + i * gw + (gw - bw) / 2;
      let y = h - 20;
      series.forEach((s) => {
        const v = s.values[i] || 0; if (!v) return;
        const bh = ((h - 50) * v) / max; y -= bh;
        out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${s.color}" rx="3"><title>${esc(s.label)}: ${amountsHidden() ? 'Hidden' : Math.round(v).toLocaleString()}</title></rect>`;
      });
      out += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10" font-weight="700" class="amt">${amountsHidden() ? 'Hidden' : totals[i] ? (totals[i] / 1000).toFixed(1) + 'k' : '0'}</text>`;
      out += `<text x="${x + bw / 2}" y="${h - 5}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${esc(l)}</text>`;
    });
    const svg = `<svg${labels.length ? ' aria-hidden="true"' : ''} viewBox="0 0 ${w} ${h}" width="100%">${out}</svg>`;
    return `${legendHtml(series)}${scrollableChart(svg)}${chartData(['Period', ...series.map((s) => s.label)], labels.map((label, i) => [label, ...series.map((s) => s.values[i] || 0)]))}`;
  }

  function line(values, { h = 160, color = '#16a34a', labels = [] } = {}) {
    if (values.length < 2) return '<div class="empty">Nothing to chart yet</div>';
    const w = 560, max = Math.max(1, ...values);
    const step = w / (values.length - 1);
    const pts = values.map((v, i) => [i * step, h - 20 - ((h - 30) * v) / max]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${d} L${w},${h - 20} L0,${h - 20} Z`;
    const lab = labels.map(([i, t]) => `<text x="${Math.min(w - 30, Math.max(20, i * step))}" y="${h - 4}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(t)}</text>`).join('');
    const rows = values.map((value, i) => [(labels.find(([index]) => index === i) || [i, i === 0 ? 'Start' : i === values.length - 1 ? 'End' : `Point ${i + 1}`])[1], value]);
    const svg = `<svg aria-hidden="true" viewBox="0 0 ${w} ${h}" width="100%"><path d="${area}" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>${lab}</svg>`;
    return `${scrollableChart(svg)}${chartData(['Point', 'Value'], rows)}`;
  }

  function download(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { $, esc, money, moneyText, pct, monthName, monthShort, shortDate, progress, toast, openModal, closeModal, isModalOpen, hooks, form, confirm, donut, ring, bars, stacked, line, download };
})();
