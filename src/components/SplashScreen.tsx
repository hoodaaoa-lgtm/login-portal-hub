import snapperLogo from "../assets/splash/snapper-logo-full.png";

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

      <div className="_baya-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={snapperLogo} alt="Snapper" style={{ width: 220, height: 'auto' }} />
      </div>
    </main>
  );
}
