// End-to-end tests: spawn the real server, drive it over HTTP, assert behavior.
// Uses the memory store with an isolated DATA_FILE and a low vote threshold.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4613;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'e2e-admin-key';
const DATA_FILE = path.join(os.tmpdir(), `mindmerge-e2e-${process.pid}.json`);

let server;

const H = (admin) => ({
  'Content-Type': 'application/json',
  ...(admin ? { 'x-admin-key': ADMIN } : {}),
});
const get = (p) => fetch(BASE + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, body, admin) =>
  fetch(BASE + p, { method: 'POST', headers: H(admin), body: JSON.stringify(body || {}) }).then(
    async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })
  );

before(async () => {
  await fs.rm(DATA_FILE, { force: true });
  server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), VOTE_THRESHOLD: '2', ADMIN_KEY: ADMIN, DATA_FILE },
    stdio: 'ignore',
  });
  // Poll until the server answers.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await get('/api/config');
      if (r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('server did not start');
});

after(async () => {
  server?.kill();
  await fs.rm(DATA_FILE, { force: true });
});

async function freshMap() {
  const { body } = await get('/api/default-map');
  const full = await get(`/api/maps/${body.id}`);
  const root = full.body.nodes.find((n) => !n.parentId);
  return { mapId: body.id, rootId: root.id };
}

test('config exposes the vote threshold', async () => {
  const { body } = await get('/api/config');
  assert.equal(body.threshold, 2);
});

test('default map is created with a committed root', async () => {
  const { body } = await get('/api/default-map');
  const full = await get(`/api/maps/${body.id}`);
  const root = full.body.nodes.find((n) => !n.parentId);
  assert.ok(root, 'root exists');
  assert.equal(root.status, 'committed');
});

test('proposal collects votes and auto-commits at threshold', async () => {
  const { mapId, rootId } = await freshMap();
  const created = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Vote target' });
  assert.equal(created.status, 201);
  assert.equal(created.body.node.status, 'proposed');
  const nodeId = created.body.node.id;

  const v1 = await post(`/api/nodes/${nodeId}/vote`, { voterId: 'voter-1' });
  assert.equal(v1.body.committed, false);
  assert.equal(v1.body.node.upvotes, 1);

  const v2 = await post(`/api/nodes/${nodeId}/vote`, { voterId: 'voter-2' });
  assert.equal(v2.body.committed, true);
  assert.equal(v2.body.node.upvotes, 2);
});

test('duplicate vote from same voter does not double-count', async () => {
  const { mapId, rootId } = await freshMap();
  const c = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Once only' });
  const id = c.body.node.id;
  await post(`/api/nodes/${id}/vote`, { voterId: 'same' });
  const again = await post(`/api/nodes/${id}/vote`, { voterId: 'same' });
  assert.equal(again.body.node.upvotes, 1);
});

test('anti-dup: proposing an existing committed sibling is blocked', async () => {
  const { mapId, rootId } = await freshMap();
  await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Roadmap' }, true); // admin => committed
  const dup = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: '  roadmap ' });
  assert.equal(dup.status, 400);
  assert.equal(dup.body.error, 'duplicate-committed');
});

test('anti-dup: proposing an existing proposal folds into an upvote', async () => {
  const { mapId, rootId } = await freshMap();
  const a = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Shared idea', authorId: 'a' });
  const b = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'SHARED IDEA', authorId: 'b' });
  assert.equal(b.body.merged, true);
  assert.equal(b.body.node.id, a.body.node.id);
  assert.equal(b.body.node.upvotes, 1);
});

test('admin authoring lands committed; non-admin lands proposed', async () => {
  const { mapId, rootId } = await freshMap();
  const adminNode = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Admin node' }, true);
  assert.equal(adminNode.body.node.status, 'committed');
  assert.equal(adminNode.body.committed, true);
  const userNode = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'User node' });
  assert.equal(userNode.body.node.status, 'proposed');
});

test('admin endpoints reject a missing/wrong key', async () => {
  const { mapId, rootId } = await freshMap();
  const c = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Guard me' });
  const id = c.body.node.id;
  const res = await fetch(`${BASE}/api/nodes/${id}/commit`, { method: 'POST', headers: { 'x-admin-key': 'wrong' } });
  assert.equal(res.status, 403);
});

test('unconnected node has no parent', async () => {
  const { mapId } = await freshMap();
  const c = await post(`/api/maps/${mapId}/proposals`, { parentId: null, text: 'Island' });
  assert.equal(c.body.node.parentId, null);
});

test('position persists on a node', async () => {
  const { mapId, rootId } = await freshMap();
  const c = await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'Movable' }, true);
  const id = c.body.node.id;
  await post(`/api/nodes/${id}/position`, { x: 123.5, y: -42 });
  const full = await get(`/api/maps/${mapId}`);
  const n = full.body.nodes.find((x) => x.id === id);
  assert.equal(n.x, 123.5);
  assert.equal(n.y, -42);
});

