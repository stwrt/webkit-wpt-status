/**
 * Mojave's horizon mark, inlined from https://mojave.sh/favicon.svg so the badge
 * costs no extra request. The clip path is id-namespaced because this renders
 * inside a document that may hold other SVGs.
 */
function MojaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id="mojave-badge-horizon">
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath="url(#mojave-badge-horizon)">
        <rect width="64" height="64" fill="#f7f1e6" />
        <circle cx="32" cy="23.5" r="10.25" fill="#e07a3e" />
        <path
          d="M-4 34c10.5-4.8 17.2-4.7 25.1.2 9.5 5.9 17.5 5.4 27.1-.8C55 29 62.6 30.1 68 33.7V68H-4Z"
          fill="#dfa879"
        />
        <path d="M-4 39.2c11.5 3.7 20.8 4.1 30.1-.7 13.2-6.8 23.2-8.6 41.9-2.2V68H-4Z" fill="#e07a3e" />
        <path d="M-4 45.2c13.4 2.3 24.1 1.1 35.4-4.3 13.4-6.4 24.2-6.2 36.6-.5V68H-4Z" fill="#c14f2d" />
        <path d="M-4 56.2c13.5 4.8 23.4 3.1 35.9-4.9 13.8-8.8 24.8-10.5 36.1-5.8V68H-4Z" fill="#2f2a26" />
      </g>
    </svg>
  );
}

export function MojaveBadge() {
  return (
    <a
      href="https://mojave.sh"
      target="_blank"
      rel="noreferrer"
      className="border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/25 inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs transition-colors"
    >
      <MojaveMark className="size-5 rounded-full" />
      <span>
        Hosted on <span className="text-foreground font-medium">Mojave</span>
      </span>
    </a>
  );
}
