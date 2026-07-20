import './landing.css';

const REPO = 'https://github.com/mv-haven/mindmerge';

// A static node-graph that mirrors the real canvas: two committed parents,
// a proposal collecting votes, and a shared (multi-parent) child.
function HeroGraph() {
  return (
    <svg className="lg-graph" viewBox="0 0 460 360" role="img" aria-label="A mind map with proposals merging into a shared graph">
      <defs>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4" fill="rgba(23,21,15,0.10)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="460" height="360" fill="url(#dots)" rx="14" />

      {/* edges */}
      <path className="lg-edge" d="M120,96 C190,96 190,196 246,196" />
      <path className="lg-edge" d="M120,264 C190,264 190,196 246,196" />
      <path className="lg-edge lg-edge--link" d="M120,96 C170,96 176,286 246,300" />
      <path className="lg-edge lg-edge--pending" d="M356,196 C400,196 400,300 360,300" />

      {/* committed parent nodes */}
      <g className="lg-node lg-node--a">
        <rect x="24" y="70" width="96" height="52" rx="11" />
        <text x="40" y="94">Roadmap</text>
        <text x="40" y="110" className="lg-sub">committed</text>
      </g>
      <g className="lg-node lg-node--b">
        <rect x="24" y="238" width="96" height="52" rx="11" />
        <text x="40" y="262">Research</text>
        <text x="40" y="278" className="lg-sub">committed</text>
      </g>

      {/* shared child */}
      <g className="lg-node lg-node--shared">
        <rect x="246" y="170" width="110" height="52" rx="11" />
        <text x="262" y="194">Renewals</text>
        <text x="262" y="210" className="lg-sub">2 parents</text>
      </g>

      {/* pending proposal with votes */}
      <g className="lg-node lg-node--pending">
        <rect x="300" y="276" width="112" height="52" rx="11" />
        <text x="316" y="300">Auto-close</text>
        <g className="lg-pill" transform="translate(316,308)">
          <rect x="0" y="0" width="52" height="16" rx="8" />
          <text x="9" y="12">▲ 8/10</text>
        </g>
      </g>
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="lg">
      <header className="lg-top">
        <a className="lg-wordmark" href="/">
          <span className="lg-diamond">◇</span> MindMerge
        </a>
        <nav className="lg-nav">
          <a href="#how">How it works</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="lg-btn lg-btn--sm" href="/app">Open the board</a>
        </nav>
      </header>

      <main>
        <section className="lg-hero">
          <div className="lg-hero__copy">
            <p className="lg-kicker">Version control for thinking</p>
            <h1 className="lg-h1">
              A mind map that <em>ships ideas</em> by consensus.
            </h1>
            <p className="lg-lede">
              The board is a shared main branch. Anyone proposes a node; the crowd
              upvotes it; at the threshold it commits to the master map on its own.
              Maintainers can merge or dismiss on sight. It's pull requests, for ideas.
            </p>
            <div className="lg-cta">
              <a className="lg-btn" href="/app">Open the live board →</a>
              <a className="lg-btn lg-btn--ghost" href={REPO} target="_blank" rel="noreferrer">
                Star on GitHub
              </a>
            </div>
            <p className="lg-note">Open source · MIT · no sign-up to try</p>
          </div>
          <div className="lg-hero__art">
            <HeroGraph />
          </div>
        </section>

        <section className="lg-how" id="how">
          <h2 className="lg-h2">Ideas earn their place on the map.</h2>
          <ol className="lg-steps">
            <li className="lg-step">
              <span className="lg-step__n">01</span>
              <h3>Propose</h3>
              <p>Hang a new node off any committed one. It appears dashed and pending, visible to everyone in real time.</p>
            </li>
            <li className="lg-step">
              <span className="lg-step__n">02</span>
              <h3>Vote</h3>
              <p>One vote per person. Duplicates fold into the original instead of splitting the room. Watch the tally climb live.</p>
            </li>
            <li className="lg-step">
              <span className="lg-step__n">03</span>
              <h3>Commit</h3>
              <p>Hit the threshold and it merges into the master map automatically. Every merge lands in the commit log.</p>
            </li>
          </ol>
        </section>

        <section className="lg-feat">
          <div className="lg-feat__grid">
            <article className="lg-card">
              <h3>Real-time, no refresh</h3>
              <p>Proposals, votes and merges stream to every open board over a live socket. It feels like one shared document.</p>
            </article>
            <article className="lg-card">
              <h3>Maintainer override</h3>
              <p>Hold the key and you commit, dismiss, move, delete, and bulk-edit — the crowd is the default reviewer, you're the tiebreak.</p>
            </article>
            <article className="lg-card lg-card--wide">
              <h3>Not a tree. A graph.</h3>
              <p>A node can answer to more than one parent. Connect ideas across branches; the map stays a clean, cycle-free DAG, and a shared node survives losing any single parent.</p>
            </article>
            <article className="lg-card">
              <h3>Yours to run</h3>
              <p>One service, zero config locally, a Postgres switch for production. Fork it, self-host it, bend it to your team.</p>
            </article>
          </div>
        </section>

        <section className="lg-final">
          <h2 className="lg-h2">Point it at your next messy decision.</h2>
          <div className="lg-cta lg-cta--center">
            <a className="lg-btn" href="/app">Open the live board →</a>
            <a className="lg-btn lg-btn--ghost" href={REPO} target="_blank" rel="noreferrer">
              Read the source
            </a>
          </div>
        </section>
      </main>

      <footer className="lg-foot">
        <span>◇ MindMerge</span>
        <span>MIT © 2026 ClavaInc (Haven)</span>
        <a href={REPO} target="_blank" rel="noreferrer">github.com/mv-haven/mindmerge</a>
      </footer>
    </div>
  );
}
