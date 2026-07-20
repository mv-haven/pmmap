// Postgres-backed store. Selected automatically when DATABASE_URL is set
// (Render provides it). Same async interface as the memory store.
import pg from 'pg';
import { nanoid } from 'nanoid';

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
        CREATE TABLE IF NOT EXISTS votes (
          node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          voter_id TEXT NOT NULL,
          PRIMARY KEY (node_id, voter_id)
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
      return {
        id: m.id,
        title: m.title,
        createdAt: m.created_at,
        nodes: await shapeMapNodes(mapId),
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

    async createProposal({ mapId, parentId, text, color, authorId }) {
      const { rows: parents } = await pool.query(
        'SELECT * FROM nodes WHERE id = $1 AND map_id = $2',
        [parentId, mapId]
      );
      if (!parents.length) throw new Error('parent-not-found');
      if (parents[0].status !== 'committed') throw new Error('parent-not-committed');
      const id = nanoid(10);
      const { rows } = await pool.query(
        `INSERT INTO nodes (id, map_id, parent_id, text, color, status, author_id)
         VALUES ($1, $2, $3, $4, $5, 'proposed', $6) RETURNING *`,
        [id, mapId, parentId, (text || '').trim() || 'Untitled', color || '#0ea5e9', authorId || 'anon']
      );
      return { ...rowToNode(rows[0]), upvotes: 0 };
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
