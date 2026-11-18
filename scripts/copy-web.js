/* Copies the static app into dist/ for the Capacitor (native) builds. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const ENTRIES = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons'];

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dest, name));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(out, { recursive: true, force: true });
for (const entry of ENTRIES) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) throw new Error(`Missing ${entry}`);
  copy(src, path.join(out, entry));
}
console.log(`Web assets copied to ${out}`);
