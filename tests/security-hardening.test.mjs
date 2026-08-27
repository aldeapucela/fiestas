import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return fs.readFile(new URL(relativePath, root), 'utf8');
}

test('dynamic Leaflet loaders pin the same script URL and SRI hash', async () => {
  const files = [
    'src/scripts/fiestas-2026.js',
    'src/scripts/casetas-page.js'
  ];
  const expectedUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const expectedIntegrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

  for (const file of files) {
    const source = await read(file);
    assert.ok(source.includes(`const LEAFLET_SCRIPT_URL = '${expectedUrl}';`), `${file} should pin the Leaflet URL`);
    assert.ok(source.includes(`const LEAFLET_SCRIPT_INTEGRITY = '${expectedIntegrity}';`), `${file} should pin the Leaflet hash`);
    assert.ok(source.includes('script.src = LEAFLET_SCRIPT_URL'), `${file} should use the pinned Leaflet URL`);
    assert.ok(source.includes('script.integrity = LEAFLET_SCRIPT_INTEGRITY'), `${file} should use the pinned Leaflet hash`);
    assert.match(source, /script\.crossOrigin = ''/);
  }
});

test('the Pages workflow keeps OIDC permission only in deploy', async () => {
  const workflow = await read('.github/workflows/deploy-pages.yml');
  const build = workflow.match(/\n  build:\n([\s\S]*?)(?=\n  deploy:)/)?.[1] || '';
  const deploy = workflow.match(/\n  deploy:\n([\s\S]*)$/)?.[1] || '';

  assert.match(build, /permissions:\n      contents: read\n      pages: write/);
  assert.doesNotMatch(build, /id-token:/);
  assert.match(deploy, /permissions:\n      pages: write\n      id-token: write/);
});
