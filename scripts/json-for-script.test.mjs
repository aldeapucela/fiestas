import assert from 'node:assert/strict';
import test from 'node:test';

import { jsonForScript } from './json-for-script.mjs';

test('escapes script terminators without changing the JSON value', () => {
  const payload = {
    title: '</script><script>globalThis.__PWNED__ = true</script>'
  };

  const serialized = jsonForScript(payload);

  assert.doesNotMatch(serialized, /<\/script>/i);
  assert.match(serialized, /\\u003c\/script>/i);
  assert.deepEqual(JSON.parse(serialized), payload);
});

test('escapes JavaScript line separators and serializes undefined as null', () => {
  const payload = { text: 'antes\u2028medio\u2029después' };
  const serialized = jsonForScript(payload);

  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
  assert.deepEqual(JSON.parse(serialized), payload);
  assert.equal(jsonForScript(undefined), 'null');
});
