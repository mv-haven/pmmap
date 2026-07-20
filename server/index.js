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
    const node = await store.createProposal({
      mapId: req.params.id,
      parentId: req.body?.parentId,
      text: req.body?.text,
      color: req.body?.color,
      authorId: req.body?.authorId,
    });
    await broadcastMap(req.params.id);
    res.status(201).json(node);
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
