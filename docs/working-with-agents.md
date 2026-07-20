# Working with agents

PMMap is agent-first: the same HTTP API that the web board uses is a clean
interface for AI agents. An agent can propose terms and definitions, connect
related ones across domains, vote, and (with the admin key) ratify. There is no
SDK to learn — it's plain JSON over HTTP.

This guide covers two modes: **populating/curating the map with an agent**, and
**developing the codebase with an agent** (Claude Code).

---

## 1. Populate & curate the map

### The loop

Point an agent at a running instance (local `http://localhost:3001` or the hosted
URL) and give it the base URL + admin key. A typical curation loop:

1. `GET /api/default-map` → get the map id.
2. `GET /api/maps/:id` → read the current terms, definitions, and structure.
3. Reason about gaps, conflicts, or missing definitions.
4. `POST /api/maps/:id/proposals` to add terms/definitions.
5. `POST /api/nodes/:id/parents` to connect a term that spans domains.

Anti-duplication is handled server-side, so an agent can propose freely: an exact
match against an existing term folds into a vote instead of creating a rival.

### Example prompts

Drop these into Claude Code (with this repo open) or any agent that can make HTTP
calls, after telling it the base URL and admin key:

> Read the current PMMap. Propose standard, one-sentence definitions for the 15
> core **leasing** terms every property manager should agree on. For any that
> also belong to Maintenance or Accounting, connect them to those domains too.

> Audit every **committed** definition on the map for internal consistency. Where
> two definitions conflict or overlap, open a proposal that reconciles them and
> explain the conflict in the node text.

> The map is thin on **accounting**. List the common terms that are missing
> (delinquency, NOI, effective rent, concessions, bad debt, …), draft plain
> definitions, and open them as proposals under an Accounting domain.

> Act as a skeptical reviewer: for each pending proposal, either upvote it or
> write one sentence on why its definition is wrong, using `voterId: "claude-reviewer"`.

### Minimal client (Node)

```js
const BASE = process.env.PMMAP_URL || 'http://localhost:3001';
const KEY = process.env.PMMAP_ADMIN_KEY; // only for admin actions
const h = (admin) => ({ 'Content-Type': 'application/json', ...(admin ? { 'x-admin-key': KEY } : {}) });

const map = await (await fetch(`${BASE}/api/default-map`)).json();
const full = await (await fetch(`${BASE}/api/maps/${map.id}`)).json();

// propose a committed term as an admin (or drop the `true` to propose for votes)
await fetch(`${BASE}/api/maps/${map.id}/proposals`, {
  method: 'POST', headers: h(true),
  body: JSON.stringify({ parentId: null, text: 'Leasing', color: '#4f46e5' }),
});
```

See `CLAUDE.md` for the full endpoint list.

---

## 2. Develop the codebase with an agent

Open this repo in Claude Code. `CLAUDE.md` is loaded automatically and gives the
architecture, the run/test commands, and the one rule that matters (keep the
memory and Postgres stores behaviorally identical).

Good first tasks to hand an agent:

> Add an endpoint + UI to attach a source citation (URL) to a committed
> definition, and cover it in `test/e2e.mjs`. Mirror the change in both stores.

> Implement incremental WebSocket updates: broadcast only the changed node
> instead of the whole map. Keep the client's live behavior identical.

Always have the agent run `npm test` and drive the board in a browser before
declaring a change done.

---

## Local hosting

```bash
git clone https://github.com/mv-haven/mindmerge.git pmmap
cd pmmap
npm install && npm --prefix client install
cp .env.example .env         # set ADMIN_KEY, and VOTE_THRESHOLD=2 to test voting
npm run dev
```

- Board: http://localhost:5173  ·  API/WebSocket: http://localhost:3001
- No `DATABASE_URL` → data persists to `data/store.json`, zero setup.
- Set `DATABASE_URL` to a Postgres connection string and the store switches
  automatically — nothing else to change.
