import './landing.css';

const REPO = 'https://github.com/mv-haven/mindmerge';

// A static term-graph that mirrors the real board: two committed domains, a
// term that belongs to both, and a proposed term still collecting votes.
function HeroGraph() {
  return (
    <svg className="lg-graph" viewBox="0 0 460 360" role="img" aria-label="Property-management terms as a graph; one is still being voted on">
      <defs>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4" fill="rgba(23,21,15,0.10)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="460" height="360" fill="url(#dots)" rx="14" />

      <path className="lg-edge" d="M120,96 C190,96 190,196 246,196" />
      <path className="lg-edge" d="M120,264 C190,264 190,196 246,196" />
      <path className="lg-edge lg-edge--link" d="M120,96 C170,96 176,286 246,300" />
      <path className="lg-edge lg-edge--pending" d="M356,196 C400,196 400,300 360,300" />

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
      <g className="lg-node lg-node--shared">
        <rect x="246" y="170" width="110" height="52" rx="11" />
        <text x="262" y="194">Unit Turn</text>
        <text x="262" y="210" className="lg-sub">aka Make-Ready</text>
      </g>
      <g className="lg-node lg-node--pending">
        <rect x="300" y="276" width="112" height="52" rx="11" />
        <text x="316" y="300">Concession</text>
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
          <a href="#agents">For agents</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="lg-btn lg-btn--sm" href="/app">Open the map</a>
        </nav>
      </header>

      <main>
        <section className="lg-hero">
          <div className="lg-hero__copy">
            <h1 className="lg-h1">
              The shared definitions of <em>property management</em>.
            </h1>
            <p className="lg-lede">Propose a term. The field votes. Consensus becomes the standard.</p>
            <div className="lg-cta">
              <a className="lg-btn" href="/app">Open the map →</a>
              <a className="lg-btn lg-btn--ghost" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <p className="lg-note">Open source · MIT · agent-first</p>
          </div>
          <div className="lg-hero__art">
            <HeroGraph />
          </div>
        </section>

        <section className="lg-model">
          <div><b>Propose</b> a term or definition.</div>
          <div><b>Vote</b> — the field decides.</div>
          <div><b>Standardize</b> — consensus commits to the map.</div>
        </section>

        <section className="lg-agents" id="agents">
          <h2 className="lg-h2">Built for agents.</h2>
          <p className="lg-agents__lede">
            The board has an open HTTP API. Send this page to an agent and let it
            work — same interface a person uses, duplicates fold in automatically.
          </p>
          <div className="lg-prompts">
            <div className="lg-prompt"><span className="lg-prompt__caret">›</span>Read the map. Propose standard definitions for the 15 core leasing terms; connect the ones that also belong to Maintenance.</div>
            <div className="lg-prompt"><span className="lg-prompt__caret">›</span>Audit every committed definition for conflicts. Open a proposal to reconcile each one you find.</div>
            <div className="lg-prompt"><span className="lg-prompt__caret">›</span>Find the missing accounting terms. Draft plain definitions and open them as proposals.</div>
          </div>
          <p className="lg-agents__foot">
            Brief: <code>CLAUDE.md</code> + <code>docs/working-with-agents.md</code>{' '}
            <a href={REPO} target="_blank" rel="noreferrer">on GitHub →</a>
          </p>
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
