// ── Barra de progresso no topo (estilo YouTube) ──
// Aparece a cada transição de rota e desaparece suavemente quando completa.
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function TopProgressBar() {
  const isLoading = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (isLoading) {
      setVisible(true);
      setProgress(8);
      // sobe gradualmente até ~80% enquanto carrega
      const steps = [
        [80, 25],
        [160, 45],
        [320, 65],
        [600, 80],
      ] as const;
      steps.forEach(([ms, val]) => {
        timers.current.push(setTimeout(() => setProgress(val), ms));
      });
    } else if (visible) {
      // completa e desaparece
      setProgress(100);
      timers.current.push(
        setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 220),
      );
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 240ms ease-out",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "#2F6FED",
          boxShadow: "0 0 8px rgba(47,111,237,0.55)",
          transition: "width 280ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />
    </div>
  );
}
