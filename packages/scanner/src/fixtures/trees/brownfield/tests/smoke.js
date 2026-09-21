// Plain assertion script (fixture content only). Named without .test so test
// runners never execute fixture-tree files as suites.
const assert = require('node:assert');
const { capitalize } = require('../src/lib/strings.js');

assert.strictEqual(capitalize('brownfield'), 'Brownfield');
console.log('smoke ok');