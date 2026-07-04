/**
 * FeedVideoPlayer — player unificado para o feed (Home, Perfil, Explorador/Canal).
 *
 * Usa o HoodaPlayer (skeleton/shimmer, lazy load, altura máxima responsiva,
 * proporção automática sem distorção — ver HoodaPlayer.tsx para os detalhes)
 * e, quando o vídeo é vertical (short), aplica a moldura estilo anúncio
 * (ShortFrame), igual ao tratamento de vídeos verticais do X/Instagram.
 *
 * A única responsabilidade deste componente é decidir "é um short ou não":
 *  - kind="clip" nunca é short (players de clip usam o layout normal).
 *  - isShortHint, quando fornecido pelo post (ideal — evita qualquer probe),
 *    é usado diretamente.
 *  - Caso contrário, faz um probe leve (preload="metadata") só para saber a
 *    orientação antes de decidir o layout — o HoodaPlayer, por si, já lida
 *    com a proporção exata e o lazy load real do vídeo em si.
 */
import { useEffect, useRef, useState } from "react";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { ShortFrame } from "@/components/ShortFrame";
import { usePostVideoView } from "@/hooks/usePostVideoView";

interface Props {
  src: string;
  poster?: string;
  postId?: string;
  kind?: string;
  isShortHint?: boolean | null;
  rounded?: string;
}

export function FeedVideoPlayer({ src, poster, postId, kind, isShortHint, rounded }: Props) {
  const [isShort, setIsShort] = useState<boolean | null>(isShortHint ?? null);
  const videoRef = useRef<HTMLVideoElement>(null);

  usePostVideoView(postId, kind, videoRef);

  useEffect(() => {
    if (kind === "clip") {
      setIsShort(false);
      return;
    }
    if (isShortHint !== undefined && isShortHint !== null) {
      setIsShort(isShortHint);
      return;
    }
    if (!src) return;
    let cancelled = false;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = src;
    probe.onloadedmetadata = () => {
      if (!cancelled) setIsShort(probe.videoHeight > probe.videoWidth);
    };
    return () => {
      cancelled = true;
      probe.src = "";
    };
  }, [src, isShortHint, kind]);

  if (isShort === null) {
    // Ainda a decidir short vs normal (probe rápido de metadata). Usa uma
    // proporção neutra (4/5) para minimizar qualquer salto de layout —
    // e já mostra a miniatura + shimmer, igual ao estado de loading final
    // do HoodaPlayer, para a transição ser imperceptível.
    return (
      <div
        className={`relative w-full overflow-hidden bg-black ${rounded ?? "rounded-none"}`}
        style={{ aspectRatio: "4/5" }}
      >
        {poster && (
          <img
            src={poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(6px)" }}
          />
        )}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 skeleton-shimmer" />
      </div>
    );
  }

  // Vídeos verticais (shorts) mantêm a moldura 9/16 estilo anúncio.
  // Vídeos normais usam "auto": o HoodaPlayer ajusta-se ao tamanho real
  // do vídeo, sem barras pretas em cima/baixo (igual ao X/Twitter).
  const player = (
    <HoodaPlayer
      ref={videoRef}
      src={src}
      poster={poster}
      aspectRatio={isShort ? "9/16" : "auto"}
      rounded={isShort ? "rounded-2xl" : (rounded ?? "rounded-none")}
      className={isShort ? "w-full h-full" : ""}
    />
  );

  return isShort ? <ShortFrame>{player}</ShortFrame> : player;
}
