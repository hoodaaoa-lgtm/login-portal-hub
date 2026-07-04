/**
 * FeedVideoPlayer — player unificado para o feed (Home, Perfil, Drops, Canal).
 *
 * Todos os vídeos (verticais ou horizontais) usam o mesmo cartão largo,
 * do tamanho do post, com altura máxima responsiva (ver HoodaPlayer.tsx).
 * O vídeo nunca é cortado nem esticado: quando é vertical, aparece
 * "dentro da moldura" com barras pretas nas laterais (igual ao
 * X/Twitter/Threads) em vez de virar um cartão quadrado ou distorcido.
 */
import { useRef } from "react";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { usePostVideoView } from "@/hooks/usePostVideoView";

interface Props {
  src: string;
  poster?: string;
  postId?: string;
  kind?: string;
  isShortHint?: boolean | null;
  rounded?: string;
}

export function FeedVideoPlayer({ src, poster, postId, kind, rounded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  usePostVideoView(postId, kind, videoRef);

  return (
    <HoodaPlayer
      ref={videoRef}
      src={src}
      poster={poster}
      aspectRatio="auto"
      rounded={rounded ?? "rounded-none"}
    />
  );
}
