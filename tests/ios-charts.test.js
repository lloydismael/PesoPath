// Run: node tests/ios-charts.test.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadUI(ios, privacy) {
  const context = {
    document: { addEventListener: () => {}, documentElement: { classList: { contains: (name) => ios && name === 'ios-app' } } },
    Store: { get: () => ({ settings: { currency: 'PHP', privacy } }) },
  };
  vm.runInNewContext(`${fs.readFileSync('js/ui.js', 'utf8')}\nglobalThis.UI = UI;`, context);
  return context.UI;
}

const items = [{ label: 'Food', value: 1234, color: '#123456' }];
const series = [{ label: 'Income', color: '#123456', values: [1234, 5678] }];
const ui = loadUI(true, false);

assert.match(ui.donut(items, 'PHP 1,234', 'Expenses'), /View chart data/);
assert.match(ui.donut(items, 'PHP 1,234', 'Expenses'), /Food[\s\S]*1,234/);
assert.match(ui.bars(['Jan', 'Feb'], series), /Jan[\s\S]*1,234/);
assert.match(ui.stacked(['Jan', 'Feb'], series), /Feb[\s\S]*5,678/);
assert.match(ui.line([1234, 5678]), /1,234[\s\S]*5,678/);

const privateUI = loadUI(true, true);
assert.match(privateUI.money(1234), /Hidden/);
assert.doesNotMatch(privateUI.money(1234), /1,234/);
for (const chart of [
  privateUI.donut(items, 'PHP 1,234', 'Expenses'),
  privateUI.bars(['Jan', 'Feb'], series),
  privateUI.stacked(['Jan', 'Feb'], series),
  privateUI.line([1234, 5678]),
]) {
  assert.doesNotMatch(chart, /1,234|5,678/, 'privacy mode must not expose amounts in chart text');
}

const web = loadUI(false, false);
assert.match(web.bars(['Jan', 'Feb'], series), /View chart data/);
assert.match(web.line([1234, 5678, 9012]), /Point 2[\s\S]*5,678/, 'the line-chart table must include intermediate values');

const privateWeb = loadUI(false, true);
assert.match(privateWeb.money(1234), /Hidden/);
assert.strictEqual(privateWeb.moneyText(1234), 'Hidden');
for (const chart of [
  privateWeb.donut(items, 'PHP 1,234', 'Expenses'),
  privateWeb.bars(['Jan', 'Feb'], series),
  privateWeb.stacked(['Jan', 'Feb'], series),
  privateWeb.line([1234, 5678]),
]) {
  assert.doesNotMatch(chart, /1,234|5,678/, 'privacy mode must not expose chart amounts on the web');
}
console.log('Cross-platform chart tests passed');
