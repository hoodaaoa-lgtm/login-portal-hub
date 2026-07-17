import { useEffect, useRef, useState } from "react";
import { isLottieSticker } from "@/lib/stickers";

const lottieCache = new Map<string, any>();

// Porque não usamos o componente <Lottie> de "lottie-react":
// 1) o seu build "browser" (UMD) auto-deteta o ambiente em runtime e essa
//    deteção falha sob o interop de CJS do Rolldown, deixando o export
//    default inválido (React error #130 — já apanhado e resolvido antes).
// 2) mesmo forçando o build ESM limpo, o componente <Lottie> em si tem um
//    bug interno: quando várias animações montam ao mesmo tempo (a grelha
//    inteira de stickers no picker), por vezes tenta ler `.style` dum
//    contentor que ainda não ficou pronto — e fá-lo fora do ciclo de
//    render síncrono do React (num callback assíncrono), pelo que nem um
//    error boundary consegue apanhar; rebenta a app toda.
// Em vez disso usamos "lottie-web" (a biblioteca por trás do lottie-react)
// diretamente, a partir do seu build ESM puro (sem deteção de ambiente
// nenhuma), e nós próprios controlamos o `loadAnimation`/`destroy` — só
// arrancamos a animação depois de confirmar que o contentor está mesmo
// montado, e limpamos tudo de forma segura ao desmontar.
let lottieApi: any = null;
let lottieLoadPromise: Promise<any> | null = null;
function loadLottieApi() {
  if (lottieApi) return Promise.resolve(lottieApi);
  if (!lottieLoadPromise) {
    lottieLoadPromise = import("lottie-web/build/player/esm/lottie_light.min.js").then((mod) => {
      lottieApi = mod.default;
      return lottieApi;
    });
  }
  return lottieLoadPromise;
}

function LottieAnimation({ data, size }: { data: any; size: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<any>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLottieApi()
      .then((lottie) => {
        if (cancelled || !containerRef.current) return;
        const anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: data,
        });
        animRef.current = anim;
        // Não precisa de estar sempre em movimento — para sozinho depois de
        // 3s; um clique volta a dar-lhe corda por mais 3s.
        stopTimerRef.current = setTimeout(() => { try { anim.pause(); } catch { /* já destruído */ } }, 3000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      try { animRef.current?.destroy(); } catch { /* já desmontado, ignora */ }
    };
  }, [data]);

  const handleClick = () => {
    const anim = animRef.current;
    if (!anim) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    anim.goToAndPlay(0, true);
    stopTimerRef.current = setTimeout(() => { try { anim.pause(); } catch { /* já destruído */ } }, 3000);
  };

  return <div ref={containerRef} onClick={handleClick} style={{ width: size, height: size }} />;
}

/** Sticker em vídeo — mesmo comportamento: 3s de movimento e depois para,
 * um clique reinicia por mais 3s. */
function VideoSticker({ url, size, className }: { url: string; size: number; className: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleStop = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => { videoRef.current?.pause(); }, 3000);
  };

  useEffect(() => {
    scheduleStop();
    return () => { if (stopTimerRef.current) clearTimeout(stopTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleClick = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
    scheduleStop();
  };

  return (
    <video ref={videoRef} src={url} autoPlay loop muted playsInline onClick={handleClick} className={className}
      style={{ width: size, height: size, objectFit: "cover" }} />
  );
}

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
        <LottieAnimation key={url} data={data} size={size} />
      </div>
    );
  }

  return (
    <VideoSticker url={url} size={size} className={className} />
  );
}
