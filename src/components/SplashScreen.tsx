import snapperIcon from "../assets/splash/snapper-icon.png";

export const SPLASH_EXIT_MS = 800;

type Props = { leaving?: boolean };

export function SplashScreen({ leaving = false }: Props) {
  return (
    <main
      role="status"
      aria-label="A carregar a Snapper"
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
        ._baya-logo {
          animation: _logoIn 0.6s cubic-bezier(0.34,1.2,0.64,1) both;
        }
      `}</style>

      <div className="_baya-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <img src={snapperIcon} alt="" style={{ width: 96, height: 'auto' }} />
        <span
          style={{
            fontSize: 40,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: -1,
            fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
          }}
        >
          <span style={{ color: '#0B1220' }}>snap</span>
          <span
            style={{
              background: 'linear-gradient(90deg,#E94B8A,#F2874B,#7F5AF0)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            per
          </span>
        </span>
      </div>
    </main>
  );
}
