/**
 * FeedVideoPlayer — player unificado para o feed (Home, Perfil, Explorador/Canal).
 * Usa o HoodaPlayer (controles tipo YouTube: progresso, tempo, mudo, tela cheia)
 * e, quando o vídeo é vertical (short), aplica a moldura estilo anúncio (ShortFrame).
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
    if (kind === "clip") { setIsShort(false); return; }
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
    return () => { cancelled = true; probe.src = ""; };
  }, [src, isShortHint, kind]);

  if (isShort === null) {
    return (
      <div className="w-full flex items-center justify-center bg-black" style={{ aspectRatio: "16/9" }}>
        <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  const player = (
    <HoodaPlayer
      ref={videoRef}
      src={src}
      poster={poster}
      aspectRatio={isShort ? "9/16" : "16/9"}
      rounded={isShort ? "rounded-2xl" : (rounded ?? "rounded-none")}
      className={isShort ? "w-full h-full" : ""}
    />
  );

  return isShort ? <ShortFrame>{player}</ShortFrame> : player;
}
