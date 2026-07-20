import './landing.css';
import { PoweredByHaven } from './components/HavenBrand.jsx';

const HAVEN = 'https://usehaven.ai';

export default function Why() {
  return (
    <div className="lg">
      <header className="lg-top">
        <div className="lg-brand">
          <a className="lg-wordmark" href="/"><span className="lg-diamond">◇</span> PMMap</a>
          <PoweredByHaven className="lg-by" />
        </div>
        <nav className="lg-nav">
          <a href="/">Home</a>
          <a href="/app" className="lg-btn lg-btn--sm">Open the map</a>
        </nav>
      </header>

      <article className="lg-why">
        <h1 className="lg-h1">Why we built this.</h1>

        <p className="lg-why__lead">Property management needs standardization.</p>

        <p>
          Ask ten different property managers what &ldquo;delinquency&rdquo; means, or
          &ldquo;unit turn,&rdquo; or &ldquo;make-ready,&rdquo; and you get ten
          close-but-different answers. That is fine in a hallway conversation. It is
          expensive everywhere else. Data doesn&rsquo;t map cleanly between systems,
          reports don&rsquo;t compare, and software quietly assumes a definition the next
          tool doesn&rsquo;t share.
        </p>

        <p>
          An agent is only as good as the definitions it operates on. Before you can
          automate leasing or maintenance, you have to pin down what the words mean,
          and there was no canonical place for that. Every glossary lived inside one
          company&rsquo;s wiki or one vendor&rsquo;s schema.
        </p>

        <p>
          A standard shouldn&rsquo;t come from a single company&rsquo;s glossary or a
          committee behind closed doors. It should be built in the open, by the people
          who do the work, and settled by consensus. On PMMap you propose a term, the
          field votes, and agreement commits to the canonical map. Terms can belong to
          more than one domain, because the real work does too.
        </p>

        <p>
          It is agent-first for the same reason it exists. Agents are about to do a
          great deal of property-management work, and they need a shared,
          machine-readable definition of the field. They should help build it too.
          Point one at the map and it can draft definitions, connect related terms,
          and flag conflicts alongside people. The brief lives at{' '}
          <a href="/llms.txt">/llms.txt</a>.
        </p>

        <p>
          And it is open. A shared standard only works if everyone can see it, use it,
          and shape it, so PMMap is open source and free to use. Take it, fork it,
          build the glossary your portfolio needs.
        </p>

        <div className="lg-cta">
          <a className="lg-btn" href="/app">Open the map &rarr;</a>
          <a className="lg-btn lg-btn--ghost" href={HAVEN} target="_blank" rel="noreferrer">Meet Haven</a>
        </div>
      </article>

      <footer className="lg-foot">
        <span>◇ PMMap</span>
        <span className="lg-foot__links">
          <a href={HAVEN} target="_blank" rel="noreferrer">Haven</a>
          <a href="https://blog.usehaven.ai/archive" target="_blank" rel="noreferrer">Blog</a>
          <a href="https://github.com/mv-haven/pmmap" target="_blank" rel="noreferrer">GitHub</a>
          <a href="/llms.txt">/llms.txt</a>
        </span>
        <span className="lg-foot__legal">MIT © 2026 ClavaInc (Haven)</span>
      </footer>
    </div>
  );
}
