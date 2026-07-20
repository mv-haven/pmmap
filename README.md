# PMMap — the shared language of property management

**Powered by Haven · Live → https://mindmerge-b5sm.onrender.com**

PMMap is a living, collaborative map of **property management** — its domains,
terms, and definitions. The industry runs on words like *delinquency*, *unit
turn*, *effective rent*, and *make-ready*, and every firm defines them a little
differently. PMMap is where the field converges on shared standards: anyone
proposes a term or definition, the community votes, and consensus commits to a
canonical map. Maintainers at Haven can ratify or reject directly.

It's version control for how an industry talks about itself, and it's
**agent-first** — the same API people use is a clean interface for AI agents to
draft, connect, and audit definitions.

Open source under the [MIT License](LICENSE). Contributions welcome
([CONTRIBUTING.md](CONTRIBUTING.md)).

## Concepts

- **Canonical map** — the committed graph: agreed domains and terms.
- **Proposal** — a pending term/definition, attached to a domain. Like a PR.
- **Vote** — one per person; at the threshold a proposal commits automatically.
- **Maintainer (admin)** — holds the key; can ratify, reject, move, or delete.
- **A graph, not a tree** — a term can belong to more than one domain (a "Unit
  Turn" is both Leasing and Maintenance). Deletion is DAG-aware: a shared term
  survives as long as it still has a parent.
- **Commit log** — the running history of what became standard, and when.

## Agent-first

Every action a person can take, an agent can take over plain HTTP. Point Claude
at a running map to draft definitions, connect terms across domains, reconcile
conflicts, and fill gaps — no special integration required.

- `CLAUDE.md` orients an agent working on the **codebase**.
- [`docs/working-with-agents.md`](docs/working-with-agents.md) has the API
  surface, ready-to-use **prompts**, and a minimal populate/curate loop.

## Run locally (zero setup)

```bash
git clone https://github.com/mv-haven/mindmerge.git pmmap
cd pmmap
npm install
npm --prefix client install
cp .env.example .env      # set ADMIN_KEY; VOTE_THRESHOLD=2 makes voting easy to test
npm run dev
```

- Board (Vite): http://localhost:5173 · the landing page is at `/`, the board at `/app`
- API + WebSocket (Express): http://localhost:3001
- With no `DATABASE_URL`, data persists to `data/store.json` — nothing else to install.

To use admin powers: set `ADMIN_KEY` in `.env`, click **Unlock admin** in the app,
and paste the key.

## How to work on it

```bash
npm test          # spawns the server and exercises the API end to end
npm run build     # builds the client the server serves in production
```

The codebase is intentionally small:

```
client/   React + React Flow canvas (dagre layout), Vite
server/   Express REST + ws; store/ swaps memory <-> postgres by DATABASE_URL
```

The storage layer (`server/store/`) is one async interface with two
implementations — an in-memory + JSON-file store for local dev, and Postgres for
production, chosen at boot by whether `DATABASE_URL` exists. **Keep the two stores
behaviorally identical**; the memory store is the source of truth for tests.

## Data & scale

Locally (and in the current hosted deploy) PMMap runs on the JSON-file store: the
whole map is held in memory and rewritten to `data/store.json` on each change.
Great for zero setup and small-to-medium maps; it is not durable and does not
scale to very large files. The production answer is **Postgres** — set
`DATABASE_URL` and the store switches to targeted, durable, indexed writes with
no code change.

## Deploy to Render

`render.yaml` provisions a web service (and, if you enable it, a managed Postgres).
Push to GitHub, then create a **Blueprint** on Render from the repo.

> **Note:** the current hosted service was created from a *public repo URL*, which
> has **no GitHub webhook**, so pushes do **not** auto-deploy. Trigger a deploy
> manually via the Render dashboard or API, or connect Render's GitHub app to the
> repo to enable auto-deploy.

## License

[MIT](LICENSE) © 2026 ClavaInc (Haven).
