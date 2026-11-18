// Run with Node 22+ and Chrome/Edge: node tests/ui-browser.test.js [modal|display|calendar|charts|layout|pwa|downloads]
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const browserPaths = [
  process.env.CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

async function main() {
  if (typeof WebSocket !== 'function') throw new Error('UI browser tests require Node 22 or newer.');
  const executable = browserPaths.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge not found. Set CHROME_PATH to its executable.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pesopath-ui-test-'));
  const portFile = path.join(profile, 'DevToolsActivePort');
  let serveLegacy = false, offline = false, downloadResponse = 'available';
  const downloadRequests = [];
  const legacyWorker = `
    const CACHE = 'pesopath-legacy-fixture';
    self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './css/styles.css?v=1.2.1', './js/ui.js?v=1.2.1'])).then(() => self.skipWaiting())));
    self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', e => {
      if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
      else e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
    });`;
  const server = http.createServer((req, res) => {
    if (offline) { req.socket.destroy(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (serveLegacy && pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(legacyWorker); return; }
    if (pathname === '/downloads/PesoPath.apk' || pathname === '/downloads/PesoPath-unsigned.ipa') {
      downloadRequests.push({ pathname, method: req.method });
      if (downloadResponse === 'missing') { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': downloadResponse === 'html' ? 'text/html' : 'application/octet-stream' });
      res.end('synthetic download');
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (serveLegacy && pathname === '/index.html') res.end(data.toString().replace(/(\.(?:css|js))\?v=[^"']+/g, '$1?v=1.2.1'));
      else if (serveLegacy && pathname === '/js/ui.js') res.end(data.toString() + '\nwindow.__legacyUiLoaded = true;');
      else res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });
  let socket;
  let send;
  try {
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await wait(100);
    if (!fs.existsSync(portFile)) throw new Error('Browser did not start the DevTools protocol.');
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    const exceptions = [];
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
        return;
      }
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
    };
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const platform = new URLSearchParams(location.search).get('platform');
      if (platform === 'ios' || platform === 'ios-browser') Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
      if (platform === 'android' || platform === 'android-browser') Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
      if (platform === 'ipad-browser') {
        Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15' });
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
      }
      if (platform === 'ios' || platform === 'android') window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true };
      if (platform !== 'pwa' && 'serviceWorker' in navigator) Object.defineProperty(navigator, 'serviceWorker', { value: { register: () => Promise.resolve() } });
    })()` });

    let navigation = 0;
    async function navigate(platform, width = 320, height = 568, mobile = true) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
      const marker = `case=${++navigation}`;
      await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?platform=${platform}&${marker}#/dashboard` });
      for (let i = 0; i < 100 && !await evaluate(`location.search.includes('${marker}') && !!window.PesoPath`); i++) await wait(50);
      await evaluate(`(() => {
        PesoPath.Store.reset('demo');
        if (UI.isModalOpen()) UI.closeModal();
        PesoPath.render();
      })()`);
      await wait(100);
    }
    async function route(name) { await evaluate(`location.hash = '#/${name}'`); await wait(100); }
    async function key(key, shiftKey = false) {
      const keys = { Tab: 9, Escape: 27, Enter: 13 };
      if (!keys[key]) throw new Error(`Unsupported test key: ${key}`);
      const event = { key, code: key, windowsVirtualKeyCode: keys[key], modifiers: shiftKey ? 8 : 0 };
      await send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', ...event, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    }
    async function touchPan(x, from, to) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from, id: 0 }] });
      for (let i = 1; i <= 8; i++) {
        await wait(20);
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 8, id: 0 }] });
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await wait(350);
    }
    async function openTransaction(platform) {
      await navigate(platform);
      const before = await evaluate(`(() => {
        document.querySelector('#quickAdd').focus({ preventScroll: true });
        window.scrollTo(0, 350);
        const y = window.scrollY;
        document.querySelector('#quickAdd').click();
        return y;
      })()`);
      await wait(100);
      return before;
    }

    const tests = [];
    const test = (group, name, run) => tests.push({ group, name, run });
    for (const platform of ['ios', 'android', 'web']) {
      test('modal', `${platform}: form scroll stays inside the dialog and restores the page`, async () => {
        const originalY = await openTransaction(platform);
        const before = await evaluate(`(() => {
          const modal = document.querySelector('#modal .modal');
          modal.scrollTop = 0;
          return { pageTop: document.querySelector('.main').getBoundingClientRect().top, max: modal.scrollHeight - modal.clientHeight,
            backgroundInert: document.querySelector('.app').inert, backgroundHidden: document.querySelector('.app').getAttribute('aria-hidden') };
        })()`);
        assert(before.max > 0, 'the small-screen transaction form must be scrollable');
        assert(before.backgroundInert && before.backgroundHidden === 'true', 'the background must be unavailable to assistive technology');
        await touchPan(160, 420, 180);
        const afterPan = await evaluate(`({ pageTop: document.querySelector('.main').getBoundingClientRect().top, modal: document.querySelector('#modal .modal').scrollTop })`);
        assert(afterPan.modal > 0, 'swiping must scroll the form');
        assert(Math.abs(afterPan.pageTop - before.pageTop) < 2, 'swiping at the form boundary moved the background');
        await evaluate(`document.querySelector('#modal .modal').scrollTop = 99999`);
        const atBottom = await evaluate(`document.querySelector('.main').getBoundingClientRect().top`);
        await touchPan(160, 420, 180);
        const afterBottom = await evaluate(`document.querySelector('.main').getBoundingClientRect().top`);
        assert(Math.abs(afterBottom - atBottom) < 2, 'swiping past the bottom moved the background');
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 160, y: 400, deltaX: 0, deltaY: 400 });
        await wait(150);
        const afterWheel = await evaluate(`document.querySelector('.main').getBoundingClientRect().top`);
        assert(Math.abs(afterWheel - atBottom) < 2, 'wheel scrolling at the form boundary moved the background');
        await evaluate(`document.querySelector('#modal .modal').scrollTop = 0`);
        const atTop = await evaluate(`document.querySelector('.main').getBoundingClientRect().top`);
        await touchPan(160, 180, 420);
        assert(Math.abs(await evaluate(`document.querySelector('.main').getBoundingClientRect().top`) - atTop) < 2, 'swiping past the top moved the background');
        await evaluate(`document.querySelector('#modalClose').click()`);
        const closed = await evaluate(`({ y: window.scrollY, focus: document.activeElement.id, inert: document.querySelector('.app').inert, hidden: document.querySelector('.app').getAttribute('aria-hidden') })`);
        assert(Math.abs(closed.y - originalY) < 2, 'closing must restore the original page position');
        assert.strictEqual(closed.focus, 'quickAdd', 'closing must return focus to the opener');
        assert(!closed.inert && closed.hidden === null, 'closing must restore background accessibility');
      });
      test('modal', `${platform}: keyboard focus remains in an open dialog`, async () => {
        await openTransaction(platform);
        await evaluate(`(() => { const m = document.querySelector('#modal .modal'); const b = [...m.querySelectorAll('button:not([hidden])')]; b[b.length - 1].focus(); })()`);
        await key('Tab');
        assert(await evaluate(`!!document.activeElement.closest('#modal .modal')`), 'Tab escaped into the background');
        await key('Tab', true);
        assert(await evaluate(`!!document.activeElement.closest('#modal .modal')`), 'Shift+Tab escaped into the background');
      });
      test('display', `${platform}: OLED colors and text have sufficient contrast`, async () => {
        await navigate(platform);
        const value = await evaluate(`(() => {
          const s = PesoPath.Store.get().settings; s.theme = 'dark'; s.onboard.active = true; PesoPath.render();
          const sample = (selector) => {
            const style = getComputedStyle(document.querySelector(selector));
            const lum = (c) => { const rgb = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
            const a = lum(style.color), b = lum(style.backgroundColor);
            return { background: style.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
          };
          return { background: getComputedStyle(document.body).backgroundColor, card: getComputedStyle(document.querySelector('.card')).backgroundColor, setup: sample('.setup-hero .next-box'), primary: sample('#quickAdd') };
        })()`);
        assert.strictEqual(value.background, 'rgb(0, 0, 0)', 'dark mode must use a black canvas');
        assert.notStrictEqual(value.card, value.background, 'cards must remain distinguishable from the canvas');
        assert(value.setup.contrast >= 4.5, `setup text contrast is ${value.setup.contrast.toFixed(2)}:1`);
        assert(value.primary.contrast >= 4.5, `primary button contrast is ${value.primary.contrast.toFixed(2)}:1`);
      });
      test('display', `${platform}: light and dark status colors remain readable`, async () => {
        await navigate(platform);
        const result = await evaluate(`(() => {
          const luminance = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          return ['light', 'dark'].flatMap((theme) => {
            PesoPath.Store.get().settings.theme = theme; PesoPath.render();
            return ['btn primary', 'btn danger', 'btn', 'badge bad', 'badge ok', 'badge warn', 'badge info'].map((classes) => {
              const el = document.createElement('span'); el.className = classes; el.textContent = 'Example'; document.body.appendChild(el);
              const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
              const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); el.remove();
              return { theme, classes, contrast };
            });
          });
        })()`);
        for (const { theme, classes, contrast } of result) assert(contrast >= 4.5, `${theme} ${classes} contrast is ${contrast.toFixed(2)}:1`);
      });
      test('display', `${platform}: display controls preserve unsaved Settings edits`, async () => {
        await navigate(platform);
        await route('settings');
        const result = await evaluate(`(() => {
          const input = document.querySelector('#settingsForm input[name="name"]');
          input.value = 'Unsaved synthetic value';
          const theme = document.querySelector('#settingsThemeBtn');
          const privacy = document.querySelector('#settingsPrivacyBtn');
          if (!theme || !privacy || !theme.getClientRects().length || !privacy.getClientRects().length) return { available: false };
          theme.click(); privacy.click();
          return { available: true, draft: document.querySelector('#settingsForm input[name="name"]').value,
            theme: PesoPath.Store.get().settings.theme, privacy: PesoPath.Store.get().settings.privacy,
            themePressed: theme.getAttribute('aria-pressed'), privacyPressed: privacy.getAttribute('aria-pressed'),
            themeColor: document.querySelector('meta[name="theme-color"]').content };
        })()`);
        assert(result.available, 'theme and privacy controls must be available on mobile');
        assert.strictEqual(result.draft, 'Unsaved synthetic value');
        assert.strictEqual(result.theme, 'dark');
        assert.strictEqual(result.privacy, true);
        assert.strictEqual(result.themePressed, 'true');
        assert.strictEqual(result.privacyPressed, 'true');
        assert.strictEqual(result.themeColor, '#000000');
      });
      test('charts', `${platform}: privacy hides chart values and mobile labels remain readable`, async () => {
        await navigate(platform);
        await evaluate(`PesoPath.Store.get().settings.privacy = true`);
        await route('reports');
        const result = await evaluate(`(() => {
          const svg = [...document.querySelectorAll('#view svg')].find((el) => el.viewBox.baseVal.width === 560 && el.querySelector('text'));
          const label = svg.querySelector('text');
          return { title: svg.querySelector('rect title').textContent,
            center: document.querySelector('#view svg text.amt').textContent,
            filter: getComputedStyle(document.querySelector('#view svg text.amt')).filter,
            labelSize: parseFloat(getComputedStyle(label).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
            table: !!document.querySelector('.chart-data') };
        })()`);
        assert.match(result.title, /Hidden/, 'chart tooltip exposed an amount');
        assert.strictEqual(result.center, 'Hidden', 'chart center exposed an amount');
        assert.strictEqual(result.filter, 'none', 'the Hidden label must remain readable');
        assert(result.labelSize >= 12, `chart label is only ${result.labelSize.toFixed(1)}px`);
        assert(result.table, 'chart data must have a readable text alternative');
      });
      test('charts', `${platform}: the installment timeline is readable and has a data alternative`, async () => {
        await navigate(platform);
        await route('installments');
        const result = await evaluate(`(() => {
          document.querySelector('[data-key="instTab"][data-id="timeline"]').click();
          const svg = [...document.querySelectorAll('#view svg')].find((el) => el.viewBox.baseVal.width >= 980);
          const label = svg.querySelector('text');
          return { labelSize: parseFloat(getComputedStyle(label).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
            rows: document.querySelectorAll('.chart-data tbody tr').length, installments: PesoPath.Store.get().installments.length };
        })()`);
        assert(result.labelSize >= 12, `timeline label is only ${result.labelSize.toFixed(1)}px`);
        assert.strictEqual(result.rows, result.installments, 'timeline data must include each installment');
      });
      test('layout', `${platform}: small screens retain reachable controls`, async () => {
        await navigate(platform);
        await route('accounts');
        const result = await evaluate(`(() => {
          const width = document.documentElement.clientWidth;
          const remove = document.querySelector('[data-action="delAccount"]');
          const month = document.querySelector('#prevMonth').getBoundingClientRect();
          return { width, scrollWidth: document.documentElement.scrollWidth, removeRight: remove.getBoundingClientRect().right,
            removeName: remove.getAttribute('aria-label') || remove.title || remove.textContent,
            monthWidth: month.width, monthHeight: month.height };
        })()`);
        assert(result.scrollWidth <= result.width && result.removeRight <= result.width, 'account actions overflow the viewport');
        const minimum = platform === 'android' ? 48 : 44;
        assert(result.monthWidth >= minimum && result.monthHeight >= minimum, `month control must be at least ${minimum}px`);
        assert.match(result.removeName, /delete|remove/i, 'delete control needs an understandable name');
      });
      test('layout', `${platform}: 320px pages do not overflow`, async () => {
        await navigate(platform);
        const failures = [];
        for (const name of ['dashboard', 'transactions', 'budget', 'debts', 'installments', 'goals', 'bills', 'reports', 'accounts', 'settings', 'more']) {
          await route(name);
          const widths = await evaluate(`({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth })`);
          if (widths.page > widths.viewport) failures.push(`${name}: ${widths.page}px`);
        }
        assert.deepStrictEqual(failures, [], `horizontal page overflow: ${failures.join(', ')}`);
      });
      test('layout', `${platform}: current navigation is announced`, async () => {
        await navigate(platform);
        await route('accounts');
        const labels = await evaluate(`({ bottom: document.querySelector('#bottomNav a.active').getAttribute('aria-current'), side: document.querySelector('#nav a.active').getAttribute('aria-current') })`);
        assert.strictEqual(labels.bottom, 'page');
        assert.strictEqual(labels.side, 'page');
      });
      test('calendar', `${platform}: choose a month and year without repeated navigation`, async () => {
        await navigate(platform);
        await route('transactions');
        await evaluate(`(() => {
          const s = PesoPath.Store.get();
          PesoPath.Store.upsert('transactions', { type: 'expense', amount: 123, date: '2024-02-14', note: 'Synthetic month jump', accountId: s.accounts[0].id, categoryId: s.categories.find((c) => c.group !== 'income').id });
          document.querySelector('#monthLabel').focus(); document.querySelector('#monthLabel').click();
        })()`);
        const popup = await evaluate(`(() => {
          const buttons = [...document.querySelectorAll('#monthPickerMonths [data-month]')];
          return { open: UI.isModalOpen(), title: document.querySelector('#modalTitle').textContent,
            selected: buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').length,
            size: buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
            viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth };
        })()`);
        assert(popup.open && /choose month/i.test(popup.title), 'month selector must open a labeled dialog');
        assert.strictEqual(popup.selected, 1, 'the selected month must be announced');
        assert.strictEqual(popup.size.length, 12, 'all months must be available');
        assert(popup.page <= popup.viewport, 'month selector must fit the screen');
        const minimum = platform === 'android' ? 48 : 44;
        assert(popup.size.every((size) => size.width >= minimum && size.height >= minimum), 'month targets must be large enough to tap');
        await evaluate(`(() => { const year = document.querySelector('#monthPickerYear'); year.value = '2024'; year.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#monthPickerMonths [data-month="2"]').click(); })()`);
        const chosen = await evaluate(`({ label: document.querySelector('#monthLabel').textContent.trim(), transaction: document.querySelector('#view').textContent.includes('Synthetic month jump'), stored: PesoPath.Store.get().transactions.some((t) => t.note === 'Synthetic month jump'), open: UI.isModalOpen() })`);
        assert.match(chosen.label, /February 2024/);
        assert(chosen.transaction && chosen.stored && !chosen.open, 'selection must update the view without changing data');
        await evaluate(`document.querySelector('#prevMonth').click()`);
        assert.match(await evaluate(`document.querySelector('#monthLabel').textContent`), /January 2024/);
        await evaluate(`document.querySelector('#prevMonth').click()`);
        assert.match(await evaluate(`document.querySelector('#monthLabel').textContent`), /December 2023/);
        await evaluate(`document.querySelector('#nextMonth').click()`);
        assert.match(await evaluate(`document.querySelector('#monthLabel').textContent`), /January 2024/);
        await evaluate(`document.querySelector('#monthLabel').focus(); document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerYear').value = '2021'; document.querySelector('#modalClose').click()`);
        const cancelled = await evaluate(`({ label: document.querySelector('#monthLabel').textContent, focus: document.activeElement.id })`);
        assert.match(cancelled.label, /January 2024/, 'closing must not apply an unfinished selection');
        assert.strictEqual(cancelled.focus, 'monthLabel', 'focus must return to the month selector');
        await evaluate(`document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerToday').click()`);
        const today = await evaluate(`({ label: document.querySelector('#monthLabel').textContent, expected: UI.monthName(PesoPath.Store.monthKey(PesoPath.Store.todayISO())) })`);
        assert.strictEqual(today.label.trim(), today.expected, 'the shortcut must return to the current month');
      });
    }
    test('modal', 'non-dismissible and replacement dialogs preserve scroll and focus', async () => {
      await navigate('ios');
      const before = await evaluate(`(() => {
        document.querySelector('#quickAdd').focus({ preventScroll: true });
        window.scrollTo(0, 350);
        const y = window.scrollY;
        UI.openModal('Welcome', '<input id="welcomeInput"><button>Continue</button>', null, { noClose: true, noFocus: true });
        return y;
      })()`);
      await wait(100);
      assert(await evaluate(`document.activeElement.matches('#modal .modal')`), 'welcome must focus the dialog without opening the keyboard');
      await key('Escape');
      await evaluate(`document.querySelector('#modal').click()`);
      assert(await evaluate(`UI.isModalOpen()`), 'a non-dismissible dialog must remain open');
      await evaluate(`UI.openModal('Replacement', '<button id="replacement">Close</button>', null, { noFocus: true })`);
      await evaluate(`UI.closeModal()`);
      const after = await evaluate(`({ y: window.scrollY, focus: document.activeElement.id })`);
      assert(Math.abs(after.y - before) < 2, 'replacing a dialog must retain the original page position');
      assert.strictEqual(after.focus, 'quickAdd', 'replacing a dialog must retain the original opener');
    });
    test('modal', 'PIN unlock hands off to the non-dismissible welcome dialog', async () => {
      await navigate('ios');
      await evaluate(`PesoPath.Store.get().settings.pin = '1234'; PesoPath.Store.get().settings.onboard.welcome = true; PesoPath.Store.save()`);
      await send('Page.reload');
      for (let i = 0; i < 100 && !await evaluate(`!!document.querySelector('#pinForm')`); i++) await wait(50);
      await key('Escape');
      assert(await evaluate(`!!document.querySelector('#pinForm')`), 'PIN must not be dismissible');
      await evaluate(`document.querySelector('#pinForm input').value = '1234'; document.querySelector('#pinForm').requestSubmit()`);
      await wait(100);
      const welcome = await evaluate(`({ open: UI.isModalOpen(), title: document.querySelector('#modalTitle').textContent, focus: document.activeElement.matches('#modal .modal') })`);
      assert(welcome.open && welcome.title.includes('Welcome'), 'unlock must open the welcome dialog');
      assert(welcome.focus, 'welcome must not reopen the keyboard');
      await evaluate(`document.querySelector('[data-w="demo"]').click()`);
      assert(!await evaluate(`UI.isModalOpen()`), 'welcome choice must close the dialog');
    });
    test('modal', 'guide overlays do not obscure an open dialog and return on close', async () => {
      await navigate('ios');
      const result = await evaluate(`(() => {
        const next = document.querySelector('#guideNext'), spot = document.querySelector('#spotLayer');
        next.hidden = false; next.textContent = 'Next setup step';
        spot.hidden = false; spot.innerHTML = '<div class="spot-block" style="inset:0"></div>';
        document.querySelector('#quickAdd').click();
        const visible = (el) => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const during = [visible(next), visible(spot)];
        UI.closeModal();
        return { during, after: [visible(next), visible(spot)] };
      })()`);
      assert.deepStrictEqual(result.during, [false, false], 'guide overlays must not cover modal content');
      assert.deepStrictEqual(result.after, [true, true], 'temporarily hidden guide overlays must return after closing');
    });
    test('modal', 'saving a form returns focus to the updated page', async () => {
      await navigate('web');
      await route('debts');
      await evaluate(`(() => {
        const button = document.querySelector('[data-action="addDebt"]');
        button.focus(); button.click();
        const form = document.querySelector('#mform');
        form.elements.name.value = 'Synthetic creditor';
        form.elements.balance.value = '100';
        form.elements.apr.value = '12';
        form.elements.minPayment.value = '20';
        form.requestSubmit();
      })()`);
      const result = await evaluate(`({ saved: PesoPath.Store.get().debts.some((debt) => debt.name === 'Synthetic creditor'), active: document.activeElement.id })`);
      assert(result.saved, 'the synthetic debt must be saved');
      assert.strictEqual(result.active, 'view', 'focus must return to the page when its opener was replaced');
    });
    test('modal', 'keyboard focus wrapping reveals the focused control', async () => {
      await navigate('web');
      await evaluate(`UI.openModal('Long dialog', '<div style="height:1000px"></div><button id="bottomFocus">Last action</button>', null, { noFocus: true }); document.querySelector('#modalClose').focus()`);
      await key('Tab', true);
      const result = await evaluate(`(() => {
        const modal = document.querySelector('#modal .modal').getBoundingClientRect();
        const target = document.activeElement.getBoundingClientRect();
        return { id: document.activeElement.id, top: target.top, bottom: target.bottom, modalTop: modal.top, modalBottom: modal.bottom };
      })()`);
      assert.strictEqual(result.id, 'bottomFocus');
      assert(result.top >= result.modalTop && result.bottom <= result.modalBottom, 'wrapped focus must be visible inside the dialog');
    });
    test('display', 'switching theme in the iOS header preserves an unsaved Settings draft', async () => {
      await navigate('ios', 393, 852);
      await route('settings');
      const draft = await evaluate(`(() => { document.querySelector('#settingsForm input[name="name"]').value = 'Unsaved synthetic value'; document.querySelector('#iosThemeBtn').click(); return document.querySelector('#settingsForm input[name="name"]').value; })()`);
      assert.strictEqual(draft, 'Unsaved synthetic value');
    });
    test('display', 'iOS display controls use accessible state-aware icons', async () => {
      await navigate('ios', 393, 852);
      const state = await evaluate(`(() => {
        const privacy = document.querySelector('#iosPrivacyBtn'), theme = document.querySelector('#iosThemeBtn');
        const snapshot = (button) => ({ svg: button.querySelector('svg')?.outerHTML || '', decorative: button.querySelector('svg')?.getAttribute('aria-hidden'),
          label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed'), text: button.textContent.trim(),
          width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height });
        const before = [snapshot(privacy), snapshot(theme)];
        privacy.click(); theme.click();
        return { before, after: [snapshot(privacy), snapshot(theme)], settings: { privacy: PesoPath.Store.get().settings.privacy, theme: PesoPath.Store.get().settings.theme } };
      })()`);
      for (const button of [...state.before, ...state.after]) {
        assert(button.svg && button.decorative === 'true' && !button.text, 'display controls must show decorative icons rather than text');
        assert(button.width >= 44 && button.height >= 44, 'display controls must remain large enough to tap');
      }
      assert.match(state.before[0].label, /hide amounts/i);
      assert.match(state.after[0].label, /show amounts/i);
      assert.match(state.before[1].label, /dark theme/i);
      assert.match(state.after[1].label, /light theme/i);
      assert.notStrictEqual(state.before[0].svg, state.after[0].svg, 'privacy icon must reflect its action');
      assert.notStrictEqual(state.before[1].svg, state.after[1].svg, 'theme icon must reflect its action');
      assert.deepStrictEqual(state.after.map((button) => button.pressed), ['true', 'true']);
      assert(state.settings.privacy && state.settings.theme === 'dark', 'icons must still toggle the settings');
    });
    test('calendar', 'year entry validates and month changes preserve Settings drafts', async () => {
      await navigate('ios', 320, 568);
      await route('settings');
      await evaluate(`document.querySelector('#settingsForm input[name="name"]').value = 'Unsaved calendar draft'; document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerYear').value = '999'; document.querySelector('#monthPickerMonths [data-month="3"]').click()`);
      assert(await evaluate(`UI.isModalOpen() && !document.querySelector('#monthPickerYear').checkValidity()`), 'an invalid year must not select a month');
      await evaluate(`(() => { const year = document.querySelector('#monthPickerYear'); year.value = '2025'; year.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#monthPickerPreviousYear').click(); })()`);
      assert.strictEqual(await evaluate(`document.querySelector('#monthPickerYear').value`), '2024', 'year controls must change the draft year');
      await evaluate(`document.querySelector('#monthPickerMonths [data-month="3"]').click(); document.querySelector('#nextMonth').click(); document.querySelector('#prevMonth').click()`);
      const result = await evaluate(`({ label: document.querySelector('#monthLabel').textContent.trim(), draft: document.querySelector('#settingsForm input[name="name"]').value })`);
      assert.match(result.label, /March 2024/);
      assert.strictEqual(result.draft, 'Unsaved calendar draft', 'changing the month must not discard Settings edits');
    });
    test('calendar', 'keyboard users can open and select a month', async () => {
      await navigate('web', 1024, 768, false);
      await evaluate(`document.querySelector('#monthLabel').focus()`);
      assert.strictEqual(await evaluate(`document.activeElement.id`), 'monthLabel', 'the month selector must be keyboard focusable');
      await key('Enter');
      assert(await evaluate(`UI.isModalOpen()`), 'Enter must open the month selector');
      await evaluate(`(() => { const year = document.querySelector('#monthPickerYear'); year.value = '2028'; year.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#monthPickerMonths [data-month="11"]').focus(); })()`);
      await key('Enter');
      const result = await evaluate(`({ label: document.querySelector('#monthLabel').textContent.trim(), focus: document.activeElement.id, open: UI.isModalOpen() })`);
      assert.match(result.label, /November 2028/);
      assert.strictEqual(result.focus, 'monthLabel');
      assert(!result.open, 'selecting a month must close the dialog');
    });
    test('calendar', 'year controls stop at valid date boundaries', async () => {
      await navigate('web');
      await evaluate(`document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerYear').value = '1000'; document.querySelector('#monthPickerYear').dispatchEvent(new Event('input', { bubbles: true }))`);
      assert(await evaluate(`document.querySelector('#monthPickerPreviousYear').disabled`), 'year cannot move below its valid range');
      await evaluate(`document.querySelector('#monthPickerMonths [data-month="1"]').click()`);
      assert(await evaluate(`document.querySelector('#prevMonth').disabled`), 'month cannot move below its valid range');
      await evaluate(`document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerYear').value = '9999'; document.querySelector('#monthPickerYear').dispatchEvent(new Event('input', { bubbles: true }))`);
      assert(await evaluate(`document.querySelector('#monthPickerNextYear').disabled`), 'year cannot move beyond its valid range');
      await evaluate(`document.querySelector('#monthPickerMonths [data-month="12"]').click()`);
      assert(await evaluate(`document.querySelector('#nextMonth').disabled`), 'month cannot move beyond its valid range');
      await evaluate(`document.querySelector('#monthLabel').click(); document.querySelector('#monthPickerToday').click()`);
      assert(await evaluate(`!document.querySelector('#prevMonth').disabled && !document.querySelector('#nextMonth').disabled`), 'returning to the current month must restore navigation');
    });
    test('display', 'display settings persist without changing saved financial data', async () => {
      await navigate('ios');
      const before = await evaluate(`(() => {
        const s = PesoPath.Store.get(); s.accounts[0].opening = 12345.67; PesoPath.Store.save();
        const financial = JSON.stringify({ accounts: s.accounts, transactions: s.transactions, debts: s.debts });
        document.querySelector('#iosThemeBtn').click(); document.querySelector('#iosPrivacyBtn').click();
        return financial;
      })()`);
      await send('Page.reload');
      for (let i = 0; i < 100 && !await evaluate(`!!window.PesoPath && document.documentElement.dataset.theme === 'dark'`); i++) await wait(50);
      const after = await evaluate(`(() => { const s = PesoPath.Store.get(); return { financial: JSON.stringify({ accounts: s.accounts, transactions: s.transactions, debts: s.debts }), theme: s.settings.theme, privacy: s.settings.privacy }; })()`);
      assert.strictEqual(after.financial, before);
      assert.strictEqual(after.theme, 'dark');
      assert.strictEqual(after.privacy, true);
    });
    test('display', 'synthetic backup and restore still round-trip the original data', async () => {
      await navigate('web');
      await route('settings');
      const result = await evaluate(`(async () => {
        const s = PesoPath.Store.get(); s.settings.privacy = true; s.accounts[0].opening = 12345.67; PesoPath.Store.save();
        const expected = JSON.stringify(s);
        let exported;
        const createURL = URL.createObjectURL, anchorClick = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = (blob) => { exported = blob; return createURL.call(URL, blob); };
        HTMLAnchorElement.prototype.click = function () {};
        document.querySelector('[data-action="exportJson"]').click();
        URL.createObjectURL = createURL; HTMLAnchorElement.prototype.click = anchorClick;
        const json = await exported.text();
        PesoPath.Store.get().accounts[0].opening = 1; PesoPath.Store.save();
        const inputClick = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function () {
          if (this.type !== 'file') return inputClick.call(this);
          const data = new DataTransfer(); data.items.add(new File([json], 'test-backup.json', { type: 'application/json' }));
          this.files = data.files; this.dispatchEvent(new Event('change'));
        };
        document.querySelector('[data-action="importJson"]').click();
        HTMLInputElement.prototype.click = inputClick;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { restored: JSON.stringify(PesoPath.Store.get()) === expected, containsAmount: JSON.parse(json).accounts[0].opening === 12345.67 };
      })()`);
      assert(result.restored, 'backup must restore the original data');
      assert(result.containsAmount, 'privacy mode must not corrupt exported data');
    });
    test('charts', 'privacy hides the simulator payment summary', async () => {
      await navigate('web');
      await evaluate(`PesoPath.Store.get().settings.privacy = true; PesoPath.Store.get().settings.extra = 12345`);
      await route('debts');
      await evaluate(`document.querySelector('[data-key="debtTab"][data-id="sim"]').click()`);
      const label = await evaluate(`document.querySelector('[data-action="saveExtra"]').textContent`);
      assert.match(label, /Hidden/);
      assert.doesNotMatch(label, /12,345/);
    });
    test('charts', 'privacy hides the balance in a debt payment label', async () => {
      await navigate('web');
      await evaluate(`PesoPath.Store.get().settings.privacy = true; PesoPath.Store.get().debts[0].balance = 67891`);
      await route('debts');
      await evaluate(`document.querySelector('[data-action="payDebt"]').click()`);
      const label = await evaluate(`document.querySelector('#mform [data-f="amount"]').textContent`);
      assert.match(label, /Hidden/);
      assert.doesNotMatch(label, /67,891/);
    });
    test('charts', 'privacy hides the affordability result amount', async () => {
      await navigate('web');
      await evaluate(`PesoPath.Store.get().settings.privacy = true; PesoPath.render(); document.querySelector('[data-action="afford"]').click(); document.querySelector('#mform [name="name"]').value = 'Synthetic purchase'; document.querySelector('#mform [name="price"]').value = 12345; document.querySelector('#mform').requestSubmit()`);
      await wait(100);
      const title = await evaluate(`document.querySelector('#modalTitle').textContent`);
      assert.match(title, /Hidden/);
      assert.doesNotMatch(title, /12,345/);
    });
    test('display', 'dark-mode budget call to action retains readable contrast', async () => {
      await navigate('web');
      await evaluate(`PesoPath.Store.get().settings.theme = 'dark'; PesoPath.Store.get().budgets = {}`);
      await route('budget');
      const contrast = await evaluate(`(() => {
        const style = getComputedStyle(document.querySelector('[data-action="autoBudget"]'));
        const luminance = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      })()`);
      assert(contrast >= 4.5, `budget button contrast is ${contrast.toFixed(2)}:1`);
    });
    test('layout', 'icon-only actions have understandable accessible names', async () => {
      await navigate('web');
      const missing = [];
      for (const name of ['transactions', 'debts', 'installments', 'goals', 'bills', 'accounts']) {
        await route(name);
        const unlabeled = await evaluate(`([...document.querySelectorAll('#view .icon-btn[data-action], #view a[data-action="editCat"]')].filter((el) => !/edit|delete|remove|skip|move/i.test(el.getAttribute('aria-label') || el.title || '')).map((el) => el.dataset.action))`);
        missing.push(...unlabeled.map((action) => `${name}:${action}`));
      }
      assert.deepStrictEqual(missing, [], `unlabeled actions: ${missing.join(', ')}`);
    });
    test('layout', 'reduced-motion preference is respected on the web', async () => {
      await navigate('web');
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const duration = await evaluate(`(() => { const el = document.createElement('span'); el.className = 'seg late'; document.body.appendChild(el); const duration = getComputedStyle(el).animationDuration; el.remove(); return duration; })()`);
      await send('Emulation.setEmulatedMedia', { features: [] });
      assert(parseFloat(duration) <= 0.001, `animation remains active for ${duration}`);
    });
    test('downloads', 'Android browsers offer a dismissible APK without starting a download', async () => {
      downloadResponse = 'available'; downloadRequests.length = 0;
      await navigate('android-browser', 320, 568);
      for (let i = 0; i < 100 && !await evaluate(`document.querySelector('#mobileDownloadOffer') && !document.querySelector('#mobileDownloadOffer').hidden`); i++) await wait(50);
      const offer = await evaluate(`(() => {
        const panel = document.querySelector('#mobileDownloadOffer'), link = document.querySelector('#mobileDownloadLink');
        const button = document.querySelector('#mobileDownloadDismiss').getBoundingClientRect();
        return { visible: !panel.hidden, label: link.textContent, href: link.getAttribute('href'), details: panel.textContent,
          width: document.documentElement.scrollWidth, viewport: innerWidth, buttonWidth: button.width, buttonHeight: button.height };
      })()`);
      assert(offer.visible && /android.*apk/i.test(offer.label), 'Android must offer its APK');
      assert.strictEqual(offer.href, './downloads/PesoPath.apk');
      assert.match(offer.details, /install unknown apps/i);
      assert(offer.width <= offer.viewport && offer.buttonWidth >= 44 && offer.buttonHeight >= 44, 'the offer must fit and be easy to dismiss');
      assert(downloadRequests.some((request) => request.method === 'HEAD'), 'availability must be checked');
      assert(!downloadRequests.some((request) => request.method === 'GET'), 'the package must not download until requested');
      await evaluate(`document.querySelector('#mobileDownloadDismiss').click()`);
      assert(await evaluate(`document.querySelector('#mobileDownloadOffer').hidden`), 'the offer must be dismissible');
    });
    for (const platform of ['ios-browser', 'ipad-browser']) {
      test('downloads', `${platform}: offer the unsigned IPA and explain signing`, async () => {
        downloadResponse = 'available';
        await navigate(platform, 393, 852);
        for (let i = 0; i < 100 && !await evaluate(`document.querySelector('#mobileDownloadOffer') && !document.querySelector('#mobileDownloadOffer').hidden`); i++) await wait(50);
        const offer = await evaluate(`(() => { const panel = document.querySelector('#mobileDownloadOffer'), link = document.querySelector('#mobileDownloadLink'); return { visible: !panel.hidden, label: link.textContent, href: link.getAttribute('href'), details: panel.textContent }; })()`);
        assert(offer.visible && /unsigned.*ipa/i.test(offer.label), 'iOS must offer the unsigned IPA');
        assert.strictEqual(offer.href, './downloads/PesoPath-unsigned.ipa');
        assert.match(offer.details, /sign.*sideload/i);
        assert.match(offer.details, /add to home screen/i);
      });
    }
    test('downloads', 'native apps, desktop browsers, and missing downloads do not show an offer', async () => {
      downloadResponse = 'available';
      for (const platform of ['ios', 'android', 'web']) {
        await navigate(platform);
        assert(await evaluate(`document.querySelector('#mobileDownloadOffer').hidden`), `${platform} must not show the mobile browser offer`);
      }
      for (const response of ['missing', 'html']) {
        downloadResponse = response;
        await navigate('android-browser');
        await wait(200);
        assert(await evaluate(`document.querySelector('#mobileDownloadOffer').hidden`), `${response} must not appear as a downloadable APK`);
      }
      downloadResponse = 'available';
    });
    test('pwa', 'the first upgrade loads current assets and remains usable offline', async () => {
      serveLegacy = true;
      const base = `http://127.0.0.1:${server.address().port}/`;
      await send('Page.navigate', { url: `${base}?platform=pwa&legacy=1` });
      for (let i = 0; i < 100 && !await evaluate(`!!navigator.serviceWorker.controller`); i++) await wait(50);
      assert(await evaluate(`!!navigator.serviceWorker.controller`), 'legacy worker must control the test page');
      assert(await evaluate(`caches.has('pesopath-legacy-fixture')`), 'legacy assets must be cached');
      serveLegacy = false;
      await send('Page.navigate', { url: `${base}?platform=pwa&upgrade=1` });
      for (let i = 0; i < 100 && !await evaluate(`location.search.includes('upgrade=1') && !!window.PesoPath`); i++) await wait(50);
      const result = await evaluate(`({ legacy: !!window.__legacyUiLoaded, current: !!window.PesoPath })`);
      assert(result.current, 'the upgraded application must load');
      assert(!result.legacy, 'the upgraded page must not execute the previous cached UI');
      await evaluate(`PesoPath.Store.reset('demo'); PesoPath.Store.get().settings.privacy = true; PesoPath.Store.save()`);
      for (let i = 0; i < 100 && !await evaluate(`caches.has('pesopath-1.2.3').then(async (found) => found && !(await caches.has('pesopath-legacy-fixture')))`); i++) await wait(50);
      assert(await evaluate(`caches.has('pesopath-1.2.3').then(async (found) => found && !(await caches.has('pesopath-legacy-fixture')))`), 'the new worker must activate');
      offline = true;
      await send('Page.navigate', { url: `${base}?platform=pwa&offline=1` });
      for (let i = 0; i < 100 && !await evaluate(`location.search.includes('offline=1') && !!window.PesoPath`); i++) await wait(50);
      const restored = await evaluate(`({ current: !!window.PesoPath, privacy: UI.money(12345).includes('Hidden') })`);
      assert(restored.current && restored.privacy, 'the current app and saved privacy setting must work offline');
      offline = false;
    });
    const selected = process.argv[2];
    if (selected && !tests.some((item) => item.group === selected)) throw new Error(`Unknown UI test group: ${selected}`);
    let failures = 0;
    for (const { group, name, run } of tests.filter((item) => !selected || item.group === selected)) {
      try { await run(); console.log(`PASS ${name}`); }
      catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
    }
    assert.deepStrictEqual(exceptions, [], 'unexpected uncaught browser exceptions');
    if (failures) throw new Error(`${failures} UI browser test(s) failed`);
    console.log('UI browser tests passed');
  } finally {
    if (send && socket && socket.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {});
    if (socket) socket.close();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise((resolve) => browser.once('exit', resolve));
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
