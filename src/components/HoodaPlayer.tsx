/**
 * HoodaPlayer — player de vídeo oficial da Hooda.
 * Usado em todo o site em vez do <video> nativo do browser.
 *
 * Comportamento (igual ao X/Instagram/Threads/Facebook):
 *  - Ocupa 100% da largura do post e NUNCA ultrapassa uma altura máxima
 *    (600px em mobile, 700px em desktop) quando aspectRatio="auto".
 *  - Detecta a proporção real do vídeo (16:9, 1:1, 4:5, 9:16, 21:9, ...)
 *    a partir do próprio ficheiro — nunca estica nem deforma.
 *  - object-fit: contain, sempre. Nunca corta o vídeo (nem laterais nem
 *    cima/baixo) — mostra o vídeo inteiro na proporção real dele; se o
 *    cap de altura entrar em ação, aparece barra preta em vez de cortar.
 *  - Reserva o espaço final antes do vídeo carregar (sem CLS): skeleton
 *    escuro com shimmer + miniatura, do tamanho exato do player final.
 *  - Lazy load real via IntersectionObserver: só começa a carregar dados
 *    quando o post está perto/entra na tela; pausa sozinho ao sair.
 *  - Só um vídeo toca de cada vez em toda a app (via mediaManager).
 *
 * Props:
 *   src         — URL do vídeo (mp4, m3u8, cloudinary, etc.)
 *   poster?     — thumbnail
 *   autoPlay?   — tenta reproduzir automaticamente quando visível (default false)
 *   loop?       — default false
 *   className?  — classes extras no wrapper
 *   aspectRatio? — "auto" (default, detecta e limita altura) ou uma proporção
 *                  fixa tipo "9/16" (usada dentro do ShortFrame, que já define
 *                  a altura da moldura — o cap de altura responsiva é ignorado
 *                  nesse caso, pois o wrapper externo já controla o tamanho).
 *   rounded?    — e.g. "rounded-2xl"
 */
import { useRef, useState, useEffect, useCallback, forwardRef } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw } from "lucide-react";
import { useVideoInView } from "@/hooks/useVideoInView";
import { registerVideo, notifyVideoPlaying } from "@/lib/mediaManager";

const BRAND = "#5B3FCF";
const CONTROLS_HIDE_DELAY_MS = 2800;
const CONTROLS_FADE_MS = 200;

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export interface WatermarkConfig {
  enabled: boolean;
  type: string;
  text?: string;
  imageUrl?: string;
  size: string;
  opacity: number;
  position: string;
}

export interface SignatureConfig {
  enabled: boolean;
  style: string;
  position: string;
  channelName: string;
  handle?: string;
}

interface HoodaPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
  aspectRatio?: string;
  rounded?: string;
  watermark?: WatermarkConfig | null;
  signature?: SignatureConfig | null;
}

/** Cap de altura responsiva — tamanho "normal" de feed. Usa min() para
 * nunca deixar o vídeo dominar o ecrã inteiro (nem em mobile, nem em
 * desktop), qualquer que seja a proporção real do vídeo. */
const MAX_HEIGHT_CSS = "min(60vh, 520px)";

