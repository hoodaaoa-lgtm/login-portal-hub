import { Component, useEffect, useState, type ReactNode } from "react";
import { isLottieSticker } from "@/lib/stickers";

const lottieCache = new Map<string, any>();

// A "lottie-react" (e a lottie-web por baixo) mexe em `document`/`window`,
// que não existem no servidor. Como o Hooda faz SSR, importar isto no topo
// do módulo rebentava a página inteira assim que um sticker aparecia no
// ecrã (erro genérico "This page didn't load"). Por isso o import é feito
// dinamicamente, só dentro de um useEffect — ou seja, só no browser.
let LottieComp: any = null;
let lottieLoadPromise: Promise<any> | null = null;
function loadLottieComponent() {
  if (LottieComp) return Promise.resolve(LottieComp);
  if (!lottieLoadPromise) {
    lottieLoadPromise = import("lottie-react").then((mod) => {
      LottieComp = mod.default;
      return LottieComp;
    });
  }
  return lottieLoadPromise;
}

// A própria biblioteca "lottie-react" tem um bug interno: quando várias
// animações montam ao mesmo tempo (ex.: a grelha inteira de stickers no
// picker), ocasionalmente tenta ler `.style` dum elemento do contentor
// que ainda não ficou pronto e rebenta com "Cannot read properties of
// null (reading 'style')". Isto acontece dentro do código deles, não dá
// para evitar só com boas práticas no nosso lado — por isso isolamos cada
// sticker lottie no seu próprio error boundary: se um crashar, esse
// sticker fica em branco, mas o resto da página (e os outros stickers)
// continuam normais.
class StickerErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[StickerView] animação lottie falhou, a isolar:", error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** Renderiza um sticker — vídeo (.mp4/.webm) ou animação vetorial (.json) —
 * de forma transparente para quem o usa. Usado em Mensagens e Salas. */
export function StickerView({ url, size = 120, className = "" }: { url: string; size?: number; className?: string }) {
  const isLottie = isLottieSticker(url);
  const [data, setData] = useState<any | null>(isLottie ? lottieCache.get(url) ?? null : null);
  const [Lottie, setLottie] = useState<any>(LottieComp);

  useEffect(() => {
    if (!isLottie) return;
    loadLottieComponent().then(setLottie).catch(() => {});
  }, [isLottie]);

  useEffect(() => {
    if (!isLottie) return;
    if (lottieCache.has(url)) { setData(lottieCache.get(url)); return; }
    let cancelled = false;
    fetch(url).then(r => r.json()).then(json => {
      if (cancelled) return;
      lottieCache.set(url, json);
      setData(json);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [url, isLottie]);

  if (isLottie) {
    const placeholder = <div className={className} style={{ width: size, height: size }} />;
    if (!data || !Lottie) return placeholder;
    return (
      <StickerErrorBoundary key={url} fallback={placeholder}>
        <div className={className} style={{ width: size, height: size }}>
          <Lottie animationData={data} loop autoplay style={{ width: size, height: size }} />
        </div>
      </StickerErrorBoundary>
    );
  }

  return (
    <video src={url} autoPlay loop muted playsInline className={className}
      style={{ width: size, height: size, objectFit: "cover" }} />
  );
}
