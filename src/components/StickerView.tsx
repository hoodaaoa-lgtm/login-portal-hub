import { useEffect, useState } from "react";
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
    if (!data || !Lottie) return <div className={className} style={{ width: size, height: size }} />;
    return (
      <div className={className} style={{ width: size, height: size }}>
        <Lottie animationData={data} loop autoplay style={{ width: size, height: size }} />
      </div>
    );
  }

  return (
    <video src={url} autoPlay loop muted playsInline className={className}
      style={{ width: size, height: size, objectFit: "cover" }} />
  );
}
