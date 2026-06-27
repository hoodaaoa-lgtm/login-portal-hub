import { useEffect, useState } from "react";

export const SPLASH_EXIT_MS = 600;

const LETTERS = [
  { char: "H", color: "#5B3FCF" },
  { char: "o", color: "#F26B3A" },
  { char: "o", color: "#1FAFA6" },
  { char: "d", color: "#6BA547" },
  { char: "a", color: "#E94B8A" },
];

const DOT_COLORS = ["#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];

type Props = { leaving?: boolean };

export function SplashScreen({ leaving = false }: Props) {
  const [phase, setPhase] = useState(0);

  // fase 0 = inicial
  // fase 1 = H entra (0.1s)
  // fase 2 = círculos aparecem (0.7s)
  // fase 3 = círculos orbitam (1.3s)
  // fase 4 = letras formam Hooda (2.2s)
  // fase 5 = glow final (3.2s)

  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1300),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 3200),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  const ORBIT_R = 52;
  const ORBIT_ANGLES = [-70, 20, 110, 200];

  return (
    <main
      role="status"
      aria-label="A carregar a Hooda"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease-in`,
      }}
    >
      <style>{`
        @keyframes hPop {
          0%   { opacity:0; transform:scale(0.5) translateY(10px); }
          65%  { transform:scale(1.12) translateY(-2px); }
          100% { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes dotPop {
          0%   { opacity:0; transform:scale(0); }
          65%  { transform:scale(1.25); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes orbitSpin {
          from { transform: rotate(var(--a)) translateX(52px); }
          to   { transform: rotate(calc(var(--a) + 360deg)) translateX(52px); }
        }
        @keyframes letterIn {
          0%   { opacity:0; transform:translateY(16px) scale(0.6); }
          65%  { transform:translateY(-3px) scale(1.08); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes glowPulse {
          0%   { filter:brightness(1) drop-shadow(0 0 0px transparent); }
          50%  { filter:brightness(1.15) drop-shadow(0 0 20px rgba(91,63,207,0.45)); }
          100% { filter:brightness(1) drop-shadow(0 0 0px transparent); }
        }
      `}</style>

      <div style={{ position: "relative", width: 240, height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* ── Fases 1-3: H central + círculos ── */}
        {phase < 4 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>

            {/* H */}
            {phase >= 1 && (
              <span style={{
                fontSize: 76,
                fontWeight: 900,
                color: "#5B3FCF",
                lineHeight: 1,
                fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
                animation: "hPop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards",
                position: "relative",
                zIndex: 2,
                display: "inline-block",
              }}>H</span>
            )}

            {/* Círculos estáticos — fase 2 */}
            {phase === 2 && DOT_COLORS.map((color, i) => {
              const rad = (ORBIT_ANGLES[i] * Math.PI) / 180;
              const x = Math.cos(rad) * 44;
              const y = Math.sin(rad) * 44;
              return (
                <div key={i} style={{
                  position: "absolute",
                  width: 13, height: 13,
                  borderRadius: "50%",
                  background: color,
                  left: "50%", top: "50%",
                  marginLeft: -6.5, marginTop: -6.5,
                  transform: `translate(${x}px, ${y}px)`,
                  animation: `dotPop 0.4s ${i * 0.07}s cubic-bezier(0.34,1.56,0.64,1) both`,
                }} />
              );
            })}

            {/* Círculos em órbita — fase 3 */}
            {phase === 3 && DOT_COLORS.map((color, i) => (
              <div key={i} style={{
                position: "absolute",
                left: "50%", top: "50%",
                width: 0, height: 0,
              }}>
                <div style={{
                  position: "absolute",
                  width: 13, height: 13,
                  borderRadius: "50%",
                  background: color,
                  marginLeft: -6.5,
                  marginTop: -6.5,
                  "--a": `${ORBIT_ANGLES[i]}deg`,
                  transform: `rotate(${ORBIT_ANGLES[i]}deg) translateX(${ORBIT_R}px)`,
                  animation: `orbitSpin 0.85s ${i * 0.06}s cubic-bezier(0.4,0,0.2,1) infinite`,
                } as any} />
              </div>
            ))}
          </div>
        )}

        {/* ── Fases 4-5: "Hooda" completo ── */}
        {phase >= 4 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            animation: phase >= 5 ? "glowPulse 1s ease-in-out" : "none",
          }}>
            {LETTERS.map((l, i) => (
              <span key={i} style={{
                fontSize: 56,
                fontWeight: 900,
                color: l.color,
                lineHeight: 1,
                fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
                display: "inline-block",
                animation: `letterIn 0.5s ${i * 0.08}s cubic-bezier(0.34,1.56,0.64,1) both`,
              }}>
                {l.char}
              </span>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
