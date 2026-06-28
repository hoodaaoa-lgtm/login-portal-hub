export const SPLASH_EXIT_MS = 800;

type Props = { leaving?: boolean };

const COLORS  = ['#5B3FCF','#F26B3A','#1FAFA6','#6BA547','#E94B8A'];
const LETTERS = ['h','o','o','d','a'];

export function SplashScreen({ leaving = false }: Props) {
  return (
    <main
      role="status"
      aria-label="A carregar a Hooda"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#ffffff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease`,
      }}
    >
      <style>{`
        @keyframes _hoodaIn {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes _hoodaPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.75; }
        }
        ._hooda-logo {
          animation: _hoodaIn 0.55s cubic-bezier(0.34,1.3,0.64,1) both;
        }
        ._hooda-dots {
          animation: _hoodaIn 0.5s 0.4s ease both, _hoodaPulse 1.4s 1s ease-in-out infinite;
        }
      `}</style>

      {/* Logo "hooda" com letras coloridas */}
      <div className="_hooda-logo" style={{ display:'flex', alignItems:'center', gap: 1 }}>
        {LETTERS.map((ch, i) => (
          <span key={i} style={{
            fontSize: 52,
            fontWeight: 900,
            color: COLORS[i],
            fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
            lineHeight: 1,
            letterSpacing: -1,
          }}>
            {ch}
          </span>
        ))}
      </div>

      {/* Três pontinhos a pulsar (igual Instagram/TikTok) */}
      <div className="_hooda-dots" style={{ display:'flex', gap: 6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: COLORS[i],
            animation: `_hoodaPulse 1s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </main>
  );
}
