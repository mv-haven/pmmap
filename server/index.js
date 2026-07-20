import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createStore } from './store/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme-admin-key';

const store = await createStore();
const app = express();
app.use(cors());
app.use(express.json());

const api = express.Router();

// --- Public config the client needs on load ---
api.get('/config', (_req, res) => {
  res.json({ threshold: store.threshold });
});

// --- Maps ---
api.get('/maps', async (_req, res) => {
  res.json(await store.listMaps());
});

// Ensure a single default "master map" exists and hand back its id.
api.get('/default-map', async (_req, res) => {
  const maps = await store.listMaps();
  if (maps.length) return res.json(maps[0]);
  const created = await store.createMap({ title: 'Master map' });
  res.json({ id: created.id, title: created.title, createdAt: created.createdAt });
});

api.post('/maps', async (req, res) => {
  const map = await store.createMap({ title: req.body?.title });
  res.status(201).json(map);
});

api.get('/maps/:id', async (req, res) => {
  const map = await store.getMap(req.params.id);
  if (!map) return res.status(404).json({ error: 'map-not-found' });
  res.json({ ...map, activity: await store.getActivity(req.params.id) });
});

// --- Proposals & votes ---
api.post('/maps/:id/proposals', async (req, res) => {
  try {
    const result = await store.createProposal({
      mapId: req.params.id,
      parentId: req.body?.parentId ?? null,
      text: req.body?.text,
      color: req.body?.color,
      authorId: req.body?.authorId,
      // A valid admin key means the node is authored straight into the map.
      asAdmin: (req.get('x-admin-key') || '') === ADMIN_KEY,
    });
    await broadcastMap(req.params.id);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.post('/nodes/:id/vote', async (req, res) => {
  try {
    const voterId = req.body?.voterId;
    if (!voterId) return res.status(400).json({ error: 'voterId-required' });
    const { node, committed } = await store.vote({ nodeId: req.params.id, voterId });
    await broadcastMap(node.mapId);
    res.json({ node, committed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Node position (anyone can rearrange the map) ---
api.post('/nodes/:id/position', async (req, res) => {
  try {
    const { x, y } = req.body || {};
    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ error: 'x-y-required' });
    }
    const node = await store.setPosition({ nodeId: req.params.id, x, y });
    await broadcastMap(node.mapId);
    res.json(node);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Admin actions (require the admin key) ---
function requireAdmin(req, res, next) {
  if ((req.get('x-admin-key') || '') !== ADMIN_KEY) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

api.get('/admin/check', requireAdmin, (_req, res) => res.json({ ok: true }));

api.post('/nodes/:id/commit', requireAdmin, async (req, res) => {
  try {
    const node = await store.adminCommit({ nodeId: req.params.id });
    await broadcastMap(node.mapId);
    res.json(node);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.post('/nodes/:id/dismiss', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.dismiss({ nodeId: req.params.id });
    await broadcastMap(mapId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete any node (and its subtree). Admin only.
api.post('/nodes/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.deleteNode({ nodeId: req.params.id });
    await broadcastMap(mapId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Re-org: move a node under a new parent (null = make it a root). Admin only.
api.post('/nodes/:id/reparent', requireAdmin, async (req, res) => {
  try {
    const node = await store.reparent({
      nodeId: req.params.id,
      newParentId: req.body?.newParentId ?? null,
    });
    await broadcastMap(node.mapId);
    res.json(node);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Bulk admin actions (one broadcast for the whole batch) ---
// Tolerant by design: a node already removed by a cascade, or a reparent that
// fails the cycle guard, is skipped rather than aborting the batch.
api.post('/nodes/bulk-delete', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  let mapId = null;
  let deleted = 0;
  for (const id of ids) {
    try {
      const r = await store.deleteNode({ nodeId: id });
      mapId = r.mapId;
      deleted += 1;
    } catch {
      // Already gone (e.g. cascaded by an ancestor in this same batch).
    }
  }
  if (mapId) await broadcastMap(mapId);
  res.json({ deleted });
});

api.post('/nodes/bulk-reparent', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const newParentId = req.body?.newParentId ?? null;
  let mapId = null;
  let moved = 0;
  const failed = [];
  for (const id of ids) {
    try {
      const node = await store.reparent({ nodeId: id, newParentId });
      mapId = node.mapId;
      moved += 1;
    } catch (e) {
      failed.push({ id, error: e.message });
    }
  }
  if (mapId) await broadcastMap(mapId);
  res.json({ moved, failed });
});

app.use('/api', api);

// --- Serve the built client in production ---
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built. Run: npm run build');
  });
});

// --- WebSocket live sync: clients join a room keyed by map id ---
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  ws.mapId = url.searchParams.get('mapId');
});

async function broadcastMap(mapId) {
  if (!mapId) return;
  const map = await store.getMap(mapId);
  if (!map) return;
  const payload = JSON.stringify({
    type: 'map:update',
    map: { ...map, activity: await store.getActivity(mapId) },
  });
  for (const ws of wss.clients) {
    if (ws.mapId === mapId && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

httpServer.listen(PORT, () => {
  console.log(`[mindmap] listening on http://localhost:${PORT}`);
});