test('reparent moves a node and blocks cycles', async () => {
  const { mapId, rootId } = await freshMap();
  const p = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'ParentX' }, true)).body.node;
  const q = (await post(`/api/maps/${mapId}/proposals`, { parentId: p.id, text: 'ChildX' }, true)).body.node;
  // Illegal: move P under its own child Q.
  const bad = await post(`/api/nodes/${p.id}/reparent`, { newParentId: q.id }, true);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'would-create-cycle');
  // Legal: detach Q to a root.
  const good = await post(`/api/nodes/${q.id}/reparent`, { newParentId: null }, true);
  assert.equal(good.status, 200);
  assert.equal(good.body.parentId, null);
});

test('delete cascades a whole subtree', async () => {
  const { mapId, rootId } = await freshMap();
  const a = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'A' }, true)).body.node;
  const b = (await post(`/api/maps/${mapId}/proposals`, { parentId: a.id, text: 'B' }, true)).body.node;
  const c = (await post(`/api/maps/${mapId}/proposals`, { parentId: b.id, text: 'C' }, true)).body.node;
  await post(`/api/nodes/${a.id}/delete`, {}, true);
  const full = await get(`/api/maps/${mapId}`);
  const ids = new Set(full.body.nodes.map((n) => n.id));
  assert.equal(ids.has(a.id), false);
  assert.equal(ids.has(b.id), false);
  assert.equal(ids.has(c.id), false);
});

test('a node can have multiple parents (add + reject cycle)', async () => {
  const { mapId, rootId } = await freshMap();
  const t1 = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'T1' }, true)).body.node;
  const t3 = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'T3' }, true)).body.node;
  const t2 = (await post(`/api/maps/${mapId}/proposals`, { parentId: t1.id, text: 'T2' }, true)).body.node;
  // Give T2 a second parent, T3.
  const add = await post(`/api/nodes/${t2.id}/parents`, { parentId: t3.id }, true);
  assert.equal(add.status, 200);
  const full = await get(`/api/maps/${mapId}`);
  assert.ok(full.body.links.some((l) => l.parentId === t3.id && l.childId === t2.id));
  // Cycle: T1 cannot become a child of T2 (T2 is already T1's descendant).
  const cyc = await post(`/api/nodes/${t1.id}/parents`, { parentId: t2.id }, true);
  assert.equal(cyc.status, 400);
  assert.equal(cyc.body.error, 'would-create-cycle');
});

test('deleting one parent spares a child that has another parent', async () => {
  const { mapId, rootId } = await freshMap();
  const t1 = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'P1' }, true)).body.node;
  const t3 = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'P3' }, true)).body.node;
  const t2 = (await post(`/api/maps/${mapId}/proposals`, { parentId: t1.id, text: 'Shared' }, true)).body.node;
  await post(`/api/nodes/${t2.id}/parents`, { parentId: t3.id }, true);
  // Delete T1 (T2's PRIMARY parent). T2 survives via T3 and is repointed.
  await post(`/api/nodes/${t1.id}/delete`, {}, true);
  const afterOne = await get(`/api/maps/${mapId}`);
  const survivor = afterOne.body.nodes.find((n) => n.id === t2.id);
  assert.ok(survivor, 'shared child survived deleting one parent');
  assert.equal(survivor.parentId, t3.id, 'primary parent repointed to the survivor');
  // Now delete its last parent T3 → the child is removed.
  await post(`/api/nodes/${t3.id}/delete`, {}, true);
  const afterAll = await get(`/api/maps/${mapId}`);
  assert.equal(afterAll.body.nodes.find((n) => n.id === t2.id), undefined);
});

test('bulk reparent and bulk delete are tolerant', async () => {
  const { mapId, rootId } = await freshMap();
  const a = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'BA' }, true)).body.node;
  const b = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'BB' }, true)).body.node;
  const c = (await post(`/api/maps/${mapId}/proposals`, { parentId: rootId, text: 'BC' }, true)).body.node;
  const mv = await post('/api/nodes/bulk-reparent', { ids: [b.id, c.id], newParentId: a.id }, true);
  assert.equal(mv.body.moved, 2);
  // Deleting A cascades B and C; passing B again must be tolerated.
  const del = await post('/api/nodes/bulk-delete', { ids: [a.id, b.id] }, true);
  assert.equal(del.body.deleted, 1);
  const full = await get(`/api/maps/${mapId}`);
  const names = full.body.nodes.map((n) => n.text);
  assert.ok(!names.includes('BA') && !names.includes('BB') && !names.includes('BC'));
});
