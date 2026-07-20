# PMMap — agent working guide

PMMap (powered by Haven) is a collaborative map of **property management**: its
domains, terms, and definitions. The goal is to converge the industry on shared
standards. The map is a graph where proposals earn their place by vote, and
maintainers can ratify directly. This file orients an AI agent (Claude Code)
working on the codebase — read it first.

## What this app is

- The **map** is the product. Committed nodes are agreed terms/domains; proposed
  nodes are pending suggestions collecting votes; at a threshold they commit.
- It is a **DAG, not a tree**: a term can belong to more than one parent (e.g.
  "Unit Turn" under both Leasing and Maintenance). Deletion is DAG-aware — a node
  is removed only when *all* its parents are removed.
- Everything is **live** over WebSocket, and there's a plain **HTTP API** that is
  the same interface people and agents use.

## Architecture (small on purpose)

```
client/   React + React Flow canvas (dagre auto-layout), Vite. Landing page at /,
          the board at /app and shareable /map/:id links.
server/   Express REST + ws live sync. server/store/ has ONE async interface with
          two implementations:
            memory.js    — in-RAM + JSON file (data/store.json). Local default.
            postgres.js  — used automatically when DATABASE_URL is set.
```

**Rule that matters most:** the two stores must stay behaviorally identical. The
memory store is the source of truth for local dev and the e2e tests; mirror any
change in both. Anti-dup text normalization and the DAG cascade logic are
duplicated by design — keep them in sync.

## Run, test, verify

```bash
npm install && npm --prefix client install
cp .env.example .env          # VOTE_THRESHOLD=2 for easy local testing
npm run dev                   # client :5173, server :3001
npm test                      # spawns the server, exercises the API end to end
npm run build                 # builds the client the server serves in prod
```

Before calling a change done: run `npm test`, and if it's a UI change, actually
drive the board in a browser — don't assert from types alone.

## The HTTP API (also the agent interface)

Base is the server origin. Admin actions require the `x-admin-key` header.

- `GET  /api/config` → `{ threshold }`
- `GET  /api/default-map` → the canonical map `{ id, title }`
- `GET  /api/maps/:id` → `{ id, title, nodes[], links[], activity[] }`
- `POST /api/maps/:id/proposals` `{ parentId|null, text, color?, authorId? }`
  → creates a proposal (or, with a valid `x-admin-key`, a committed node)
- `POST /api/nodes/:id/vote` `{ voterId }` → adds a vote; auto-commits at threshold
- `POST /api/nodes/:id/commit` *(admin)* → ratify now
- `POST /api/nodes/:id/dismiss` *(admin)* → reject a proposal
- `POST /api/nodes/:id/delete` *(admin)* → delete a node (DAG cascade)
- `POST /api/nodes/:id/reparent` *(admin)* `{ newParentId|null }`
- `POST /api/nodes/:id/parents` *(admin)* `{ parentId }` → add an extra parent edge
- `POST /api/nodes/:id/parents/remove` *(admin)* `{ parentId }`
- `POST /api/nodes/bulk-delete` *(admin)* `{ ids[] }`
- `POST /api/nodes/bulk-reparent` *(admin)* `{ ids[], newParentId|null }`

Anti-duplication is server-side: proposing a term that already exists commits/folds
into the existing one rather than creating a rival. So an agent can propose freely
without first checking for dupes.

See `docs/working-with-agents.md` for prompts and an example populate loop.

## Conventions

- No framework churn, no build step beyond Vite. Match the surrounding style.
- Copyright is ClavaInc (Haven), MIT licensed.
- Product name is **PMMap**; the GitHub repo slug and Render service are still
  `mindmerge` (kept to avoid breaking the live deploy).
- Deploys are **manual** right now — the Render service pulls a public repo URL
  with no webhook, so pushing does not auto-deploy. See the README deploy section.
