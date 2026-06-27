import { useEffect, useState } from "react";

export const SPLASH_EXIT_MS = 600;

/**
 * Splash screen com animação de 5 fases:
 * 1. H aparece
 * 2. Círculos coloridos surgem
 * 3. Círculos giram ao redor do H
 * 4. Formam a palavra "hooda"
 * 5. Logo completo brilha → app abre
 *
 * Mantém-se visível até que `leaving` seja true (auth check concluída).
 * Duração mínima garantida pelo root para não piscar.
 */

type Props = { leaving?: boolean };

// Cores dos círculos/letras
const COLORS = {
  h: "#7C3AED",   // roxo
  o1: "#F97316",  // laranja
  o2: "#06B6D4",  // azul
  d: "#22C55E",   // verde
  a: "#EC4899",   // rosa
};

// Posições dos círculos quando orbitam o H (em graus, sentido horário)
const ORBIT_POSITIONS = [
  { angle: -60,  color: COLORS.o1, delay: 0 },
  { angle: 30,   color: COLORS.o2, delay: 0.08 },
  { angle: 120,  color: COLORS.d,  delay: 0.16 },
  { angle: 210,  color: COLORS.a,  delay: 0.24 },
];

export function SplashScreen({ leaving = false }: Props) {
  // fase: 0=initial 1=H-in 2=dots-appear 3=dots-orbit 4=word-form 5=shine
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase(1), 80));   // H entra
    timers.push(setTimeout(() => setPhase(2), 700));  // círculos aparecem
    timers.push(setTimeout(() => setPhase(3), 1300)); // giram
    timers.push(setTimeout(() => setPhase(4), 2100)); // formam "hooda"
    timers.push(setTimeout(() => setPhase(5), 2900)); // brilha
    return () => timers.forEach(clearTimeout);
  }, []);

  const R = 54; // raio da órbita em px

  return (
    <main
      className="fixed inset-0 z-50 flex min-h-screen w-full items-center justify-center"
      role="status"
      aria-label="A carregar a Hooda"
      style={{
        background: "#fff",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease-in`,
      }}
    >
      <style>{`
        @keyframes hPop {
          0%   { opacity:0; transform:scale(0.6); }
          70%  { transform:scale(1.08); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes dotPop {
          0%   { opacity:0; transform:scale(0); }
          60%  { transform:scale(1.3); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes orbit {
          from { transform: rotate(var(--start-angle)) translateX(${R}px) rotate(calc(-1 * var(--start-angle))); }
          to   { transform: rotate(calc(var(--start-angle) + 360deg)) translateX(${R}px) rotate(calc(-1 * (var(--start-angle) + 360deg))); }
        }
        @keyframes letterIn {
          0%   { opacity:0; transform: translateY(14px) scale(0.7); }
          70%  { transform: translateY(-3px) scale(1.05); }
          100% { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes shine {
          0%   { filter: brightness(1); }
          50%  { filter: brightness(1.4) drop-shadow(0 0 18px rgba(124,58,237,0.6)); }
          100% { filter: brightness(1); }
        }
        @keyframes ray {
          0%   { opacity:0; transform: scale(0.5); }
          50%  { opacity:0.6; }
          100% { opacity:0; transform: scale(1.6); }
        }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ width: 220, height: 140 }}>

        {/* ── Fase 1-3: H + círculos ── */}
        {phase < 4 && (
          <div className="absolute inset-0 flex items-center justify-center">

            {/* H */}
            <span
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: COLORS.h,
                lineHeight: 1,
                fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
                animation: phase >= 1 ? "hPop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards" : "none",
                opacity: phase >= 1 ? undefined : 0,
                position: "relative",
                zIndex: 2,
              }}
            >
              H
            </span>

            {/* Círculos em fase 2 (estáticos) */}
            {phase === 2 && ORBIT_POSITIONS.map((dot, i) => {
              const rad = (dot.angle * Math.PI) / 180;
              const x = Math.cos(rad) * 42;
              const y = Math.sin(rad) * 42;
              return (
                <div key={i} style={{
                  position: "absolute",
                  width: 14, height: 14,
                  borderRadius: "50%",
                  background: dot.color,
                  left: "50%", top: "50%",
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  animation: `dotPop 0.35s ${dot.delay}s cubic-bezier(0.34,1.56,0.64,1) both`,
                  zIndex: 3,
                }} />
              );
            })}

            {/* Círculos em fase 3 (a girar) */}
            {phase === 3 && ORBIT_POSITIONS.map((dot, i) => (
              <div key={i} style={{
                position: "absolute",
                left: "50%", top: "50%",
                width: 0, height: 0,
                "--start-angle": `${dot.angle}deg`,
              } as any}>
                <div style={{
                  position: "absolute",
                  width: 14, height: 14,
                  borderRadius: "50%",
                  background: dot.color,
                  transform: `rotate(${dot.angle}deg) translateX(${R}px) rotate(${-dot.angle}deg)`,
                  animation: `orbit 0.7s ${dot.delay * 0.5}s cubic-bezier(0.4,0,0.2,1) forwards`,
                  marginLeft: -7, marginTop: -7,
                }} />
              </div>
            ))}
          </div>
        )}

        {/* ── Fase 4-5: "hooda" completo ── */}
        {phase >= 4 && (
          <div
            className="flex items-center"
            style={{
              gap: 1,
              animation: phase >= 5 ? "shine 0.8s ease-in-out" : "none",
            }}
          >
            {/* Raios de brilho fase 5 */}
            {phase >= 5 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {[0,45,90,135,180,225,270,315].map((angle, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    width: 2, height: 30,
                    background: `linear-gradient(to top, transparent, ${COLORS.h}80)`,
                    transformOrigin: "50% 100%",
                    transform: `rotate(${angle}deg) translateY(-55px)`,
                    animation: `ray 0.6s ${i * 0.04}s ease-out both`,
                  }} />
                ))}
              </div>
            )}

            {/* Letras de "hooda" com cores e animação staggered */}
            {[
              { char: "h", color: COLORS.h,  delay: 0 },
              { char: "o", color: COLORS.o1, delay: 0.07 },
              { char: "o", color: COLORS.o2, delay: 0.14 },
              { char: "d", color: COLORS.d,  delay: 0.21 },
              { char: "a", color: COLORS.a,  delay: 0.28 },
            ].map((l, i) => (
              <span key={i} style={{
                fontSize: 52,
                fontWeight: 900,
                color: l.color,
                lineHeight: 1,
                fontFamily: "'Nunito','Quicksand',system-ui,sans-serif",
                animation: `letterIn 0.45s ${l.delay}s cubic-bezier(0.34,1.56,0.64,1) both`,
                display: "inline-block",
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
