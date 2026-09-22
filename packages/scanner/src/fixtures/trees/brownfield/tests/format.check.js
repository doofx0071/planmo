// Plain assertion script (fixture content only — intentionally NOT named
// *.test.* so test runners never execute fixture-tree files).
const assert = require('node:assert');

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

assert.strictEqual(formatBytes(0), '0.0 B');
assert.strictEqual(formatBytes(1024), '1.0 KiB');
console.log('format checks ok');