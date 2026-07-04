import { useEffect, useRef, useState } from "react";

interface UseVideoInViewOptions {
  /** Distância antes de entrar na tela em que já consideramos "perto" (pré-carrega). */
  rootMargin?: string;
  /** Fração visível necessária para considerar "em vista". */
  threshold?: number;
}

interface UseVideoInViewResult<T extends HTMLElement> {
  /** Anexar à `ref` do elemento a observar (o wrapper do player). */
  ref: React.RefObject<T | null>;
  /** true enquanto o elemento está visível no viewport. */
  isInView: boolean;
  /** true assim que o elemento entrou na tela pela primeira vez (nunca volta a false). */
  hasEnteredOnce: boolean;
}

/**
 * useVideoInView — observa a visibilidade de um vídeo no feed.
 *
 * Serve dois propósitos, ambos essenciais para performance e boa UX
 * (igual ao comportamento do X/Instagram/TikTok):
 *
 *  1. Lazy load real: o <video> só recebe `src`/carrega dados quando está
 *     perto de entrar na tela (controlado via `hasEnteredOnce`), em vez de
 *     todos os vídeos do feed começarem a baixar dados ao mesmo tempo.
 *  2. Autoplay respeitoso: reprodução automática só acontece com o vídeo
 *     visível, e pausa sozinha assim que ele sai da tela — sem continuar
 *     a consumir rede/bateria em segundo plano.
 *
 * Sem suporte a IntersectionObserver (ambientes muito antigos), assume-se
 * "sempre visível" para não quebrar a reprodução.
 */
export function useVideoInView<T extends HTMLElement>(
  opts: UseVideoInViewOptions = {},
): UseVideoInViewResult<T> {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false);
  const { rootMargin = "200px 0px", threshold = 0.25 } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      setHasEnteredOnce(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
        if (entry.isIntersecting) setHasEnteredOnce(true);
      },
      { rootMargin, threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  // Pausa automaticamente se a aba/página deixar de estar visível
  // (ex.: utilizador troca de separador) — evita áudio "fantasma".
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) setIsInView(false);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return { ref, isInView, hasEnteredOnce };
}
