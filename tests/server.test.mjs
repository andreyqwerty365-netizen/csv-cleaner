import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../scripts/serve.mjs';

async function withServer(t) {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('serves the app and CSV module with correct MIME and no external connection policy', async t => {
  const url = await withServer(t);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CSV Cleaner/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  const module = await fetch(url + '/src/csv.mjs');
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.match(await module.text(), /export function parseCSV/);
  const workspace = await fetch(url + '/src/workspace.mjs');
  assert.equal(workspace.status, 200);
  assert.match(await workspace.text(), /export class CsvWorkspace/);
});
test('only explicit public files are served', async t => {
  const url = await withServer(t);
  for (const path of ['/package.json', '/.agent-base/project.json', '/tests/csv.test.mjs', '/%2e%2e/.env']) {
    assert.equal((await fetch(url + path)).status, 404, path);
  }
  assert.equal((await fetch(url + '/%E0%A4%A')).status, 400);
});
test('HEAD works and uploads are rejected', async t => {
  const url = await withServer(t);
  const head = await fetch(url + '/examples/contacts.csv', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.ok(Number(head.headers.get('content-length')) > 0);
  const post = await fetch(url, { method: 'POST', body: 'do not store' });
  assert.equal(post.status, 405);
});
