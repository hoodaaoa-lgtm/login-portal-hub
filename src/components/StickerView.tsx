import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { isLottieSticker } from "@/lib/stickers";

const lottieCache = new Map<string, any>();

/** Renderiza um sticker — vídeo (.mp4/.webm) ou animação vetorial (.json) —
 * de forma transparente para quem o usa. Usado em Mensagens e Salas. */
export function StickerView({ url, size = 120, className = "" }: { url: string; size?: number; className?: string }) {
  const isLottie = isLottieSticker(url);
  const [data, setData] = useState<any | null>(isLottie ? lottieCache.get(url) ?? null : null);

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
    if (!data) return <div className={className} style={{ width: size, height: size }} />;
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
