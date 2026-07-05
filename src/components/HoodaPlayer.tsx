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

/** Limite de altura estilo X: o vídeo ocupa sempre a largura total do
 * post; a altura segue a proporção real dele (horizontal ou vertical),
 * só ficando presa aqui se for um caso extremo — igual ao feed do X.
 * No telemóvel o ecrã é mais alto e estreito, por isso deixamos o vídeo
 * (sobretudo os verticais) ocupar bem mais altura, tal como no
 * X/Instagram mobile; no desktop o limite é mais conservador para não
 * dominar o ecrã largo. */
const MOBILE_BREAKPOINT_PX = 768;

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
  // Proporção real do vídeo, detectada assim que o metadata carrega —
  // usada SEMPRE (horizontal ou vertical), igual ao X: a caixa segue o
  // vídeo, nunca o contrário. Antes do metadata carregar, usa a
  // proporção sugerida por quem chamou (aspectRatio) como palpite inicial
  // para minimizar qualquer salto de layout.
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);
  const effectiveRatio = naturalRatio ?? (aspectRatio !== "auto" ? aspectRatio : "16/9");

  // ─── Largura real da caixa, igual ao X: quando o vídeo é vertical e a
  // altura bateria no limite (MAX_HEIGHT_CSS), a CAIXA ENCOLHE EM LARGURA
  // para manter a proporção exata (sem barra preta lateral) — em vez de
  // ficar esticada a 100% da largura do post com letterbox. Vídeos
  // horizontais continuam a 100% da largura, como antes. ───
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== "undefined" ? (window.visualViewport?.height || window.innerHeight) : 800,
  );
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT_PX : false,
  );
  // Feedback de toque no mobile: ícone central que aparece e desaparece
  // sozinho a cada tap, em vez de abrir logo a barra de controlos toda
  // (replay, som, ecrã inteiro) — sensação mais limpa, igual ao
  // Instagram/TikTok. `key` força o React a reiniciar a animação CSS
  // mesmo que o utilizador toque repetidamente antes dela terminar.
  const [tapPulse, setTapPulse] = useState<{ icon: "play" | "pause"; key: number } | null>(null);
  const tapPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── IMPORTANTE: medimos a largura do elemento PAI, nunca a do próprio
  // wrapper. Quando o vídeo é vertical e a caixa encolhe (isHeightConstrained),
  // o wrapper passa a ter uma largura menor que a do post — se observássemos
  // o próprio wrapper, essa mudança seria detetada pelo ResizeObserver,
  // recalculando tudo com base na largura já encolhida, o que por sua vez
  // podia "desconstranger" o vídeo, esticando-o de novo — um ciclo sem fim
  // que fazia o player oscilar de tamanho (esticar/encolher repetidamente).
  // O pai mantém sempre a largura real disponível do post, por isso é
  // seguro e estável observar a partir dele.
  useEffect(() => {
    const el = wrapperRef.current;
    const parent = el?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const update = () => setContainerWidth(parent.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const getHeight = () =>
      (typeof window !== "undefined" && window.visualViewport?.height) || window.innerHeight;
    const onResize = () => {
      setViewportHeight(getHeight());
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  const ratioNum = (() => {
    const [w, h] = effectiveRatio.split("/").map(Number);
    return w > 0 && h > 0 ? w / h : 16 / 9;
  })();
  // No telemóvel deixamos o vídeo usar quase todo o ecrã (até 92%, teto
  // de 900px) — é isto que faz vídeos verticais (Stories/Reels) parecerem
  // grandes e imersivos em vez de "encolhidos", igual ao Instagram/TikTok.
  // No desktop mantém-se mais contido (75%, teto de 650px) para não
  // dominar um ecrã largo.
  const maxHeightPx = isMobile
    ? Math.min(viewportHeight * 0.92, 900)
    : Math.min(viewportHeight * 0.75, 650);
  const heightAtFullWidth = containerWidth ? containerWidth / ratioNum : null;
  const isHeightConstrained = !!heightAtFullWidth && heightAtFullWidth > maxHeightPx;
  const boxWidthPx = isHeightConstrained ? maxHeightPx * ratioNum : null;

  // object-fit: SEMPRE "contain". Nunca cortamos nem deformamos o vídeo —
  // a caixa segue a proporção real dele (naturalRatio para vídeos normais,
  // 9/16 fixo para shorts) até ao limite de altura (MAX_HEIGHT_CSS); se
  // esse limite entrar em ação, a caixa encolhe em largura (isHeightConstrained)
  // para não sobrar barra preta lateral.
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

  useEffect(() => {
    return () => {
      if (tapPulseTimer.current) clearTimeout(tapPulseTimer.current);
    };
  }, []);

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
    const willPlay = v.paused;
    if (willPlay) {
      notifyVideoPlaying(mediaIdRef.current);
      v.play()?.catch(() => {
        /* autoplay/gesto bloqueado — ignora, utilizador pode tentar de novo */
      });
    } else {
      v.pause();
    }
    if (isMobile) {
      // Pequeno ícone central a aparecer/desaparecer, só como feedback
      // visual de que o botão de play/pause foi mesmo premido.
      setTapPulse({ icon: willPlay ? "play" : "pause", key: Date.now() });
      if (tapPulseTimer.current) clearTimeout(tapPulseTimer.current);
      tapPulseTimer.current = setTimeout(() => setTapPulse(null), 550);
    }
    resetTimer();
  }

  // No mobile, tocar no ECRÃ do vídeo (fora dos botões) NUNCA pausa —
  // só mostra/renova a barra de controlos, igual à maioria dos players
  // de vídeo. Só o botão de play/pause (na barra ou o botão central
  // inicial) é que efetivamente pausa/reproduz. No desktop mantém-se o
  // comportamento clássico: clicar no vídeo alterna play/pause.
  function handleScreenTap() {
    if (isMobile) {
      resetTimer();
      return;
    }
    togglePlay();
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
      className={`overflow-hidden bg-black select-none ${rounded} ${className} ${isHeightConstrained ? "mx-auto" : "w-full"}`}
      style={isHeightConstrained ? { width: `${boxWidthPx}px`, maxWidth: "100%" } : undefined}
      onMouseMove={() => {
        if (!isMobile) resetTimer();
      }}
      onTouchStart={() => {
        if (!isMobile) resetTimer();
      }}
      onClick={handleScreenTap}
    >
      {/* Caixa interna: largura 100% da caixa externa. Quando o vídeo
          é vertical e bateria no limite de altura, a caixa externa já
          encolheu em largura (isHeightConstrained) para bater exatamente
          com a proporção real do vídeo — sem barra preta lateral, igual
          ao X. Caso contrário, comporta-se como antes: largura total do
          post, altura pela proporção real, presa por MAX_HEIGHT_CSS. */}
      <div
        className="relative w-full"
        style={
          isHeightConstrained
            ? { height: `${maxHeightPx}px`, overflow: "hidden" }
            : { aspectRatio: effectiveRatio, maxHeight: `${maxHeightPx}px`, overflow: "hidden" }
        }
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label="Reproduzir"
            className={`relative z-10 rounded-full flex items-center justify-center shadow-2xl ${isMobile ? "w-20 h-20" : "w-16 h-16"}`}
            style={{ background: "rgba(255,255,255,0.92)" }}
          >
            <Play className={isMobile ? "w-9 h-9 ml-1" : "w-7 h-7 ml-1"} style={{ color: BRAND }} />
          </button>
        </div>
      )}

      {/* Buffer spinner */}
      {isBuffering && hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      {/* Feedback central de play/pause (mobile) — aparece e desaparece
          sozinho a confirmar a ação do botão, sem interferir no toque
          no ecrã (que só abre a barra de controlos). */}
      {tapPulse && (
        <div
          key={tapPulse.key}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="hooda-tap-pulse w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            {tapPulse.icon === "play" ? (
              <Play className="w-7 h-7 text-white ml-1" />
            ) : (
              <Pause className="w-7 h-7 text-white" />
            )}
          </div>
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
        {/* Bottom pill — pequena, arredondada, estilo X. No mobile os
            alvos de toque crescem (botões, bolinha do seek, texto) para
            serem confortáveis com o dedo; no desktop mantém-se compacto
            porque o rato é mais preciso. */}
        <div className={`relative z-10 pointer-events-auto ${isMobile ? "px-3 pb-3" : "px-2.5 pb-2.5"}`}>
          <div
            className={`flex items-center rounded-full ${isMobile ? "gap-3 px-3.5 py-2.5" : "gap-2 px-2.5 py-1.5"}`}
            style={{ background: "rgba(0,0,0,0.65)" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                duration > 0 && duration - currentTime < 2 ? restart() : togglePlay();
              }}
              className={`shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15 ${isMobile ? "w-9 h-9" : "w-[22px] h-[22px]"}`}
            >
              {duration > 0 && duration - currentTime < 2 ? (
                <RotateCcw className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              ) : isPlaying ? (
                <Pause className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              ) : (
                <Play className={isMobile ? "w-[18px] h-[18px] text-white ml-0.5" : "w-3 h-3 text-white ml-0.5"} />
              )}
            </button>

            <div
              className={`flex-1 relative group/seek flex items-center ${isMobile ? "h-6" : "h-[3px]"}`}
              style={{ cursor: "pointer" }}
            >
              <div
                className={`absolute left-0 right-0 rounded-full ${isMobile ? "h-[4px]" : "inset-0"}`}
                style={{ background: "rgba(255,255,255,0.3)" }}
              />
              <div
                className={`absolute left-0 rounded-full transition-all ${isMobile ? "h-[4px]" : "top-0 h-full"}`}
                style={{ width: `${progress}%`, background: "#fff" }}
              />
              <div
                className="absolute top-1/2 rounded-full transition-all"
                style={{
                  left: `${progress}%`,
                  width: isMobile ? 13 : 9,
                  height: isMobile ? 13 : 9,
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

            <span
              className={`text-white font-mono tabular-nums shrink-0 select-none ${isMobile ? "text-[12px]" : "text-[10px]"}`}
            >
              {fmtTime(currentTime)}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className={`shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15 ${isMobile ? "w-9 h-9" : "w-[22px] h-[22px]"}`}
            >
              {isMuted ? (
                <VolumeX className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              ) : (
                <Volume2 className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className={`shrink-0 flex items-center justify-center rounded-full transition hover:bg-white/15 ${isMobile ? "w-9 h-9" : "w-[22px] h-[22px]"}`}
            >
              {isFullscreen ? (
                <Minimize className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              ) : (
                <Maximize className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
              )}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
});
