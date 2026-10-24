/** Emblema de Vault Keeper: un rombo dentro de un rombo, con un núcleo de luz, como una cerradura de alijo. */
export function Emblem({ className = "", spin = false }: { className?: string; spin?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" fill="none" stroke="currentColor">
      <g style={spin ? { transformOrigin: "60px 60px", animation: "drift 60s linear infinite" } : undefined}>
        <rect x="26" y="26" width="68" height="68" transform="rotate(45 60 60)" strokeWidth="1.2" opacity="0.5" />
      </g>
      <rect x="36" y="36" width="48" height="48" transform="rotate(45 60 60)" strokeWidth="2" />
      <rect x="47" y="47" width="26" height="26" transform="rotate(45 60 60)" strokeWidth="1.5" opacity="0.7" />
      <path d="M60 2v22M60 96v22M2 60h22M96 60h22" strokeWidth="1.5" opacity="0.7" />
      <circle cx="60" cy="60" r="6" fill="currentColor" stroke="none" />
    </svg>
  );
}
