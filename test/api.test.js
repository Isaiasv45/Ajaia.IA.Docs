// End-to-end API tests: real Express app + in-memory SQLite, driven over HTTP.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

let server;
let base;

before(async () => {
  const app = createApp(openDb(':memory:'), { cookieSecret: 'test' });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function login(email) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (path, { method = 'GET', json, form } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: { cookie, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : form,
    });
}

test('requires login', async () => {
  const res = await fetch(`${base}/api/documents`);
  assert.equal(res.status, 401);
});

test('create, rename, edit and reopen a document with formatting preserved', async () => {
  const alice = await login('alice@ajaia.test');
  const created = await (await alice('/api/documents', { method: 'POST', json: {} })).json();
  assert.equal(created.title, 'Untitled document');
  assert.equal(created.role, 'owner');

  const html = '<h1>Plan</h1><p><strong>bold</strong> <em>it</em> <u>u</u></p><ol><li data-list="bullet">a</li></ol>';
  const patch = await alice(`/api/documents/${created.id}`, { method: 'PATCH', json: { title: 'Q3 plan', content: html } });
  assert.equal(patch.status, 200);

  const reopened = await (await alice(`/api/documents/${created.id}`)).json();
  assert.equal(reopened.title, 'Q3 plan');
  assert.equal(reopened.content, html);
});

test('validates input', async () => {
  const alice = await login('alice@ajaia.test');
  const { id } = await (await alice('/api/documents', { method: 'POST', json: {} })).json();
  assert.equal((await alice(`/api/documents/${id}`, { method: 'PATCH', json: { title: '   ' } })).status, 400);
  assert.equal((await alice(`/api/documents/${id}`, { method: 'PATCH', json: { title: 'x'.repeat(121) } })).status, 400);
  assert.equal((await alice(`/api/documents/${id}`, { method: 'PATCH', json: {} })).status, 400);
});

test('sharing: owner grants access, roles are enforced, strangers get 404', async () => {
  const alice = await login('alice@ajaia.test');
  const bob = await login('bob@ajaia.test');
  const carol = await login('carol@ajaia.test');
  const { id } = await (await alice('/api/documents', { method: 'POST', json: { title: 'Secret' } })).json();

  // Not shared yet: invisible to Bob.
  assert.equal((await bob(`/api/documents/${id}`)).status, 404);

  // Share with Bob (editor) and Carol (viewer).
  assert.equal((await alice(`/api/documents/${id}/shares`, { method: 'PUT', json: { email: 'bob@ajaia.test', role: 'editor' } })).status, 200);
  assert.equal((await alice(`/api/documents/${id}/shares`, { method: 'PUT', json: { email: 'carol@ajaia.test', role: 'viewer' } })).status, 200);

  // Shows up under "shared" for Bob, under "owned" for Alice.
  const bobList = await (await bob('/api/documents')).json();
  assert.ok(bobList.shared.some((d) => d.id === id && d.role === 'editor' && d.owner_name === 'Alice Owner'));
  assert.ok(!bobList.owned.some((d) => d.id === id));
  const aliceList = await (await alice('/api/documents')).json();
  assert.ok(aliceList.owned.some((d) => d.id === id));

  // Editor can edit; viewer can read but not edit.
  assert.equal((await bob(`/api/documents/${id}`, { method: 'PATCH', json: { content: '<p>hi</p>' } })).status, 200);
  assert.equal((await carol(`/api/documents/${id}`)).status, 200);
  assert.equal((await carol(`/api/documents/${id}`, { method: 'PATCH', json: { content: '<p>no</p>' } })).status, 403);

  // Only the owner manages sharing or deletes.
  assert.equal((await bob(`/api/documents/${id}/shares`, { method: 'PUT', json: { email: 'carol@ajaia.test', role: 'editor' } })).status, 403);
  assert.equal((await bob(`/api/documents/${id}`, { method: 'DELETE' })).status, 403);

  // Revoking access removes it.
  const bobId = 'u_bob';
  assert.equal((await alice(`/api/documents/${id}/shares/${bobId}`, { method: 'DELETE' })).status, 204);
  assert.equal((await bob(`/api/documents/${id}`)).status, 404);
});

test('sharing with an unknown user fails clearly', async () => {
  const alice = await login('alice@ajaia.test');
  const { id } = await (await alice('/api/documents', { method: 'POST', json: {} })).json();
  const res = await alice(`/api/documents/${id}/shares`, { method: 'PUT', json: { email: 'nobody@x.test', role: 'editor' } });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /No user/);
});

test('import: markdown file becomes a formatted document; unsupported types rejected', async () => {
  const alice = await login('alice@ajaia.test');
  const md = new FormData();
  md.append('file', new Blob(['# Title\n\nSome **bold** text\n\n- one\n- two\n']), 'notes.md');
  const res = await alice('/api/documents/import', { method: 'POST', form: md });
  assert.equal(res.status, 201);
  const doc = await res.json();
  assert.equal(doc.title, 'notes');
  assert.match(doc.content, /<h1>Title<\/h1>/);
  assert.match(doc.content, /<strong>bold<\/strong>/);
  assert.match(doc.content, /<li>one<\/li>/);

  const bad = new FormData();
  bad.append('file', new Blob(['x']), 'image.png');
  assert.equal((await alice('/api/documents/import', { method: 'POST', form: bad })).status, 415);
});

test('import strips script tags', async () => {
  const alice = await login('alice@ajaia.test');
  const fd = new FormData();
  fd.append('file', new Blob(['hello\n\n<script>alert(1)</script>']), 'evil.md');
  const doc = await (await alice('/api/documents/import', { method: 'POST', form: fd })).json();
  assert.doesNotMatch(doc.content, /<script/i);
});
