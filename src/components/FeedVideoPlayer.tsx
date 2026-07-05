/**
 * FeedVideoPlayer — player unificado para o feed (Home, Perfil, Explorador/Canal).
 *
 * É apenas uma casca fina em volta do HoodaPlayer. Toda a lógica de
 * proporção (vertical/horizontal, encolher a largura quando o vídeo é
 * vertical, altura máxima, etc.) vive no HoodaPlayer, que lê a proporção
 * REAL do próprio <video> assim que o metadata carrega — sem probes
 * paralelas nem suposições.
 *
 * NOTA HISTÓRICA: esta versão anterior fazia um "probe" — criava um
 * <video> escondido só para adivinhar a orientação antes de decidir o
 * layout. Esse probe podia nunca disparar `onloadedmetadata` (CORS,
 * CDN sem suporte a range requests, etc.), deixando o vídeo preso para
 * sempre no skeleton 4/5 (por isso aparecia "grande e quadrado" e nunca
 * tocava). Removido — o HoodaPlayer já resolve tudo sozinho, igual ao
 * X: vídeo horizontal fica largo e baixo, vídeo vertical encolhe em
 * largura (sem esticar, sem barra preta).
 */
import { useRef } from "react";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { usePostVideoView } from "@/hooks/usePostVideoView";

interface Props {
  src: string;
  poster?: string;
  postId?: string;
  kind?: string;
  /** @deprecated não é mais necessário — o HoodaPlayer detecta a proporção real sozinho. Mantido só para não quebrar chamadas antigas. */
  isShortHint?: boolean | null;
  rounded?: string;
  /** Toca sozinho (sem som) quando o vídeo entra na tela, pausa ao sair — igual ao Instagram/TikTok. Default: true. */
  autoPlay?: boolean;
}

export function FeedVideoPlayer({ src, poster, postId, kind, rounded, autoPlay = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  usePostVideoView(postId, kind, videoRef);

  return (
    <HoodaPlayer
      ref={videoRef}
      src={src}
      poster={poster}
      aspectRatio="auto"
      rounded={rounded ?? "rounded-none"}
      autoPlay={autoPlay}
    />
  );
}
