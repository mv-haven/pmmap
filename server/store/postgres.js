// Postgres-backed store. Selected automatically when DATABASE_URL is set
// (Render provides it). Same async interface as the memory store.
import pg from 'pg';
import { nanoid } from 'nanoid';

// Normalized text key for duplicate detection. Keep identical to memory.js.
function normalizeText(t) {
  return (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createPostgresStore({ threshold, connectionString }) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  async function shapeMapNodes(mapId) {
    const { rows } = await pool.query(
      `SELECT n.*, COALESCE(v.cnt, 0)::int AS upvotes
         FROM nodes n
         LEFT JOIN (SELECT node_id, COUNT(*) cnt FROM votes GROUP BY node_id) v
           ON v.node_id = n.id
        WHERE n.map_id = $1`,
      [mapId]
    );
    return rows.map(rowToNode);
  }

  function rowToNode(r) {
    return {
      id: r.id,
      mapId: r.map_id,
      parentId: r.parent_id,
      text: r.text,
      color: r.color,
      status: r.status,
      createdAt: r.created_at,
      committedAt: r.committed_at,
      authorId: r.author_id,
      x: r.x ?? null,
      y: r.y ?? null,
      upvotes: r.upvotes ?? 0,
    };
  }

  return {
    threshold,

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS maps (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
          parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#0ea5e9',
          status TEXT NOT NULL DEFAULT 'proposed',
          author_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          committed_at TIMESTAMPTZ
        );
        ALTER TABLE nodes ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION;
        ALTER TABLE nodes ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION;
        CREATE TABLE IF NOT EXISTS votes (
          node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          voter_id TEXT NOT NULL,
          PRIMARY KEY (node_id, voter_id)
        );
        CREATE TABLE IF NOT EXISTS links (
          parent_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          child_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          PRIMARY KEY (parent_id, child_id)
        );
      `);
    },

    async listMaps() {
      const { rows } = await pool.query('SELECT * FROM maps ORDER BY created_at ASC');
      return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at }));
    },

    async getMap(mapId) {
      const { rows } = await pool.query('SELECT * FROM maps WHERE id = $1', [mapId]);
      if (!rows.length) return null;
      const m = rows[0];
      const { rows: linkRows } = await pool.query(
        `SELECT l.parent_id, l.child_id FROM links l
           JOIN nodes n ON n.id = l.child_id
          WHERE n.map_id = $1`,
        [mapId]
      );
      return {
        id: m.id,
        title: m.title,
        createdAt: m.created_at,
        nodes: await shapeMapNodes(mapId),
        links: linkRows.map((l) => ({ parentId: l.parent_id, childId: l.child_id })),
      };
    },

    async createMap({ title }) {
      const id = nanoid(10);
      const rootId = nanoid(10);
      await pool.query('INSERT INTO maps (id, title) VALUES ($1, $2)', [
        id,
        title || 'Untitled map',
      ]);
      await pool.query(
        `INSERT INTO nodes (id, map_id, parent_id, text, color, status, author_id, committed_at)
         VALUES ($1, $2, NULL, $3, '#4338ca', 'committed', 'system', now())`,
        [rootId, id, title || 'Master map']
      );
      return this.getMap(id);
    },

    async createProposal({ mapId, parentId, text, color, authorId, asAdmin }) {
      // parentId null/empty => a new unconnected (root/island) node.
      const parent = parentId || null;
      if (parent) {
        const { rows: parents } = await pool.query(
          'SELECT * FROM nodes WHERE id = $1 AND map_id = $2',
          [parent, mapId]
        );
        if (!parents.length) throw new Error('parent-not-found');
        if (parents[0].status !== 'committed') throw new Error('parent-not-committed');
      }

      // Anti-duplication: compare against siblings sharing the same parent.
      const key = normalizeText(text);
      const { rows: siblings } = await pool.query(
        parent
          ? 'SELECT id, text, status FROM nodes WHERE map_id = $1 AND parent_id = $2'
          : 'SELECT id, text, status FROM nodes WHERE map_id = $1 AND parent_id IS NULL',
        parent ? [mapId, parent] : [mapId]
      );
      if (siblings.some((r) => r.status === 'committed' && normalizeText(r.text) === key)) {
        throw new Error('duplicate-committed');
      }
      const dup = siblings.find((r) => r.status === 'proposed' && normalizeText(r.text) === key);
      if (dup) {
        // Admin author commits the existing proposal; others fold into a vote.
        if (asAdmin) {
          const node = await this.adminCommit({ nodeId: dup.id });
          return { node, merged: true, committed: true };
        }
        const { node, committed } = await this.vote({ nodeId: dup.id, voterId: authorId || 'anon' });
        return { node, merged: true, committed };
      }

      const status = asAdmin ? 'committed' : 'proposed';
      const id = nanoid(10);
      const { rows } = await pool.query(
        `INSERT INTO nodes (id, map_id, parent_id, text, color, status, author_id, committed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'committed' THEN now() ELSE NULL END)
         RETURNING *`,
        [id, mapId, parent, (text || '').trim() || 'Untitled', color || '#0ea5e9', status, authorId || 'anon']
      );
      return { node: { ...rowToNode(rows[0]), upvotes: 0 }, merged: false, committed: Boolean(asAdmin) };
    },

    async addParentLink({ childId, parentId }) {
      const { rows } = await pool.query(
        'SELECT id, map_id, status FROM nodes WHERE id = ANY($1)',
        [[childId, parentId]]
      );
      const child = rows.find((r) => r.id === childId);
      const parent = rows.find((r) => r.id === parentId);
      if (!child || !parent) throw new Error('node-not-found');
      if (child.map_id !== parent.map_id) throw new Error('different-maps');
      if (childId === parentId) throw new Error('cannot-parent-to-self');
      if (child.status !== 'committed' || parent.status !== 'committed') {
        throw new Error('both-must-be-committed');
      }
      // Already a parent (primary or an existing link)?
      const { rows: existing } = await pool.query(
        `SELECT 1 FROM nodes WHERE id = $1 AND parent_id = $2
         UNION ALL SELECT 1 FROM links WHERE child_id = $1 AND parent_id = $2`,
        [childId, parentId]
      );
      if (existing.length) throw new Error('already-a-parent');
      // Cycle guard over the combined graph (primary edges + links).
      const { rows: cyc } = await pool.query(
        `WITH RECURSIVE edges AS (
           SELECT parent_id AS p, id AS c FROM nodes WHERE parent_id IS NOT NULL
           UNION ALL SELECT parent_id AS p, child_id AS c FROM links
         ),
         d AS (
           SELECT c FROM edges WHERE p = $1
           UNION SELECT e.c FROM edges e JOIN d ON e.p = d.c
         )
         SELECT 1 FROM d WHERE c = $2 LIMIT 1`,
        [childId, parentId]
      );
      if (cyc.length) throw new Error('would-create-cycle');
      await pool.query(
        'INSERT INTO links (parent_id, child_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [parentId, childId]
      );
      return { mapId: child.map_id };
    },

    async removeParentLink({ childId, parentId }) {
      const { rows } = await pool.query(
        'DELETE FROM links WHERE parent_id = $1 AND child_id = $2 RETURNING child_id',
        [parentId, childId]
      );
      if (!rows.length) throw new Error('link-not-found');
      const { rows: n } = await pool.query('SELECT map_id FROM nodes WHERE id = $1', [childId]);
      return { mapId: n[0]?.map_id };
    },

    async deleteNode({ nodeId }) {
      const { rows: target } = await pool.query('SELECT map_id FROM nodes WHERE id = $1', [nodeId]);
      if (!target.length) throw new Error('node-not-found');
      const mapId = target[0].map_id;
      // Load the whole map graph and compute the DAG delete set in JS (mirrors
      // the memory store): a node dies only when all its parents die.
      const { rows: ns } = await pool.query('SELECT id, parent_id FROM nodes WHERE map_id = $1', [mapId]);
      const { rows: ls } = await pool.query(
        'SELECT l.parent_id, l.child_id FROM links l JOIN nodes n ON n.id = l.child_id WHERE n.map_id = $1',
        [mapId]
      );
      const parentsOf = (id) => {
        const prim = ns.find((n) => n.id === id)?.parent_id;
        const extra = ls.filter((l) => l.child_id === id).map((l) => l.parent_id);
        return [...(prim ? [prim] : []), ...extra];
      };
      const deleteSet = new Set([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of ns) {
          if (deleteSet.has(n.id)) continue;
          const ps = parentsOf(n.id);
          if (ps.length > 0 && ps.every((p) => deleteSet.has(p))) {
            deleteSet.add(n.id);
            changed = true;
          }
        }
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Re-point survivors whose primary parent is being deleted.
        for (const n of ns) {
          if (deleteSet.has(n.id)) continue;
          if (n.parent_id && deleteSet.has(n.parent_id)) {
            const survivor = parentsOf(n.id).find((p) => !deleteSet.has(p)) || null;
            await client.query('UPDATE nodes SET parent_id = $2 WHERE id = $1', [n.id, survivor]);
            if (survivor) {
              await client.query('DELETE FROM links WHERE parent_id = $1 AND child_id = $2', [survivor, n.id]);
            }
          }
        }
        // Delete the set; FK cascade clears their links and votes.
        await client.query('DELETE FROM nodes WHERE id = ANY($1)', [[...deleteSet]]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return { mapId, deleted: deleteSet.size };
    },

    async reparent({ nodeId, newParentId }) {
      const { rows: nrows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
      if (!nrows.length) throw new Error('node-not-found');
      const node = nrows[0];
      const target = newParentId || null;
      if (target) {
        if (target === nodeId) throw new Error('cannot-parent-to-self');
        const { rows: prows } = await pool.query(
          'SELECT * FROM nodes WHERE id = $1 AND map_id = $2',
          [target, node.map_id]
        );
        if (!prows.length) throw new Error('parent-not-found');
        if (prows[0].status !== 'committed') throw new Error('parent-not-committed');
        // Cycle guard over the combined graph (primary edges + links).
        const { rows: cyc } = await pool.query(
          `WITH RECURSIVE edges AS (
             SELECT parent_id AS p, id AS c FROM nodes WHERE parent_id IS NOT NULL
             UNION ALL SELECT parent_id AS p, child_id AS c FROM links
           ),
           d AS (
             SELECT c FROM edges WHERE p = $1
             UNION SELECT e.c FROM edges e JOIN d ON e.p = d.c
           )
           SELECT 1 FROM d WHERE c = $2 LIMIT 1`,
          [nodeId, target]
        );
        if (cyc.length) throw new Error('would-create-cycle');
      }
      const { rows } = await pool.query(
        'UPDATE nodes SET parent_id = $2 WHERE id = $1 RETURNING *',
        [nodeId, target]
      );
      return rowToNode(rows[0]);
    },

    async vote({ nodeId, voterId }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM nodes WHERE id = $1 FOR UPDATE', [nodeId]);
        if (!rows.length) throw new Error('node-not-found');
        const node = rows[0];
        if (node.status !== 'committed') {
          await client.query(
            'INSERT INTO votes (node_id, voter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [nodeId, voterId]
          );
        }
        const { rows: c } = await client.query(
          'SELECT COUNT(*)::int AS cnt FROM votes WHERE node_id = $1',
          [nodeId]
        );
        const upvotes = c[0].cnt;
        let committed = false;
        let status = node.status;
        let committedAt = node.committed_at;
        if (status === 'proposed' && upvotes >= threshold) {
          const { rows: u } = await client.query(
            `UPDATE nodes SET status = 'committed', committed_at = now() WHERE id = $1 RETURNING *`,
            [nodeId]
          );
          status = u[0].status;
          committedAt = u[0].committed_at;
          committed = true;
        }
        await client.query('COMMIT');
        return {
          node: { ...rowToNode({ ...node, status, committed_at: committedAt }), upvotes },
          committed,
        };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async adminCommit({ nodeId }) {
      const { rows } = await pool.query(
        `UPDATE nodes
            SET status = 'committed',
                committed_at = COALESCE(committed_at, now())
          WHERE id = $1 RETURNING *`,
        [nodeId]
      );
      if (!rows.length) throw new Error('node-not-found');
      const { rows: c } = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM votes WHERE node_id = $1',
        [nodeId]
      );
      return { ...rowToNode(rows[0]), upvotes: c[0].cnt };
    },

    async setPosition({ nodeId, x, y }) {
      const { rows } = await pool.query(
        'UPDATE nodes SET x = $2, y = $3 WHERE id = $1 RETURNING *',
        [nodeId, x, y]
      );
      if (!rows.length) throw new Error('node-not-found');
      return rowToNode(rows[0]);
    },

    async dismiss({ nodeId }) {
      const { rows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
      if (!rows.length) throw new Error('node-not-found');
      if (rows[0].status === 'committed') throw new Error('cannot-dismiss-committed');
      const mapId = rows[0].map_id;
      await pool.query('DELETE FROM nodes WHERE id = $1', [nodeId]);
      return { nodeId, mapId };
    },

    async getActivity(mapId) {
      const { rows } = await pool.query(
        `SELECT n.id, n.text, n.committed_at, p.text AS parent_text
           FROM nodes n
           LEFT JOIN nodes p ON p.id = n.parent_id
          WHERE n.map_id = $1 AND n.status = 'committed' AND n.parent_id IS NOT NULL
          ORDER BY n.committed_at DESC
          LIMIT 30`,
        [mapId]
      );
      return rows.map((r) => ({
        id: r.id,
        text: r.text,
        parentText: r.parent_text || '(root)',
        committedAt: r.committed_at,
      }));
    },
  };
}
