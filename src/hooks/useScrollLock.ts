import { useEffect } from "react";

/**
 * Bloqueia o scroll do body enquanto o componente que chama este hook
 * está montado (modal aberto). Restaura o scroll ao desmontar.
 * Funciona com múltiplos modais empilhados (contador de referências).
 */
let lockCount = 0;

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lockCount++;
    if (lockCount === 1) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        const top = parseInt(document.body.style.top || "0", 10) * -1;
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, top);
      }
    };
  }, [active]);
}
