# Contributing to MindMerge

Thanks for your interest in MindMerge. Contributions are welcome.

## Getting set up

```bash
git clone https://github.com/mv-haven/mindmerge.git
cd mindmerge
npm install
npm --prefix client install
cp .env.example .env    # set VOTE_THRESHOLD=2 for easy local testing
npm run dev             # client on :5173, server on :3001
```

With no `DATABASE_URL`, data persists to `data/store.json`, so there's nothing else to set up.

## Before opening a pull request

- Run the tests: `npm test` (spawns the server and exercises the API end to end).
- Keep the two storage backends (`server/store/memory.js` and `server/store/postgres.js`) behaviorally identical — they share one interface and the memory store is the source of truth for local dev and tests.
- Match the surrounding style. No build step beyond Vite; no framework churn.

## Reporting bugs and ideas

Open an issue describing what you expected and what happened. For a bug, steps to reproduce (and whether it's on the hosted instance or a local run) help a lot.

## Scope

MindMerge is intentionally small: a collaborative mind map where proposals earn their way in by vote, with admin override. When proposing a feature, a short note on why it belongs in the core (vs. a fork) is appreciated.