export const HoodaPlayer = forwardRef<HTMLVideoElement, HoodaPlayerProps>(function HoodaPlayer(
  {
    src,
    poster,
    autoPlay = false,
    loop = false,
    className = "",
    aspectRatio = "auto",
    rounded = "rounded-2xl",
    watermark,
    signature,
  },
  forwardedRef,
) {
  const mediaIdRef = useRef(`hooda-player-${Math.random().toString(36).slice(2)}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAutoMode = aspectRatio === "auto";
  const { ref: wrapperRef, isInView, hasEnteredOnce } = useVideoInView<HTMLDivElement>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  // Proporção real do vídeo, detectada assim que o metadata carrega.
  // Em modo "auto" é isto que reserva o espaço final (sem CLS).
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);
  const effectiveRatio = isAutoMode ? (naturalRatio ?? "16/9") : aspectRatio;
  // object-fit: SEMPRE "contain". Nunca cortamos o vídeo — nem nas
  // laterais nem em cima/baixo. A caixa reserva o espaço pela proporção
  // real (naturalRatio); se o cap de altura entrar em ação, o vídeo
  // encolhe mantendo a proporção (deixando barra preta se precisar),
  // nunca corta o conteúdo.
  const objectFitClass = "object-contain";

  /* ─── Regista no mediaManager: só um vídeo toca de cada vez ─── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    return registerVideo(mediaIdRef.current, vid);
  }, []);

  /* ─── Lazy load real: só atribui a fonte quando o vídeo se aproxima
     da tela (rootMargin no hook já pré-carrega um pouco antes). Antes
     disso mostramos apenas a miniatura, sem gastar rede. ─── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !src || !hasEnteredOnce) return;

    const isHls = src.includes(".m3u8");
    let hlsInstance: { destroy: () => void } | null = null;

    if (isHls && !vid.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: false });
        hls.loadSource(src);
        hls.attachMedia(vid);
        hlsInstance = hls;
      });
    } else {
      vid.src = src;
    }

    return () => hlsInstance?.destroy();
  }, [src, hasEnteredOnce]);

  useEffect(() => {
    setNaturalRatio(null);
    setMetadataLoaded(false);
    setHasStarted(false);
  }, [src]);

  /* ─── Autoplay respeitoso: só reproduz com o vídeo visível na tela
     e a página em primeiro plano; pausa sozinho ao sair da tela ─── */
  useEffect(() => {
    if (!autoPlay) return;
    const vid = videoRef.current;
    if (!vid || !hasEnteredOnce) return;
    if (isInView) {
      vid.play()?.catch(() => {
        /* gesto do utilizador pode ser necessário */
      });
    } else {
      vid.pause();
    }
  }, [autoPlay, isInView, hasEnteredOnce]);

  // Pausa qualquer vídeo (mesmo iniciado manualmente) ao sair da tela.
  useEffect(() => {
    if (isInView) return;
    const vid = videoRef.current;
    if (vid && !vid.paused) vid.pause();
  }, [isInView]);

  const resetTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [resetTimer]);

  // Fullscreen change listener
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (!hasStarted) setHasStarted(true);
    if (v.paused) {
      notifyVideoPlaying(mediaIdRef.current);
      v.play()?.catch(() => {
        /* autoplay/gesto bloqueado — ignora, utilizador pode tentar de novo */
      });
    } else {
      v.pause();
    }
    resetTimer();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }

  function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v || !isFinite(duration)) return;
    v.currentTime = Number(e.target.value);
    resetTimer();
  }

  function restart() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
    resetTimer();
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const showSkeleton = !metadataLoaded && !hasStarted;
  const preload: "none" | "metadata" = hasEnteredOnce ? "metadata" : "none";

  return (
    <div
      ref={(el) => {
        (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={`w-full flex items-center justify-center overflow-hidden bg-black select-none ${rounded} ${className}`}
      onMouseMove={resetTimer}
      onTouchStart={resetTimer}
      onClick={togglePlay}
    >
      {/* Caixa interna: largura e altura ambas "auto", limitadas por
          max-width (nunca ultrapassa o post) e max-height (nunca fica
          gigante) — ambas encolhem juntas para preservar a proporção
          real do vídeo. Isto é o que impede o vídeo vertical de tomar
          o ecrã inteiro sem cortar nem esticar nada. */}
      <div
        className="relative"
        style={{
          aspectRatio: effectiveRatio,
          width: "100%",
          height: "auto",
          maxWidth: "100%",
          maxHeight: MAX_HEIGHT_CSS,
        }}
      >
      {/* Video element — object-fit: contain, sempre. */}
      <video
        ref={(el) => {
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
          if (typeof forwardedRef === "function") forwardedRef(el);
          else if (forwardedRef)
            (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        }}
        poster={poster}
        playsInline
        loop={loop}
        preload={preload}
        className={`absolute inset-0 w-full h-full ${objectFitClass}`}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          setHasStarted(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (v && v.videoWidth && v.videoHeight)
            setNaturalRatio(`${v.videoWidth}/${v.videoHeight}`);
          setMetadataLoaded(true);
        }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (v) {
            setCurrentTime(v.currentTime);
            setDuration(v.duration || 0);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Placeholder inteligente: miniatura + skeleton com shimmer, do
          tamanho exato do player final — nada "salta" quando o vídeo
          termina de carregar. */}
      {showSkeleton && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {poster && (
            <img
              src={poster}
              alt=""
              decoding="async"
              className={`absolute inset-0 w-full h-full ${objectFitClass} transition-[filter] duration-300`}
              style={{ filter: "blur(6px)", transform: "scale(1.02)" }}
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 skeleton-shimmer" />
        </div>
      )}

      {/* Poster nítido + botão de play, antes de o utilizador iniciar */}
      {!hasStarted && metadataLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center hooda-fade-in"
          style={{ background: "rgba(0,0,0,0.35)" }}
        >
          {poster && (
            <img
              src={poster}
              alt=""
              decoding="async"
              className={`absolute inset-0 w-full h-full ${objectFitClass}`}
            />
          )}
          <div
            className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: "rgba(255,255,255,0.92)" }}
          >
            <Play className="w-7 h-7 ml-1" style={{ color: BRAND }} />
          </div>
        </div>
      )}

      {/* Buffer spinner */}
      {isBuffering && hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      {/* Watermark Overlay */}
      {watermark?.enabled && (
        <div
          className={`absolute pointer-events-none z-10 p-4 transition-opacity duration-300 ${
            watermark.position === "top-left"
              ? "top-0 left-0"
              : watermark.position === "top-right"
                ? "top-0 right-0"
                : watermark.position === "bottom-left"
                  ? "bottom-16 left-0"
                  : watermark.position === "center"
                    ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "bottom-16 right-0"
          } ${
            watermark.size === "small"
              ? "scale-75 origin-center"
              : watermark.size === "large"
                ? "scale-125 origin-center"
                : ""
          }`}
          style={{ opacity: watermark.opacity / 100 }}
        >
          {watermark.type === "image" && watermark.imageUrl ? (
            <img src={watermark.imageUrl} alt="Watermark" className="max-h-12 object-contain" />
          ) : (
            <span className="text-white font-bold text-lg drop-shadow-md select-none">
              {watermark.text}
            </span>
          )}
        </div>
      )}

      {/* Signature Overlay */}
      {signature?.enabled && (
        <div
          className={`absolute pointer-events-none z-10 p-4 transition-opacity duration-300 flex items-center gap-2 ${
            signature.position === "top-left"
              ? "top-0 left-0"
              : signature.position === "bottom-right"
                ? "bottom-16 right-0"
                : "bottom-16 left-0"
          } ${
            signature.style === "small"
              ? "scale-75 origin-left opacity-70"
              : signature.style === "large"
                ? "scale-125 origin-left font-extrabold"
                : "font-bold"
          }`}
        >
          <span className="text-white drop-shadow-md select-none tracking-tight">
            {signature.channelName}{" "}
            {signature.handle && <span className="opacity-80">@{signature.handle}</span>}
          </span>
        </div>
      )}

      {/* Controls overlay — aparece ao tocar/passar o rato, some sozinho */}
      <div
        className="absolute inset-0 flex flex-col justify-end pointer-events-none"
        style={{
          opacity: showControls || !isPlaying ? 1 : 0,
          transform: showControls || !isPlaying ? "scale(1)" : "scale(0.995)",
          transition: `opacity ${CONTROLS_FADE_MS}ms ease-out, transform ${CONTROLS_FADE_MS}ms ease-out`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bottom pill — pequena, arredondada, estilo X */}
        <div className="relative z-10 px-2.5 pb-2.5 pointer-events-auto">
          <div
            className="flex items-center gap-2 rounded-full px-2.5 py-1.5"
            style={{ background: "rgba(0,0,0,0.65)" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                duration > 0 && duration - currentTime < 2 ? restart() : togglePlay();
              }}
              className="w-[22px] h-[22px] shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15"
            >
              {duration > 0 && duration - currentTime < 2 ? (
                <RotateCcw className="w-3 h-3 text-white" />
              ) : isPlaying ? (
                <Pause className="w-3 h-3 text-white" />
              ) : (
                <Play className="w-3 h-3 text-white ml-0.5" />
              )}
            </button>

            <div className="flex-1 relative h-[3px] group/seek" style={{ cursor: "pointer" }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "rgba(255,255,255,0.3)" }}
              />
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: "#fff" }}
              />
              <div
                className="absolute top-1/2 rounded-full transition-all"
                style={{
                  left: `${progress}%`,
                  width: 9,
                  height: 9,
                  transform: "translate(-50%, -50%)",
                  background: "#fff",
                }}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={seek}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                style={{ height: "100%" }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <span className="text-white text-[10px] font-mono tabular-nums shrink-0 select-none">
              {fmtTime(currentTime)}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className="w-[22px] h-[22px] shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15"
            >
              {isMuted ? (
                <VolumeX className="w-3 h-3 text-white" />
              ) : (
                <Volume2 className="w-3 h-3 text-white" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="w-[22px] h-[22px] shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15"
            >
              {isFullscreen ? (
                <Minimize className="w-3 h-3 text-white" />
              ) : (
                <Maximize className="w-3 h-3 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
});
