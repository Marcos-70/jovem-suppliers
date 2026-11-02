/** Cenário vectorial: plataforma petrolífera ao pôr do sol (nítido em qualquer resolução). */
export function RigScene({ className = '', title = 'Plataforma petrolífera ao pôr do sol' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050f2b" /><stop offset=".38" stopColor="#14275f" /><stop offset=".58" stopColor="#6b3f7d" /><stop offset=".72" stopColor="#e2693f" /><stop offset=".84" stopColor="#ffa03b" /><stop offset="1" stopColor="#ffd27a" /></linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3a24b" /><stop offset=".12" stopColor="#8b4a5c" /><stop offset=".45" stopColor="#1b2f68" /><stop offset="1" stopColor="#07163a" /></linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff6c8" stopOpacity="1" /><stop offset=".35" stopColor="#ffd36b" stopOpacity=".85" /><stop offset="1" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
        <radialGradient id="flame" cx=".5" cy=".7" r=".6"><stop offset="0" stopColor="#fff2a8" /><stop offset=".5" stopColor="#ff9a2e" /><stop offset="1" stopColor="#ff5a1f" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="800" height="600" fill="url(#sky)" />
      <circle cx="470" cy="365" r="210" fill="url(#sun)" /><circle cx="470" cy="372" r="46" fill="#fff3b8" opacity=".95" />
      <g opacity=".5" fill="#2c3f7e"><rect x="40" y="250" width="320" height="7" rx="3.5" /><rect x="120" y="278" width="230" height="5" rx="2.5" /><rect x="520" y="238" width="260" height="7" rx="3.5" /><rect x="560" y="268" width="190" height="5" rx="2.5" /><rect x="0" y="300" width="210" height="6" rx="3" /></g>
      <g opacity=".55" fill="#ff9c52"><rect x="300" y="332" width="330" height="5" rx="2.5" /><rect x="360" y="348" width="260" height="4" rx="2" /></g>
      <rect y="392" width="800" height="208" fill="url(#sea)" />
      <g opacity=".7" fill="#ffd27a"><rect x="410" y="400" width="120" height="3" rx="1.5" /><rect x="425" y="412" width="90" height="3" rx="1.5" /><rect x="438" y="425" width="64" height="3" rx="1.5" /><rect x="450" y="440" width="40" height="3" rx="1.5" /><rect x="458" y="458" width="26" height="3" rx="1.5" /></g>
      <g opacity=".25" fill="#fff"><rect x="40" y="430" width="140" height="2" /><rect x="600" y="470" width="150" height="2" /><rect x="220" y="510" width="180" height="2" /><rect x="520" y="540" width="200" height="2" /></g>
      {/* plataforma */}
      <g fill="#050c20" stroke="#050c20">
        <rect x="150" y="372" width="12" height="40" /><rect x="262" y="372" width="12" height="40" /><rect x="330" y="372" width="12" height="40" /><rect x="425" y="372" width="12" height="40" />
        <g strokeWidth="3" fill="none"><path d="M156 392l106-8M156 384l106 8M268 392l62-8M268 384l62 8M336 392l89-8M336 384l89 8" /></g>
        <rect x="132" y="350" width="322" height="24" /><rect x="150" y="334" width="150" height="16" /><rect x="330" y="326" width="90" height="24" />
        <rect x="176" y="316" width="46" height="18" /><rect x="236" y="320" width="30" height="14" />
        {/* torre de perfuração */}
        <path d="M356 326L372 114h14l16 212z" /><g stroke="#14275f" strokeWidth="1.6" fill="none"><path d="M363 280h46M367 232h38M370 188h32M372 150h28M360 300l44-20M364 252l38-20M368 206l34-18" /></g>
        <rect x="368" y="96" width="22" height="18" /><path d="M379 96V74" strokeWidth="3" />
        {/* grua */}
        <path d="M190 316V250l-8-6M190 250L108 292" strokeWidth="5" fill="none" /><path d="M108 292v38" strokeWidth="2" />
        {/* chaminé de gás */}
        <path d="M430 350V222h8v128" strokeWidth="2" /><path d="M434 222l52-34" strokeWidth="4" />
      </g>
      <ellipse cx="492" cy="178" rx="26" ry="38" fill="url(#flame)" /><path d="M492 140c10 18 12 30 0 44-12-14-10-26 0-44z" fill="#ffe27a" opacity=".9" />
      <g fill="#ffe9a8"><circle cx="160" cy="361" r="2.2" /><circle cx="196" cy="361" r="2.2" /><circle cx="244" cy="361" r="2.2" /><circle cx="300" cy="338" r="2.2" /><circle cx="380" cy="104" r="2.6" /><circle cx="214" cy="326" r="2" /><circle cx="388" cy="338" r="2.2" /></g>
      <path d="M0 600V560c120-14 220 4 330-8s210-20 470-6v54z" fill="#050f2b" opacity=".35" />
    </svg>
  )
}
