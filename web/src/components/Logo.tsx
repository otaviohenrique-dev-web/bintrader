/** Marca do OrderFlow Lab: escudo (Aegis) com perfil de volume (order flow). Fonte: scripts/make-icons.mjs */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="OrderFlow Lab">
      <defs>
        <linearGradient id="mk-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d9a6" />
          <stop offset="1" stopColor="#b98f3e" />
        </linearGradient>
      </defs>
      <path d="M32 3.5 54 11v19.5C54 44.5 44.8 54.8 32 60.5 19.2 54.8 10 44.5 10 30.5V11z" fill="#0e1116" stroke="url(#mk-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <g fill="url(#mk-g)">
        <rect x="27" y="16" width="10" height="4.4" rx="2.2" opacity=".55" />
        <rect x="21" y="23" width="22" height="4.4" rx="2.2" opacity=".8" />
        <rect x="17" y="30" width="30" height="4.4" rx="2.2" />
        <rect x="23" y="37" width="18" height="4.4" rx="2.2" opacity=".8" />
        <rect x="28" y="44" width="8" height="4.4" rx="2.2" opacity=".55" />
      </g>
    </svg>
  );
}

/** Emblema do agente Aegis IA: rede mínima de 3 nós com núcleo. */
export function AgentMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Aegis IA">
      <defs>
        <linearGradient id="ag-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d9a6" />
          <stop offset="1" stopColor="#b98f3e" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="#0e1116" stroke="url(#ag-g)" strokeWidth="2.4" />
      <g stroke="url(#ag-g)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M32 17 19 40M32 17l13 23M19 40h26M32 17v15M19 40l13-8M45 40l-13-8" />
      </g>
      <g fill="url(#ag-g)">
        <circle cx="32" cy="17" r="4" />
        <circle cx="19" cy="40" r="4" />
        <circle cx="45" cy="40" r="4" />
      </g>
      <circle cx="32" cy="32" r="5.5" fill="#f0d9a6" />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Mark size={28} /></span>
      <span className="brand-name">OrderFlow<span className="lab"> Lab</span></span>
    </div>
  );
}
