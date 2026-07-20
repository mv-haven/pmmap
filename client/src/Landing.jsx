import './landing.css';

const REPO = 'https://github.com/mv-haven/mindmerge';

// A static term-graph that mirrors the real board: two committed domains, a
// term that belongs to both, and a proposed term still collecting votes.
function HeroGraph() {
  return (
    <svg className="lg-graph" viewBox="0 0 460 360" role="img" aria-label="A graph of property-management terms, some agreed and one still being voted on">
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

      {/* committed domain nodes */}
      <g className="lg-node lg-node--a">
        <rect x="24" y="70" width="96" height="52" rx="11" />
        <text x="40" y="94">Leasing</text>
        <text x="40" y="110" className="lg-sub">domain</text>
      </g>
      <g className="lg-node lg-node--b">
        <rect x="24" y="238" width="96" height="52" rx="11" />
        <text x="40" y="262">Maintenance</text>
        <text x="40" y="278" className="lg-sub">domain</text>
      </g>

      {/* term shared across two domains */}
      <g className="lg-node lg-node--shared">
        <rect x="246" y="170" width="110" height="52" rx="11" />
        <text x="262" y="194">Unit Turn</text>
        <text x="262" y="210" className="lg-sub">2 domains</text>
      </g>

      {/* proposed term collecting votes */}
      <g className="lg-node lg-node--pending">
        <rect x="300" y="276" width="112" height="52" rx="11" />
        <text x="316" y="300">Make-Ready</text>
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
          <span className="lg-diamond">◇</span> PMMap
          <span className="lg-by">powered by Haven</span>
        </a>
        <nav className="lg-nav">
          <a href="#how">How it works</a>
          <a href="#agents">For agents</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="lg-btn lg-btn--sm" href="/app">Open the map</a>
        </nav>
      </header>

      <main>
        <section className="lg-hero">
          <div className="lg-hero__copy">
            <p className="lg-kicker">The shared language of property management</p>
            <h1 className="lg-h1">
              An industry map of <em>how property management works</em>.
            </h1>
            <p className="lg-lede">
              PMMap is a living map of the field — its domains, terms, and
              definitions — built by the people who do the work. Propose a term
              or a definition; the industry votes; consensus commits to the
              canonical standard. Ambiguity gets resolved in the open.
            </p>
            <div className="lg-cta">
              <a className="lg-btn" href="/app">Open the map →</a>
              <a className="lg-btn lg-btn--ghost" href={REPO} target="_blank" rel="noreferrer">
                View the source
              </a>
            </div>
            <p className="lg-note">Open source · MIT · agent-first · no sign-up to try</p>
          </div>
          <div className="lg-hero__art">
            <HeroGraph />
          </div>
        </section>

        <section className="lg-how" id="how">
          <h2 className="lg-h2">Standards, settled by the field — not by decree.</h2>
          <ol className="lg-steps">
            <li className="lg-step">
              <span className="lg-step__n">01</span>
              <h3>Propose</h3>
              <p>Add a term or a definition anywhere on the map. It shows up pending, visible to everyone working the space in real time.</p>
            </li>
            <li className="lg-step">
              <span className="lg-step__n">02</span>
              <h3>Vote</h3>
              <p>The field weighs in. Duplicate proposals fold into the original, so the room converges instead of fragmenting.</p>
            </li>
            <li className="lg-step">
              <span className="lg-step__n">03</span>
              <h3>Standardize</h3>
              <p>At the threshold it commits to the canonical map. Maintainers at Haven can ratify or reject directly. Every change is logged.</p>
            </li>
          </ol>
        </section>

        <section className="lg-feat">
          <div className="lg-feat__grid">
            <article className="lg-card">
              <h3>One canonical map</h3>
              <p>The committed graph is the shared source of truth for what a term means — no more ten definitions of "delinquency" across ten firms.</p>
            </article>
            <article className="lg-card">
              <h3>Definitions by consensus</h3>
              <p>Terms earn their place by vote, not by whoever documented it first. The reasoning stays visible in the history.</p>
            </article>
            <article className="lg-card lg-card--wide">
              <h3>Terms cross domains</h3>
              <p>Property management isn't a tree. A "Unit Turn" lives in both Leasing and Maintenance; a "Work Order" touches Ops and Accounting. PMMap is a graph, so a term can answer to more than one domain and still stay cycle-free.</p>
            </article>
            <article className="lg-card">
              <h3>Yours to run</h3>
              <p>Open source under MIT. One service, zero config locally, a Postgres switch for production. Fork it for your own portfolio's glossary.</p>
            </article>
          </div>
        </section>

        <section className="lg-agents" id="agents">
          <div className="lg-agents__head">
            <h2 className="lg-h2">Agent-first, by design.</h2>
            <p className="lg-agents__lede">
              Every action a person can take, an agent can too — over the same
              plain HTTP API. Point Claude at the map to draft definitions, keep
              them consistent, and fill the gaps. No special integration; the
              board is the interface.
            </p>
          </div>
          <div className="lg-prompts">
            <div className="lg-prompt">
              <span className="lg-prompt__caret">›</span>
              Propose the standard definition for the 15 core leasing terms, and connect the ones that also belong to Maintenance.
            </div>
            <div className="lg-prompt">
              <span className="lg-prompt__caret">›</span>
              Audit every committed definition for internal consistency and flag any that conflict with each other.
            </div>
            <div className="lg-prompt">
              <span className="lg-prompt__caret">›</span>
              What common accounting terms are missing from the map? Draft definitions and open them as proposals.
            </div>
          </div>
          <p className="lg-agents__foot">
            The repo ships a <code>CLAUDE.md</code> and an agent guide with the API
            surface, example loops, and local-hosting steps.{' '}
            <a href={REPO} target="_blank" rel="noreferrer">Start here →</a>
          </p>
        </section>

        <section className="lg-final">
          <h2 className="lg-h2">Help define how the industry talks about itself.</h2>
          <div className="lg-cta lg-cta--center">
            <a className="lg-btn" href="/app">Open the map →</a>
            <a className="lg-btn lg-btn--ghost" href={REPO} target="_blank" rel="noreferrer">
              Read the docs
            </a>
          </div>
        </section>
      </main>

      <footer className="lg-foot">
        <span>◇ PMMap · powered by Haven</span>
        <span>MIT © 2026 ClavaInc (Haven)</span>
        <a href={REPO} target="_blank" rel="noreferrer">github.com/mv-haven/mindmerge</a>
      </footer>
    </div>
  );
}
