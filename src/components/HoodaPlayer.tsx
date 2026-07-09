/**
 * HoodaPlayer — player de vídeo oficial da Hooda.
 * Usado em todo o site em vez do <video> nativo do browser.
 *
 * Comportamento (igual ao X/Instagram/Threads/Facebook):
 *  - Ocupa 100% da largura do post e NUNCA ultrapassa uma altura máxima
 *    (600px em mobile, 700px em desktop) quando aspectRatio="auto".
 *  - Detecta a proporção real do vídeo (16:9, 1:1, 4:5, 9:16, 21:9, ...)
 *    a partir do próprio ficheiro — nunca estica nem deforma.
 *  - object-fit: contain, sempre, no VÍDEO em reprodução. Nunca corta o
 *    vídeo (nem laterais nem cima/baixo) — mostra o vídeo inteiro na
 *    proporção real dele; se o cap de altura entrar em ação, aparece barra
 *    preta em vez de cortar. A MINIATURA (antes de dar play) usa
 *    object-fit: cover, para preencher a largura toda sem barras pretas,
 *    igual ao TikTok/Instagram — só o vídeo em si preserva a proporção.
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
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, Settings, ChevronRight, ChevronLeft } from "lucide-react";
import { useVideoInView } from "@/hooks/useVideoInView";
import { registerVideo, notifyVideoPlaying, getGlobalMuted, setGlobalMuted } from "@/lib/mediaManager";
import { getCloudinaryRenditions, getCloudinaryRawUrl } from "@/lib/cloudinary";
import { getCachedVideoPreference, useVideoPreferences } from "@/hooks/useVideoPreferences";
import {
  pickStartingHeight,
  resolutionFromHeight,
  labelWithSuffix,
  recordQualityChoice,
  type ResolutionLabel,
} from "@/lib/videoQuality";

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
  font?: string;
}

/** Mapa de fontes disponíveis para a assinatura — todas fontes de sistema,
 * sem depender de carregar webfonts externas (evita erros/flash de fonte). */
