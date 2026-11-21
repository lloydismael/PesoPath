const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('preview serves the app but not local archives', { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pesopath-serve-'));
  let preview;
  t.after(async () => {
    if (preview && preview.exitCode === null && preview.signalCode === null) {
      const exited = once(preview, 'exit');
      preview.kill();
      await exited;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(__dirname, '..', 'scripts', 'serve.js'), path.join(root, 'scripts', 'serve.js'));
  for (const dir of ['js', 'downloads', 'artifacts', 'artifacts-old']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'index.html'), 'preview');
  fs.writeFileSync(path.join(root, 'js', 'app.js'), 'app asset');
  fs.writeFileSync(path.join(root, 'downloads', 'PesoPath.apk'), 'public package');
  fs.writeFileSync(path.join(root, 'artifacts', 'snapshot.bundle'), 'private archive');
  fs.writeFileSync(path.join(root, 'artifacts-old', 'snapshot.bundle'), 'private archive');

  const reservation = net.createServer().listen(0);
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  preview = spawn(process.execPath, [path.join(root, 'scripts', 'serve.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    preview.once('error', reject);
    preview.once('exit', (code) => reject(new Error(`Preview exited with code ${code}`)));
    let output = '';
    preview.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('server ready')) resolve();
    });
  });

  const base = `http://localhost:${port}`;
  for (const [route, expected] of [['/', 'preview'], ['/js/app.js', 'app asset'], ['/downloads/PesoPath.apk', 'public package']]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), expected, route);
  }
  for (const route of ['/artifacts/snapshot.bundle', '/ARTIFACTS/snapshot.bundle', '/artifacts-old/snapshot.bundle']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    await response.body.cancel();
  }
});
