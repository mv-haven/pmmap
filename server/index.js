import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
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
app.set('trust proxy', true); // behind Render/Cloudflare — read real client IP
app.use(cors());
app.use(express.json());

// A privacy-preserving per-client vote key: a short hash of the client IP, so a
// single machine can't stuff a proposal by clearing its browser id.
function voteKey(req, fallback) {
  const ip = req.ip;
  const loopback = !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  // On real clients, dedupe by hashed IP so one machine can't stuff a proposal.
  // Locally (loopback) fall back to the client-supplied id.
  if (loopback) return fallback || 'anon';
  return 'ip:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

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
    // Dedupe by hashed client IP (one vote per machine per node), falling back
    // to the client-supplied id only when no IP is available (local dev).
    const voterId = voteKey(req, req.body?.voterId);
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

// Edit a node's name, description, or aliases. Open to everyone: proposals are
// refined freely, and editing a committed node is recorded as a commit.
api.post('/nodes/:id/update', async (req, res) => {
  try {
    const node = await store.updateNode({
      nodeId: req.params.id,
      text: req.body?.text,
      description: req.body?.description,
      aliases: req.body?.aliases,
    });
    await broadcastMap(node.mapId);
    res.json(node);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Revert a committed-node edit to the value it held before that edit. Admin only.
api.post('/events/:id/revert', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.revertEdit({ eventId: req.params.id });
    await broadcastMap(mapId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add an extra parent edge to a node (multi-parent DAG). Admin only.
// :id is the CHILD; body.parentId is the additional parent.
api.post('/nodes/:id/parents', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.addParentLink({
      childId: req.params.id,
      parentId: req.body?.parentId,
    });
    await broadcastMap(mapId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Swap parent/child direction: reverse the edge (body.parentId -> :id) so that
// :id becomes the parent of body.parentId. Admin only.
api.post('/nodes/:id/swap-parent', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.swapDirection({
      parentId: req.body?.parentId,
      childId: req.params.id,
    });
    await broadcastMap(mapId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.post('/nodes/:id/parents/remove', requireAdmin, async (req, res) => {
  try {
    const { mapId } = await store.removeParentLink({
      childId: req.params.id,
      parentId: req.body?.parentId,
    });
    await broadcastMap(mapId);
    res.json({ ok: true });
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

// --- Agent entry point: a machine-readable brief served at /llms.txt ---
// An agent given only this site's URL can fetch /llms.txt and know exactly what
// to do: the mission, the API, and the steps. Kept in sync with the endpoints above.
const AGENT_BRIEF = `# PMMap — agent brief (powered by Haven)

PMMap is the shared, canonical map of property-management terms and their
definitions. You are an agent. Your job: help the field converge on standard
definitions by proposing terms, writing clear definitions, connecting related
terms across domains, and voting.

Why this matters: terms like delinquency, unit turn, effective rent, make-ready,
and concession mean different things at different firms and in different software.
PMMap resolves them in the open, by consensus.

## API — base URL is this origin (the site you fetched this from)
- GET  /api/default-map                      -> { id, title }  (the canonical map)
- GET  /api/maps/{id}                         -> { nodes[], links[], activity[] }
- POST /api/maps/{id}/proposals               { parentId|null, text, color? }   propose a term
- POST /api/nodes/{id}/vote                   { voterId }        vote; auto-commits at the threshold
- POST /api/nodes/{id}/update                 { text?, description?, aliases[] }  (admin) edit a definition/aliases
- POST /api/nodes/{id}/parents                { parentId }       (admin) connect a term to another domain
- GET  /api/config                            -> { threshold }

A node is { id, text, description, aliases[], status: "committed"|"proposed",
parentId, upvotes }. "committed" = an agreed standard; "proposed" = pending votes.
Admin actions need the header  x-admin-key: <key>  (ask the operator for it).

Anti-duplication is automatic and alias-aware: proposing a term (or a name a term
already carries as an alias) folds into the existing one. So propose freely; you
will not create rivals.

## Do this now
1. GET /api/default-map  -> take its "id".
2. GET /api/maps/{id}    -> read the existing terms, definitions, and gaps.
3. For each missing or unclear term, POST a proposal with a one-sentence standard
   definition (set the definition later via /api/nodes/{id}/update if you hold the key).
4. Connect any term that belongs to more than one domain via /api/nodes/{id}/parents.
5. Vote on proposals you agree with using a stable voterId.

Human board: /app   ·   Source & full guide: https://github.com/mv-haven/pmmap
`;

app.get(['/llms.txt', '/.well-known/llms.txt'], (_req, res) => {
  res.type('text/plain; charset=utf-8').send(AGENT_BRIEF);
});

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
