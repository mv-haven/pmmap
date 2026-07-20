// Haven brand lockup. The mark is a clean recreation of Haven's house-"H"
// glyph as inline SVG (drop in the official SVG when handy). Uses currentColor
// so it inherits the surrounding text color.
export function HavenMark({ size = 18, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 26"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2.5 11.5 L14 2 L25.5 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3.2" y="11" width="4" height="13" rx="1.2" />
      <rect x="20.8" y="11" width="4" height="13" rx="1.2" />
      <rect x="7.2" y="14.8" width="13.6" height="3.4" rx="1" />
      <rect x="12" y="18.6" width="4" height="5.4" rx="1" />
    </svg>
  );
}

// Small "powered by Haven" attribution that links to usehaven.ai.
export function PoweredByHaven({ className }) {
  return (
    <a
      className={className}
      href="https://usehaven.ai"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by Haven"
    >
      powered by <HavenMark size={15} /> <b>Haven</b>
    </a>
  );
}
