import { useEffect } from "react";

/**
 * Aplica fade-in automático (opacity 0 → 1, ~300ms, ease-out) a toda
 * <img>/<video> da app assim que terminam de carregar — sem precisar de
 * editar cada componente individualmente.
 *
 * Como funciona:
 *  - Marca cada <img>/<video> ainda não vista com a classe `.hooda-media`
 *    (estilo definido em styles.css: opacity:0, transition opacity).
 *  - Quando o browser dispara `load` (img) ou `loadeddata` (video) — captado
 *    via delegação de evento no document, fase de captura, porque `load`
 *    não faz bubble — adiciona `.is-loaded`, disparando o fade-in via CSS.
 *  - Imagens já completas no momento em que são observadas (cache do
 *    browser, SSR hidratado) recebem `.is-loaded` de imediato, para nunca
 *    ficarem presas invisíveis.
 *  - Um MutationObserver cobre conteúdo inserido depois (feed infinito,
 *    modais, stories, novas mensagens) sem precisar de re-render.
 *
 * Montar uma única vez perto da raiz da app (ver __root.tsx).
 */
export function useGlobalMediaFadeIn() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    const markLoaded = (el: HTMLImageElement | HTMLVideoElement) => {
      el.classList.add("is-loaded");
    };

    const prepare = (el: Element) => {
      if (!(el instanceof HTMLImageElement) && !(el instanceof HTMLVideoElement)) return;
      // Não interfere em SVGs decorativos pequenos, avatares já tratados
      // por outro mecanismo, ou elementos explicitamente isentos.
      if (el.dataset.noFade === "true") return;
      if (el.classList.contains("hooda-media")) {
        // já preparado
      } else {
        el.classList.add("hooda-media");
      }
      if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
        markLoaded(el);
      } else if (el instanceof HTMLVideoElement && el.readyState >= 2) {
        markLoaded(el);
      }
    };

    // Prepara tudo o que já está no DOM.
    document.querySelectorAll("img, video").forEach(prepare);

    // Delegação de `load`/`error` (img) e `loadeddata`/`error` (video) —
    // estes eventos não fazem bubble, por isso usamos a fase de captura.
    const onLoadCapture = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
        markLoaded(el);
      }
    };
    document.addEventListener("load", onLoadCapture, true);
    document.addEventListener("loadeddata", onLoadCapture, true);
    // Em caso de erro de carregamento, revela mesmo assim (evita imagem
    // fantasma presa em opacity:0 para sempre).
    document.addEventListener("error", onLoadCapture, true);

    // Observa novo conteúdo inserido dinamicamente (feed infinito, modais,
    // stories, novas mensagens) e prepara as novas imagens/vídeos.
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement) {
            prepare(node);
          }
          node.querySelectorAll?.("img, video").forEach(prepare);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("load", onLoadCapture, true);
      document.removeEventListener("loadeddata", onLoadCapture, true);
      document.removeEventListener("error", onLoadCapture, true);
      mo.disconnect();
    };
  }, []);
}
