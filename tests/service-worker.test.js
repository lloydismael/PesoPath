const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

async function main() {
  const handlers = {};
  const deleted = [];
  const current = {
    match: async (key) => typeof key === 'string' ? (key === './index.html' ? 'current shell' : undefined) : 'current asset',
  };
  const context = {
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
    },
    caches: {
      keys: async () => ['pesopath-1.2.0', 'pesopath-1.2.1', 'pesopath-1.2.2', 'pesopath-1.2.3', 'another-app-cache'],
      delete: async (key) => { deleted.push(key); },
      open: async (key) => { assert.strictEqual(key, 'pesopath-1.2.3'); return current; },
      match: async () => 'unrelated stale response',
    },
    fetch: async () => { throw new Error('offline'); },
    URL,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('sw.js', 'utf8'), context);
  let completed;
  handlers.activate({ waitUntil: (promise) => { completed = promise; } });
  await completed;
  assert.deepStrictEqual(deleted, ['pesopath-1.2.0', 'pesopath-1.2.1', 'pesopath-1.2.2'], 'activation must preserve other applications\' caches');

  const fetchRequest = async (request) => {
    let response;
    handlers.fetch({ request, respondWith: (promise) => { response = promise; } });
    return response;
  };
  assert.strictEqual(await fetchRequest({ method: 'GET', mode: 'no-cors', url: 'https://example.test/js/ui.js' }), 'current asset', 'assets must come from the current app cache');
  assert.strictEqual(await fetchRequest({ method: 'GET', mode: 'navigate', url: 'https://example.test/' }), 'current shell', 'offline navigation must use the current app shell');
  for (const url of ['https://example.test/downloads/PesoPath.apk', 'https://example.test/app/downloads/PesoPath-unsigned.ipa?v=1']) {
    assert.strictEqual(await fetchRequest({ method: 'GET', mode: 'navigate', url }), undefined, 'mobile packages must bypass the service worker');
  }

  const html = fs.readFileSync('index.html', 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^\"]+)"/g)].map((match) => match[1]);
  const shell = vm.runInContext('SHELL', context);
  assert(assets.length > 0, 'application assets must be present');
  for (const asset of assets) {
    assert.match(asset, /\?v=1\.2\.3$/, `${asset} must bypass the previous version's cache`);
    assert(shell.includes(`./${asset}`), `${asset} must be precached for offline use`);
  }
  console.log('Service worker cache test passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
