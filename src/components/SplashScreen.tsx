export const SPLASH_EXIT_MS = 800;

type Props = { leaving?: boolean };

const COLORS  = ['#5B3FCF','#F26B3A','#1FAFA6','#6BA547','#E94B8A'];
const LETTERS = ['H','o','o','d','a'];

export function SplashScreen({ leaving = false }: Props) {
  return (
    <main
      role="status"
      aria-label="A carregar a Baya"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease`,
      }}
    >
      <style>{`
        @keyframes _logoIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        ._hooda-logo {
          animation: _logoIn 0.6s cubic-bezier(0.34,1.2,0.64,1) both;
        }
      `}</style>

      <div className="_hooda-logo" style={{ display:'flex', alignItems:'center', gap: 0 }}>
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
    </main>
  );
}