export const SIGNATURE_FONTS: Record<string, string> = {
  padrao: "inherit",
  serifada: "Georgia, 'Times New Roman', serif",
  moderna: "'Trebuchet MS', 'Segoe UI', sans-serif",
  manuscrita: "'Brush Script MT', 'Segoe Script', cursive",
  condensada: "'Arial Narrow', 'Helvetica Condensed', sans-serif",
  maquina: "'Courier New', Courier, monospace",
};

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
  /** Força o carregamento e reprodução imediatos sem esperar pelo IntersectionObserver.
   *  Usar dentro de modais/lightboxes onde o elemento está num portal (fixed) e o
   *  observer pode nunca disparar com threshold suficiente. */
  forceLoad?: boolean;
  /** Fração do viewport usada como altura máxima (mobile: default 0.80,
   *  desktop: default 0.75). Usar um valor menor (ex.: 0.40) dentro de
   *  espaços mais pequenos, como o painel de vídeo do modal de
   *  comentários — sem isto, o vídeo pedia até 80% da altura do ecrã e
   *  ficava maior do que o espaço disponível, e se o contentor à volta
   *  cortasse esse excesso com overflow:hidden, cortava exatamente a
   *  parte onde o vídeo (centrado) estava, deixando só o fundo escuro
   *  desfocado visível — "vídeo tapado pelo preto". */
  maxHeightRatio?: number;
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
    forceLoad = false,
    maxHeightRatio,
  },
  forwardedRef,
) {
  const mediaIdRef = useRef(`hooda-player-${Math.random().toString(36).slice(2)}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { ref: wrapperRef, isInView: _isInView, hasEnteredOnce: _hasEnteredOnce } = useVideoInView<HTMLDivElement>();
  // forceLoad=true: ignora o IntersectionObserver — carrega e toca imediatamente.
  // Necessário dentro de modais (portal fixed) onde o observer pode nunca disparar.
  const isInView = forceLoad ? true : _isInView;
  const hasEnteredOnce = forceLoad ? true : _hasEnteredOnce;

  const [isPlaying, setIsPlaying] = useState(false);
  // Nasce com o som que estiver ativo globalmente (Instagram-style): se o
  // utilizador já tinha ativado o som noutro vídeo, este já entra com som.
  const [isMuted, setIsMuted] = useState(() => getGlobalMuted());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  // Se o vídeo falhar a carregar (URL quebrada, CORS, formato não suportado)
  // ou simplesmente nunca disparar loadedmetadata, antes ficava preso para
  // sempre no skeleton escuro — parecia que "o vídeo não aparece", sem
  // nenhuma pista do que se passou. Agora mostramos um estado de erro
  // visível, com botão de tentar de novo.
  const [loadError, setLoadError] = useState(false);
  // Proporção real do vídeo, detectada assim que o metadata carrega —
  // usada SEMPRE (horizontal ou vertical), igual ao X: a caixa segue o
  // vídeo, nunca o contrário. Antes do metadata carregar, usa a
  // proporção sugerida por quem chamou (aspectRatio) como palpite inicial
  // para minimizar qualquer salto de layout.
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);
  const effectiveRatio = naturalRatio ?? (aspectRatio !== "auto" ? aspectRatio : "16/9");

  // ─── Pré-carrega o poster (chega muito mais rápido que o vídeo) só
  // para ler as dimensões dele e adivinhar a proporção real ANTES do
  // vídeo disparar onLoadedMetadata. Sem isto, um vídeo vertical nascia
  // numa caixa 16:9 (o palpite acima) e "saltava" de repente para a
  // proporção certa quando o metadata chegava — feio, principalmente no
  // chat, onde vários vídeos pequenos saltam de tamanho enquanto a
  // pessoa faz scroll. Se o metadata do vídeo já tiver chegado primeiro,
  // isto não faz nada (naturalRatio já não é null).
  useEffect(() => {
    if (!poster || naturalRatio) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalRatio((prev) => prev ?? `${img.naturalWidth}/${img.naturalHeight}`);
      }
    };
    img.src = poster;
    return () => {
      cancelled = true;
    };
  }, [poster, naturalRatio]);

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
    ? Math.min(viewportHeight * (maxHeightRatio ?? 0.80), maxHeightRatio ? viewportHeight * maxHeightRatio : 900)
    : Math.min(viewportHeight * (maxHeightRatio ?? 0.75), maxHeightRatio ? viewportHeight * maxHeightRatio : 650);
  // No telemóvel, vídeos HORIZONTAIS ficam um pouco mais altos do que a
  // proporção real deles indicaria (menos "achatados"), aproximando-se
  // do estilo Instagram/TikTok — a CAIXA usa uma proporção ligeiramente
  // mais alta, mas o <video> continua com object-fit: contain lá dentro
  // (nunca estica), e o espaço extra que sobra em cima/baixo é
  // preenchido pelo fundo desfocado (poster blur), tal como já acontece
  // com os vídeos verticais. Verticais e desktop não são afetados.
  const MOBILE_HORIZONTAL_HEIGHT_BOOST = 0.85;
  const isHorizontal = ratioNum >= 1;
  const displayRatioNum =
    isMobile && isHorizontal ? ratioNum * MOBILE_HORIZONTAL_HEIGHT_BOOST : ratioNum;
  const displayRatio = `${displayRatioNum}/1`;

  const heightAtFullWidth = containerWidth ? containerWidth / displayRatioNum : null;
  const isHeightConstrained = !!heightAtFullWidth && heightAtFullWidth > maxHeightPx;

  // object-fit: SEMPRE "contain". Nunca cortamos nem deformamos o vídeo —
  // a caixa segue a proporção real dele (naturalRatio para vídeos normais,
  // 9/16 fixo para shorts) até ao limite de altura (MAX_HEIGHT_CSS); se
  // esse limite entrar em ação, a caixa encolhe em largura (isHeightConstrained)
  // para não sobrar barra preta lateral.
  const objectFitClass = "object-contain";

  // Cantos arredondados iguais no mobile e no desktop — usa sempre o
  // valor pedido por quem chamou o player (antes o mobile forçava
  // "rounded-none" para ficar de ponta a ponta, estilo Facebook).
  const effectiveRounded = rounded;




  /* ─── Regista no mediaManager: só um vídeo toca de cada vez ─── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    return registerVideo(mediaIdRef.current, vid);
  }, []);

  /* ─── Sistema de qualidade adaptativa (auto quality) ───
     A Hooda serve vídeos via Cloudflare Stream, que já gera várias
     resoluções e expõe um manifesto HLS. O hls.js já sabe subir/descer
     de qualidade sozinho consoante buffer e largura de banda (ABR
     nativo) — aqui só decidimos o PONTO DE PARTIDA e os limites,
     consoante a preferência global do utilizador (video_preferences),
     e expomos os níveis disponíveis para o seletor manual de qualidade. */
  const { preference, setPreference } = useVideoPreferences();
  const hlsRef = useRef<any>(null);
  // Quando o vídeo não tem HLS real (ex.: Cloudinary), guardamos aqui a
  // lista de URLs mp4 em várias resoluções, e trocamos de fonte nós
  // mesmos preservando o tempo actual (sem "reiniciar" o vídeo).
  const mp4RenditionsRef = useRef<{ height: number; url: string }[] | null>(null);
  const stallCountRef = useRef(0);
  // Cadeia de fallback quando uma resolução da Cloudinary falha (ex.: 400
  // por o vídeo original ultrapassar o limite de transformação síncrona
  // do plano actual): 0 = a tocar a rendition escolhida (ou o src normal,
  // se não houver ladder), 1 = já caiu para a URL "oficial" sem crop de
  // resolução, 2 = já caiu para a entrega bruta sem transformação nenhuma
  // (último recurso — só falha se nem isto carregar).
  const fallbackStageRef = useRef<0 | 1 | 2>(0);
  const [qualityLevels, setQualityLevels] = useState<{ index: number; height: number }[]>([]);
  const [activeLevel, setActiveLevel] = useState<number>(-1); // -1 = automático
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [settingsView, setSettingsView] = useState<"root" | "quality">("root");
  const [currentResLabel, setCurrentResLabel] = useState<ResolutionLabel | null>(null);

  const switchMp4Rendition = useCallback((idx: number, persistMode: "auto" | ResolutionLabel | null) => {
    const vid = videoRef.current;
    const renditions = mp4RenditionsRef.current;
    if (!vid || !renditions || !renditions[idx]) return;
    const wasPlaying = !vid.paused;
    const t = vid.currentTime;
    vid.src = renditions[idx].url;
    vid.currentTime = t;
    if (wasPlaying) vid.play().catch(() => {});
    setActiveLevel(idx);
    setCurrentResLabel(resolutionFromHeight(renditions[idx].height));
    recordQualityChoice(renditions[idx].height);
    if (persistMode) setPreference(persistMode === "auto" ? "auto" : "manual", persistMode === "auto" ? null : persistMode);
  }, [setPreference]);

  const applyQualityMode = useCallback(
    (mode: "auto" | ResolutionLabel, persist: boolean) => {
      const hls = hlsRef.current;
      const renditions = mp4RenditionsRef.current;

      // ─ Fonte HLS real (Cloudflare Stream): usa o ABR nativo do hls.js ─
      if (hls) {
        if (mode === "auto") {
          hls.currentLevel = -1;
          setActiveLevel(-1);
          if (persist) setPreference("auto");
          return;
        }
        const targetHeight = { "144p":144,"240p":240,"360p":360,"480p":480,"720p":720,"1080p":1080,"1440p":1440,"4k":2160 }[mode];
        const levels: { height: number }[] = hls.levels ?? [];
        let bestIdx = 0;
        let bestDiff = Infinity;
        levels.forEach((l, i) => {
          const diff = Math.abs(l.height - targetHeight);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        });
        hls.currentLevel = bestIdx;
        setActiveLevel(bestIdx);
        recordQualityChoice(levels[bestIdx]?.height ?? targetHeight);
        if (persist) setPreference("manual", mode);
        return;
      }

      // ─ Fonte mp4 (Cloudinary): trocamos nós mesmos a fonte ─
      if (renditions) {
        if (mode === "auto") {
          const pref = getCachedVideoPreference();
          const screenH = typeof window !== "undefined" ? window.innerHeight : 720;
          const targetHeight = pickStartingHeight(pref, screenH);
          let bestIdx = 0, bestDiff = Infinity;
          renditions.forEach((r, i) => {
            const diff = Math.abs(r.height - targetHeight);
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
          });
          switchMp4Rendition(bestIdx, persist ? "auto" : null);
          return;
        }
        const targetHeight = { "144p":144,"240p":240,"360p":360,"480p":480,"720p":720,"1080p":1080,"1440p":1440,"4k":2160 }[mode];
        let bestIdx = 0, bestDiff = Infinity;
        renditions.forEach((r, i) => {
          const diff = Math.abs(r.height - targetHeight);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        });
        switchMp4Rendition(bestIdx, persist ? mode : null);
      }
    },
    [setPreference, switchMp4Rendition],
  );

  /* ─── Lazy load real: só atribui a fonte quando o vídeo se aproxima
     da tela (rootMargin no hook já pré-carrega um pouco antes). Antes
     disso mostramos apenas a miniatura, sem gastar rede. ─── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !src || !hasEnteredOnce) return;

    const nativeHls = src.includes(".m3u8");
    let hlsInstance: any = null;
    mp4RenditionsRef.current = null;
    stallCountRef.current = 0;

    if (nativeHls && !vid.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) { vid.src = src; return; }
        const hls = new Hls({ enableWorker: false, capLevelToPlayerSize: true });
        hls.loadSource(src);
        hls.attachMedia(vid);
        hlsInstance = hls;
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = (hls.levels ?? []).map((l: any, i: number) => ({ index: i, height: l.height }));
          setQualityLevels(levels);

          // Decide o nível inicial pela preferência global + rede atual,
          // sem interromper (aplicado antes do primeiro frame).
          const pref = getCachedVideoPreference();
          const screenH = typeof window !== "undefined" ? window.innerHeight : 720;
          const targetHeight = pickStartingHeight(pref, screenH);

          if (pref.quality_mode === "manual" && pref.preferred_resolution) {
            applyQualityMode(pref.preferred_resolution, false);
          } else if (pref.quality_mode === "high_quality") {
            hls.currentLevel = -1;
            hls.autoLevelCapping = -1;
            setActiveLevel(-1);
          } else {
            // auto / economia de dados: define um teto e deixa o ABR trabalhar
            // dentro dele — troca de qualidade acontece sem cortar o vídeo.
            let capIdx = -1;
            let bestDiff = Infinity;
            levels.forEach((l) => {
              const diff = Math.abs(l.height - targetHeight);
              if (diff < bestDiff) { bestDiff = diff; capIdx = l.index; }
            });
            hls.autoLevelCapping = pref.quality_mode === "data_saver" ? capIdx : -1;
            hls.startLevel = capIdx;
            hls.currentLevel = -1;
            setActiveLevel(-1);
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_evt: any, data: any) => {
          const h = hls.levels?.[data.level]?.height;
          if (h) setCurrentResLabel(resolutionFromHeight(h));
        });

        // Adaptação durante o vídeo (ponto 4): se o hls.js detetar
        // travamentos/erro de buffer, tenta recuperar reduzindo qualidade
        // em vez de reiniciar o vídeo.
        hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        });
      });
    } else if (!nativeHls) {
      // Cloudinary (ou outra origem mp4): gera um "ladder" de resoluções
      // via transformação de URL — funciona em qualquer vídeo, mesmo os
      // publicados antes deste sistema existir, sem re-upload.
      const renditions = getCloudinaryRenditions(src);
      if (renditions && renditions.length > 0) {
        mp4RenditionsRef.current = renditions;
        setQualityLevels(renditions.map((r, i) => ({ index: i, height: r.height })));

        const pref = getCachedVideoPreference();
        const screenH = typeof window !== "undefined" ? window.innerHeight : 720;
        const targetHeight = pickStartingHeight(pref, screenH);

        let startIdx = renditions.length - 1; // default: maior disponível
        if (pref.quality_mode === "manual" && pref.preferred_resolution) {
          const target = { "144p":144,"240p":240,"360p":360,"480p":480,"720p":720,"1080p":1080,"1440p":1440,"4k":2160 }[pref.preferred_resolution];
          let bestDiff = Infinity;
          renditions.forEach((r, i) => { const d = Math.abs(r.height - target); if (d < bestDiff) { bestDiff = d; startIdx = i; } });
        } else if (pref.quality_mode !== "high_quality") {
          let bestDiff = Infinity;
          renditions.forEach((r, i) => { const d = Math.abs(r.height - targetHeight); if (d < bestDiff) { bestDiff = d; startIdx = i; } });
        }

        vid.src = renditions[startIdx].url;
        setActiveLevel(pref.quality_mode === "manual" ? startIdx : -1);
        setCurrentResLabel(resolutionFromHeight(renditions[startIdx].height));
        recordQualityChoice(renditions[startIdx].height);
      } else {
        setQualityLevels([]);
        vid.src = src;
      }
    } else {
      vid.src = src;
    }

    return () => {
      hlsInstance?.destroy();
      hlsRef.current = null;
    };
  }, [src, hasEnteredOnce, applyQualityMode]);

  /* ─── Adaptação durante o vídeo (ponto 4), para fontes mp4 sem HLS:
     em modo "Automático", se o vídeo travar repetidamente (buffering),
     desce um degrau no ladder de resoluções, sem reiniciar — preserva o
     tempo actual. Não interfere quando o utilizador escolheu manualmente
     uma resolução fixa. ─── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    function onWaitingStall() {
      if (preference.quality_mode === "manual") return;
      const renditions = mp4RenditionsRef.current;
      if (!renditions || activeLevel <= 0) return;
      stallCountRef.current += 1;
      if (stallCountRef.current >= 2) {
        stallCountRef.current = 0;
        switchMp4Rendition(activeLevel - 1, null);
      }
    }
    function onGoodProgress() {
      stallCountRef.current = 0;
    }

    vid.addEventListener("waiting", onWaitingStall);
    vid.addEventListener("playing", onGoodProgress);
    return () => {
      vid.removeEventListener("waiting", onWaitingStall);
      vid.removeEventListener("playing", onGoodProgress);
    };
  }, [activeLevel, preference.quality_mode, switchMp4Rendition]);

  useEffect(() => {
    setNaturalRatio(null);
    setMetadataLoaded(false);
    setHasStarted(false);
    setLoadError(false);
    fallbackStageRef.current = 0;
  }, [src]);

  /* ─── Watchdog: se o metadata não carregar em 12s (URL quebrada, CORS,
     CDN lento/sem resposta), assume erro em vez de deixar o skeleton
     escuro girando para sempre sem nenhuma pista visível. ─── */
  useEffect(() => {
    if (!hasEnteredOnce || metadataLoaded) return;
    const timer = setTimeout(() => {
      if (!metadataLoaded) setLoadError(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [hasEnteredOnce, metadataLoaded, src]);

  /* ─── Autoplay respeitoso: só reproduz com o vídeo visível na tela
     e a página em primeiro plano; pausa sozinho ao sair da tela ─── */
  useEffect(() => {
    if (!autoPlay) return;
    const vid = videoRef.current;
    if (!vid || !hasEnteredOnce) return;
    if (isInView) {
      // Segue a preferência global de som: se o utilizador já ativou o
      // som noutro vídeo, este entra a tocar já com som (igual ao
      // Instagram/TikTok). Só força mudo se a preferência global for
      // mudo — necessário para o autoplay ser permitido pelo browser.
      if (!hasStarted) vid.muted = getGlobalMuted();
      // Avisa o gestor global ANTES de tocar: garante que qualquer outro
      // vídeo a tocar (autoplay ou manual) é pausado imediatamente. Sem
      // isto, dois vídeos podiam ficar "isInView" ao mesmo tempo (zona de
      // transição do threshold) e tocar ambos em simultâneo.
      notifyVideoPlaying(mediaIdRef.current);
      vid.play()?.catch(() => {
        // Se o browser bloquear o autoplay com som (sem gesto ainda),
        // tenta de novo mudo para não perder o autoplay do vídeo.
        if (!vid.muted) {
          vid.muted = true;
          vid.play()?.catch(() => {});
        }
      });
    } else {
      vid.pause();
    }
  }, [autoPlay, isInView, hasEnteredOnce, hasStarted]);

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
    hideTimer.current = setTimeout(() => {
      setShowControls(false);
      setShowQualityMenu(false);
    }, CONTROLS_HIDE_DELAY_MS);
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

  // No mobile: o 1º toque no ECRÃ (fora dos botões), com os controlos
  // escondidos, só abre/mostra a barra de controlos — não pausa. Se os
  // controlos já estiverem visíveis, o 2º toque no ecrã alterna
  // play/pause (igual ao botão), e a barra continua visível/renovada.
  // No desktop mantém-se o comportamento clássico: clicar no vídeo
  // sempre alterna play/pause.
  function handleScreenTap() {
    if (isMobile) {
      if (showControls) {
        togglePlay();
      } else {
        resetTimer();
      }
      return;
    }
    togglePlay();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    const newMuted = !v.muted;
    v.muted = newMuted;
    setIsMuted(newMuted);
    // Preferência de som é GLOBAL: ligar/desligar o som aqui aplica-se a
    // todos os outros vídeos da app, atuais e futuros — igual ao
    // Instagram/TikTok (não é "só este vídeo com som", é "som ligado/
    // desligado para todos").
    setGlobalMuted(newMuted, mediaIdRef.current);
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
  // Só mostra o skeleton com shimmer quando NÃO há miniatura nenhuma para
  // mostrar — antes, isto ficava visível até "metadataLoaded" ser true, e em
  // muitos navegadores móveis isso só acontece depois de um toque do
  // utilizador (restrição de autoplay/carregamento de media), deixando o
  // vídeo preso num estado desfocado/escuro em quem entra pela primeira vez,
  // até tocarem no ecrã "às cegas".
  const showSkeleton = !hasStarted && !loadError && !poster;
  const preload: "none" | "metadata" = hasEnteredOnce ? "metadata" : "none";

  function retryLoad() {
    setLoadError(false);
    setMetadataLoaded(false);
    fallbackStageRef.current = 0;
    const vid = videoRef.current;
    if (vid) {
      vid.load();
    }
  }

  /** Se a fonte atual falhar a carregar, tenta cair num degrau mais
   *  "seguro" antes de admitir erro — cobre o caso mais comum na prática:
   *  a resolução pedida à Cloudinary dá 400 porque o vídeo original
   *  ultrapassa o limite de transformação síncrona do plano (ex.: 40MB no
   *  plano free). Nenhum destes fallbacks reinicia o vídeo do zero (o
   *  currentTime é preservado). */
  function handleVideoError() {
    const vid = videoRef.current;
    if (!vid) {
      setLoadError(true);
      return;
    }
    const t = vid.currentTime;

    // Estágio 0 → 1: estávamos a tocar uma rendition da ladder (ou o
    // próprio src ainda não tentado sem crop) — cai para a URL "oficial"
    // (q_auto/f_auto/vc_h264, sem redimensionamento), que é a mesma usada
    // no resto do site e pode já estar em cache.
    if (fallbackStageRef.current === 0 && mp4RenditionsRef.current) {
      fallbackStageRef.current = 1;
      mp4RenditionsRef.current = null;
      setQualityLevels([]);
      setActiveLevel(-1);
      setCurrentResLabel(null);
      vid.src = src;
      vid.currentTime = t;
      vid.play().catch(() => {});
      return;
    }

    // Estágio 1 → 2: último recurso — entrega totalmente bruta, sem
    // nenhuma transformação. Nunca dispara o limite de transformação
    // síncrona, porque não há nada a processar.
    if (fallbackStageRef.current <= 1) {
      const raw = getCloudinaryRawUrl(src);
      if (raw && raw !== vid.src) {
        fallbackStageRef.current = 2;
        vid.src = raw;
        vid.currentTime = t;
        vid.play().catch(() => {});
        return;
      }
    }

    setLoadError(true);
  }

  return (
    <div
      ref={(el) => {
        (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={`overflow-hidden bg-black select-none ${effectiveRounded} ${className} w-full`}
      onMouseMove={() => {
        if (!isMobile) resetTimer();
      }}
      onTouchStart={() => {
        if (!isMobile) resetTimer();
      }}
      onClick={handleScreenTap}
    >
      {/* Caixa interna: largura 100% da caixa externa, SEMPRE (igual aos
          vídeos horizontais). Quando o vídeo é vertical e bateria no
          limite de altura, a altura fica presa em maxHeightPx e o vídeo
          (object-contain) centra-se no meio, mais estreito que a caixa —
          o espaço lateral que sobra é preenchido pelo fundo desfocado
          (poster com blur) logo abaixo, nunca fica em branco/preto liso,
          igual ao TikTok/Instagram. Caso contrário (vídeo horizontal),
          comporta-se como antes: altura pela proporção real, presa por
          MAX_HEIGHT_CSS. */}
      <div
        className="relative w-full"
        style={
          isHeightConstrained
            ? { height: `${maxHeightPx}px`, overflow: "hidden" }
            : { aspectRatio: displayRatio, maxHeight: isFinite(maxHeightPx) ? `${maxHeightPx}px` : "none", overflow: "hidden" }
        }
      >
      {/* Fundo desfocado: preenche qualquer espaço que sobre à volta do
          vídeo (em vez de barra preta lisa), usando a própria imagem do
          vídeo esticada e desfocada — igual ao TikTok/Instagram. Só fica
          visível nesse espaço sobrante, porque o vídeo em cima cobre o
          resto. */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110"
          style={{ filter: "blur(30px) brightness(0.55)" }}
        />
      )}
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
        muted={isMuted}
        loop={loop}
        preload={preload}
        className={`absolute inset-0 w-full h-full ${objectFitClass}`}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          setHasStarted(true);
          notifyVideoPlaying(mediaIdRef.current);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (v && v.videoWidth && v.videoHeight)
            setNaturalRatio(`${v.videoWidth}/${v.videoHeight}`);
          setMetadataLoaded(true);
        }}
        onPause={() => setIsPlaying(false)}
        onError={handleVideoError}
        onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (v) {
            setCurrentTime(v.currentTime);
            setDuration(v.duration || 0);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Estado de erro visível — antes disto, uma falha de carregamento
          (URL quebrada, CORS, etc.) deixava a caixa completamente preta e
          vazia, sem nenhum sinal do que se passou. */}
      {loadError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          <span className="text-white/70 text-xs">Não foi possível carregar o vídeo</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              retryLoad();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white transition active:scale-95"
            style={{ background: BRAND }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

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
              className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-300"
              style={{ filter: "blur(6px)", transform: "scale(1.02)" }}
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 skeleton-shimmer" />
        </div>
      )}

      {/* Poster nítido + botão de play, antes de o utilizador iniciar.
          Não depende de "metadataLoaded" — em muitos navegadores móveis
          esse evento só dispara depois de um toque do utilizador, o que
          deixava o vídeo preso na camada borrada (showSkeleton) até
          alguém tocar "às cegas" no ecrã. Mostrando já aqui a miniatura
          nítida, quem entra pela primeira vez vê logo uma imagem clara. */}
      {!hasStarted && poster && (
        <div
          className="absolute inset-0 flex items-center justify-center hooda-fade-in"
          style={{ background: "rgba(0,0,0,0.35)" }}
        >
          {poster && (
            <img
              src={poster}
              alt=""
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
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
          style={{ fontFamily: SIGNATURE_FONTS[signature.font ?? "padrao"] ?? "inherit" }}
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

            {qualityLevels.length > 0 && (
              <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setShowQualityMenu((v) => !v);
                    setSettingsView("root");
                  }}
                  className={`flex items-center justify-center rounded-full transition hover:bg-white/15 ${isMobile ? "w-9 h-9" : "w-[22px] h-[22px]"}`}
                >
                  <Settings className={isMobile ? "w-[18px] h-[18px] text-white" : "w-3 h-3 text-white"} />
                </button>

                {showQualityMenu && (
                  <div
                    className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden min-w-[190px] shadow-xl"
                    style={{ background: "rgba(28,28,28,0.96)", backdropFilter: "blur(10px)" }}
                  >
                    {settingsView === "root" ? (
                      <div className="py-1">
                        <button
                          onClick={() => setSettingsView("quality")}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-[12px] text-white hover:bg-white/10"
                        >
                          <span>Qualidade</span>
                          <span className="flex items-center gap-1 text-white/60">
                            {activeLevel === -1 ? "Auto" : currentResLabel ? labelWithSuffix(currentResLabel) : "Auto"}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="py-1">
                        <button
                          onClick={() => setSettingsView("root")}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-white font-semibold border-b border-white/10 hover:bg-white/10"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Qualidade
                        </button>
                        <button
                          onClick={() => { applyQualityMode("auto", true); setShowQualityMenu(false); }}
                          className="w-full text-left px-3 py-2 text-[12px] text-white hover:bg-white/10 flex items-center justify-between"
                        >
                          Automático (recomendado)
                          {activeLevel === -1 && <span style={{ color: BRAND }}>✓</span>}
                        </button>
                        {[...qualityLevels]
                          .sort((a, b) => b.height - a.height)
                          .map((lvl) => {
                            const label = resolutionFromHeight(lvl.height);
                            return (
                              <button
                                key={lvl.index}
                                onClick={() => { applyQualityMode(label, true); setShowQualityMenu(false); }}
                                className="w-full text-left px-3 py-2 text-[12px] text-white hover:bg-white/10 flex items-center justify-between"
                              >
                                {labelWithSuffix(label)}
                                {activeLevel === lvl.index && <span style={{ color: BRAND }}>✓</span>}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
