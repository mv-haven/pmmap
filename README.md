# MindMerge — collaborative mind map with proposal-and-merge

**Live demo → https://mindmerge-b5sm.onrender.com**

A mind-map platform where the map is a shared "main branch." Anyone can propose
new nodes; the crowd upvotes them; and when a proposal reaches the vote
threshold it **auto-commits** into the master map. Admins can commit or dismiss
any proposal directly, GitHub-maintainer style.

Open source under the [MIT License](LICENSE) · contributions welcome, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Concepts

- **Master map** — the committed tree everyone sees (solid nodes).
- **Proposal** — a pending child node (dashed) attached to a committed node. Like a PR.
- **Upvote** — one vote per browser. At the threshold, the proposal commits automatically.
- **Admin** — holds the admin key; can **Commit now** or **Dismiss** any proposal.
- **Commit log** — the side feed of everything that has merged.

## Run locally (zero setup)

```bash
npm install
npm --prefix client install
cp .env.example .env      # optionally set VOTE_THRESHOLD=2 for easy testing
npm run dev
```

- Client (Vite): http://localhost:5173
- API + WebSocket (Express): http://localhost:3001
- With no `DATABASE_URL`, data persists to `data/store.json`.

To try the admin flow: set `ADMIN_KEY` in `.env`, then click **Unlock admin**
in the app and paste the key.

## Architecture

```
client/   React + React Flow canvas, dagre auto-layout, WebSocket live sync
server/   Express REST + ws; store/ swaps memory<->postgres by DATABASE_URL
render.yaml  One Render Web Service + managed Postgres
```

The storage layer (`server/store/`) exposes one async interface with two
implementations, chosen at boot: in-memory+JSON file for local dev, Postgres in
production. Nothing above the store knows which is active.

## Deploy to Render

Push to GitHub, then in Render create a **Blueprint** from this repo. `render.yaml`
provisions the web service and a Postgres database, and generates an `ADMIN_KEY`
for you (view it in the service's Environment tab). Build runs `npm run build`
(builds the client); start runs `npm start`.

## Scope (the "bones") and what's next

In: canvas, propose/vote/commit, admin override, live sync, commit log,
multi-parent (DAG) connections, multi-select + bulk actions, deploy.
Deliberately deferred: accounts/auth, read-only links, stacked proposals
(proposing on proposals), comments, version history, image/PDF export, real
per-user vote integrity, and CRDT merge (currently last-write-wins).

## License

[MIT](LICENSE) © 2026 ClavaInc (Haven).
