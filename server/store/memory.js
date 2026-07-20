// In-memory store with JSON-file persistence.
// Used for local development so the app runs with zero external services.
// Data lives in data/store.json and is rewritten (debounced) on every mutation.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_FILE is overridable (used by the e2e suite to isolate its store).
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', '..', 'data', 'store.json');
const DATA_DIR = path.dirname(DATA_FILE);

// Normalized text key for duplicate detection: trim, lowercase, collapse runs
// of whitespace. Keep this identical to the one in postgres.js.
export function normalizeText(t) {
  return (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createMemoryStore({ threshold }) {
  // Shape: maps[id], nodes[id], votes[nodeId] = Set(voterId),
  // links = [{parentId, childId}] (extra parent edges beyond the primary tree).
  const state = { maps: {}, nodes: {}, votes: {}, links: [] };
  let saveTimer = null;

  async function load() {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state.maps = parsed.maps || {};
      state.nodes = parsed.nodes || {};
      state.links = parsed.links || [];
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
        links: state.links,
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

  // --- Combined-graph helpers (primary parentId edges + extra links) ---
  function parentsOf(id) {
    const primary = state.nodes[id]?.parentId ? [state.nodes[id].parentId] : [];
    const extra = state.links.filter((l) => l.childId === id).map((l) => l.parentId);
    return [...primary, ...extra];
  }
  function childrenOf(id) {
    const primary = Object.values(state.nodes)
      .filter((n) => n.parentId === id)
      .map((n) => n.id);
    const extra = state.links.filter((l) => l.parentId === id).map((l) => l.childId);
    return [...primary, ...extra];
  }
  function descendantsOf(id) {
    const seen = new Set();
    const stack = [...childrenOf(id)];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const c of childrenOf(cur)) stack.push(c);
    }
    return seen;
  }
  function linkExists(parentId, childId) {
    return state.links.some((l) => l.parentId === parentId && l.childId === childId);
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
      const nodeIds = new Set(
        Object.values(state.nodes).filter((n) => n.mapId === mapId).map((n) => n.id)
      );
      const nodes = Object.values(state.nodes)
        .filter((n) => n.mapId === mapId)
        .map(shapeNode);
      const links = state.links.filter(
        (l) => nodeIds.has(l.parentId) && nodeIds.has(l.childId)
      );
      return { ...map, nodes, links };
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

    async createProposal({ mapId, parentId, text, color, authorId, asAdmin }) {
      if (!state.maps[mapId]) throw new Error('map-not-found');
      // parentId null/empty => a new unconnected (root/island) node.
      const parent = parentId || null;
      if (parent) {
        const p = state.nodes[parent];
        if (!p || p.mapId !== mapId) throw new Error('parent-not-found');
        if (p.status !== 'committed') throw new Error('parent-not-committed');
      }

      // Anti-duplication: compare against siblings sharing the same parent.
      const key = normalizeText(text);
      const siblings = Object.values(state.nodes).filter(
        (n) => n.mapId === mapId && (n.parentId || null) === parent
      );
      if (siblings.some((n) => n.status === 'committed' && normalizeText(n.text) === key)) {
        throw new Error('duplicate-committed');
      }
      const dup = siblings.find((n) => n.status === 'proposed' && normalizeText(n.text) === key);
      if (dup) {
        // An admin "creating" a node that matches a pending proposal just
        // commits that proposal; everyone else folds into an upvote for it.
        if (asAdmin) {
          const node = await this.adminCommit({ nodeId: dup.id });
          return { node, merged: true, committed: true };
        }
        const { node, committed } = await this.vote({ nodeId: dup.id, voterId: authorId || 'anon' });
        return { node, merged: true, committed };
      }

      const now = new Date().toISOString();
      const id = nanoid(10);
      const node = {
        id,
        mapId,
        parentId: parent,
        text: (text || '').trim() || 'Untitled',
        color: color || '#0ea5e9',
        // Admins author straight into the master map; everyone else proposes.
        status: asAdmin ? 'committed' : 'proposed',
        createdAt: now,
        committedAt: asAdmin ? now : null,
        authorId: authorId || 'anon',
        x: null,
        y: null,
      };
      state.nodes[id] = node;
      state.votes[id] = new Set();
      scheduleSave();
      return { node: shapeNode(node), merged: false, committed: Boolean(asAdmin) };
    },

    async addParentLink({ childId, parentId }) {
      const child = state.nodes[childId];
      const parent = state.nodes[parentId];
      if (!child || !parent) throw new Error('node-not-found');
      if (child.mapId !== parent.mapId) throw new Error('different-maps');
      if (childId === parentId) throw new Error('cannot-parent-to-self');
      if (child.status !== 'committed' || parent.status !== 'committed') {
        throw new Error('both-must-be-committed');
      }
      if (child.parentId === parentId || linkExists(parentId, childId)) {
        throw new Error('already-a-parent');
      }
      // Cycle guard over the combined graph: parent must not already be a
      // descendant of child (that would make the new edge close a loop).
      if (descendantsOf(childId).has(parentId)) throw new Error('would-create-cycle');
      state.links.push({ parentId, childId });
      scheduleSave();
      return { mapId: child.mapId };
    },

    async removeParentLink({ childId, parentId }) {
      const before = state.links.length;
      state.links = state.links.filter(
        (l) => !(l.parentId === parentId && l.childId === childId)
      );
      if (state.links.length === before) throw new Error('link-not-found');
      const mapId = state.nodes[childId]?.mapId;
      scheduleSave();
      return { mapId };
    },

    async deleteNode({ nodeId }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      const mapId = node.mapId;

      // DAG cascade: start with the target, then absorb any node whose parents
      // are ALL inside the delete set (i.e. it loses every parent). A child with
      // a surviving parent elsewhere is spared.
      const deleteSet = new Set([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of Object.values(state.nodes)) {
          if (deleteSet.has(n.id)) continue;
          const parents = parentsOf(n.id);
          if (parents.length > 0 && parents.every((p) => deleteSet.has(p))) {
            deleteSet.add(n.id);
            changed = true;
          }
        }
      }

      // Re-point survivors whose PRIMARY parent is being deleted onto one of
      // their surviving (link) parents, promoting that link to primary.
      for (const n of Object.values(state.nodes)) {
        if (deleteSet.has(n.id)) continue;
        if (n.parentId && deleteSet.has(n.parentId)) {
          const survivor = parentsOf(n.id).find((p) => !deleteSet.has(p));
          n.parentId = survivor || null;
          if (survivor) {
            state.links = state.links.filter(
              (l) => !(l.parentId === survivor && l.childId === n.id)
            );
          }
        }
      }

      for (const id of deleteSet) {
        delete state.nodes[id];
        delete state.votes[id];
      }
      state.links = state.links.filter(
        (l) => !deleteSet.has(l.parentId) && !deleteSet.has(l.childId)
      );
      scheduleSave();
      return { mapId, deleted: deleteSet.size };
    },

    async reparent({ nodeId, newParentId }) {
      const node = state.nodes[nodeId];
      if (!node) throw new Error('node-not-found');
      const target = newParentId || null;
      if (target) {
        if (target === nodeId) throw new Error('cannot-parent-to-self');
        const p = state.nodes[target];
        if (!p || p.mapId !== node.mapId) throw new Error('parent-not-found');
        if (p.status !== 'committed') throw new Error('parent-not-committed');
        // Cycle guard over the combined graph.
        if (descendantsOf(nodeId).has(target)) throw new Error('would-create-cycle');
      }
      node.parentId = target;
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
