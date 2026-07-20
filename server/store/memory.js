// In-memory store with JSON-file persistence.
// Used for local development so the app runs with zero external services.
// Data lives in data/store.json and is rewritten (debounced) on every mutation.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

export function createMemoryStore({ threshold }) {
  // Shape: maps[id], nodes[id], votes[nodeId] = Set(voterId)
  const state = { maps: {}, nodes: {}, votes: {} };
  let saveTimer = null;

  async function load() {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state.maps = parsed.maps || {};
      state.nodes = parsed.nodes || {};
      state.votes = {};
      for (const [nodeId, voters] of Object.entries(parsed.votes || {})) {
        state.votes[nodeId] = new Set(voters);
      }
    } catch {
      // No file yet — start empty.
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const serialisable = {
        maps: state.maps,
        nodes: state.nodes,
        votes: Object.fromEntries(
          Object.entries(state.votes).map(([k, set]) => [k, [...set]])
        ),
      };
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DATA_FILE, JSON.stringify(serialisable, null, 2));
    }, 150);
  }

  function countVotes(nodeId) {
    return state.votes[nodeId]?.size || 0;
  }

  function shapeNode(node) {
    return { ...node, upvotes: countVotes(node.id) };
  }

  return {
    threshold,

    async init() {
      await load();
    },

    async listMaps() {
      return Object.values(state.maps).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1
      );
    },

    async getMap(mapId) {
      const map = state.maps[mapId];
      if (!map) return null;
      const nodes = Object.values(state.nodes)
        .filter((n) => n.mapId === mapId)
        .map(shapeNode);
      return { ...map, nodes };
    },

    async createMap({ title }) {
      const id = nanoid(10);
      const now = new Date().toISOString();
      state.maps[id] = { id, title: title || 'Untitled map', createdAt: now };
      // Every map is born with a committed root node.
      const rootId = nanoid(10);
      state.nodes[rootId] = {
        id: rootId,
        mapId: id,
        parentId: null,
        text: title || 'Master map',
        color: '#4338ca',
        status: 'committed',
        createdAt: now,
        committedAt: now,
        authorId: 'system',
        x: null,
        y: null,
      };
      scheduleSave();
      return this.getMap(id);
    },

    async createProposal({ mapId, parentId, text, color, authorId }) {
      const parent = state.nodes[parentId];
      if (!parent || parent.mapId !== mapId) throw new Error('parent-not-found');
      if (parent.status !== 'committed') throw new Error('parent-not-committed');
      const id = nanoid(10);
      const node = {
        id,
        mapId,
        parentId,
        text: text.trim() || 'Untitled',
        color: color || '#0ea5e9',
        status: 'proposed',
        createdAt: new Date().toISOString(),
        committedAt: null,
        authorId: authorId || 'anon',
        x: null,
        y: null,
      };
      state.nodes[id] = node;
      state.votes[id] = new Set();
      scheduleSave();
      return shapeNode(node);
    },

    async vote({ nodeId, voterId }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      if (node.status !== 'proposed') return { node: shapeNode(node), committed: false };
      state.votes[nodeId] = state.votes[nodeId] || new Set();
      state.votes[nodeId].add(voterId);
      let committed = false;
      if (countVotes(nodeId) >= threshold) {
        node.status = 'committed';
        node.committedAt = new Date().toISOString();
        committed = true;
      }
      scheduleSave();
      return { node: shapeNode(node), committed };
    },

    async adminCommit({ nodeId }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      if (node.status !== 'committed') {
        node.status = 'committed';
        node.committedAt = new Date().toISOString();
      }
      scheduleSave();
      return shapeNode(node);
    },

    async setPosition({ nodeId, x, y }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      node.x = x;
      node.y = y;
      scheduleSave();
      return shapeNode(node);
    },

    async dismiss({ nodeId }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      if (node.status === 'committed') throw new Error('cannot-dismiss-committed');
      const mapId = node.mapId;
      // Remove the proposal and any (proposed) descendants defensively.
      delete state.nodes[nodeId];
      delete state.votes[nodeId];
      scheduleSave();
      return { nodeId, mapId };
    },

    async getActivity(mapId) {
      return Object.values(state.nodes)
        .filter((n) => n.mapId === mapId && n.status === 'committed' && n.parentId)
        .sort((a, b) => (a.committedAt < b.committedAt ? 1 : -1))
        .slice(0, 30)
        .map((n) => ({
          id: n.id,
          text: n.text,
          parentText: state.nodes[n.parentId]?.text || '(root)',
          committedAt: n.committedAt,
        }));
    },
  };
}
