import { useState, useEffect } from "react";

/**
 * Converte um timestamp ISO em tempo relativo (agora, 5m, 2h, 3d, 15/06/2026…)
 * e atualiza automaticamente a cada minuto para nunca ficar desatualizado.
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60)     return "agora";
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; // até 7 dias
  // mais de 7 dias → data formatada
  return new Date(dateStr).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Hook que devolve o tempo relativo de uma data e atualiza-o a cada minuto.
 * Usar em componentes que mostram "há X minutos".
 *
 * @example
 *   const time = useTimeAgo(post.created_at);
 *   // → "agora" / "5m" / "2h" / "3d" / "15/06/2026"
 */
export function useTimeAgo(dateStr: string | null | undefined): string {
  const [label, setLabel] = useState(() => timeAgo(dateStr));

  useEffect(() => {
    if (!dateStr) return;
    setLabel(timeAgo(dateStr));

    // Atualiza a cada 60 segundos
    const id = setInterval(() => setLabel(timeAgo(dateStr)), 60_000);
    return () => clearInterval(id);
  }, [dateStr]);

  return label;
}
