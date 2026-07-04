/**
 * HoodaPlayer — player de vídeo oficial da Hooda.
 * Usado em todo o site em vez do <video> nativo do browser.
 *
 * Props:
 *   src       — URL do vídeo (mp4, m3u8, cloudinary, etc.)
 *   poster?   — thumbnail
 *   autoPlay? — default false
 *   loop?     — default false
 *   className? — classes extras no wrapper
 */
import { useRef, useState, useEffect, useCallback, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw,
} from "lucide-react";

const P = "#5B3FCF";

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
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
  aspectRatio?: string; // e.g. "16/9", "9/16", "1/1"
  rounded?: string;     // e.g. "rounded-2xl"
  watermark?: WatermarkConfig | null;
  signature?: SignatureConfig | null;
}

export const HoodaPlayer = forwardRef<HTMLVideoElement, HoodaPlayerProps>(function HoodaPlayer({
  src,
  poster,
  autoPlay = false,
  loop = false,
  className = "",
  aspectRatio = "16/9",
  rounded = "rounded-2xl",
  watermark,
  signature,
}, forwardedRef) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isMuted,     setIsMuted]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted,  setHasStarted]  = useState(autoPlay);

  // HLS support
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !src) return;

    const isHls = src.includes(".m3u8");
    if (isHls && !vid.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: false });
        hls.loadSource(src);
        hls.attachMedia(vid);
        return () => hls.destroy();
      });
    } else {
      vid.src = src;
    }
  }, [src]);

  const resetTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2800);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
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
      v.play()?.catch(() => { /* autoplay/gesto bloqueado — ignora, utilizador pode tentar de novo */ });
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
    const el = containerRef.current;
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

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black select-none ${rounded} ${className}`}
      style={{ aspectRatio }}
      onMouseMove={resetTimer}
      onTouchStart={resetTimer}
      onClick={togglePlay}
    >
      {/* Video element */}
      <video
        ref={(el) => {
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
          if (typeof forwardedRef === "function") forwardedRef(el);
          else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        }}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        loop={loop}
        preload="metadata"
        className="w-full h-full object-contain"
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => { setIsBuffering(false); setIsPlaying(true); setHasStarted(true); }}
        onCanPlay={() => setIsBuffering(false)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (v) { setCurrentTime(v.currentTime); setDuration(v.duration || 0); }
        }}
        onContextMenu={e => e.preventDefault()}
      />

      {/* Poster / play overlay when not started */}
      {!hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)" }}>
          {poster && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: "rgba(255,255,255,0.92)" }}>
            <Play className="w-7 h-7 ml-1" style={{ color: P }} />
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
            watermark.position === 'top-left' ? 'top-0 left-0' :
            watermark.position === 'top-right' ? 'top-0 right-0' :
            watermark.position === 'bottom-left' ? 'bottom-16 left-0' :
            watermark.position === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
            'bottom-16 right-0'
          } ${
            watermark.size === 'small' ? 'scale-75 origin-center' :
            watermark.size === 'large' ? 'scale-125 origin-center' : ''
          }`}
          style={{ opacity: watermark.opacity / 100 }}
        >
          {watermark.type === 'image' && watermark.imageUrl ? (
            <img src={watermark.imageUrl} alt="Watermark" className="max-h-12 object-contain" />
          ) : (
            <span className="text-white font-bold text-lg drop-shadow-md select-none">{watermark.text}</span>
          )}
        </div>
      )}

      {/* Signature Overlay */}
      {signature?.enabled && (
        <div 
          className={`absolute pointer-events-none z-10 p-4 transition-opacity duration-300 flex items-center gap-2 ${
            signature.position === 'top-left' ? 'top-0 left-0' :
            signature.position === 'bottom-right' ? 'bottom-16 right-0' :
            'bottom-16 left-0'
          } ${
            signature.style === 'small' ? 'scale-75 origin-left opacity-70' :
            signature.style === 'large' ? 'scale-125 origin-left font-extrabold' : 'font-bold'
          }`}
        >
          <span className="text-white drop-shadow-md select-none tracking-tight">
            {signature.channelName} {signature.handle && <span className="opacity-80">@{signature.handle}</span>}
          </span>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none"
        style={{ opacity: showControls || !isPlaying ? 1 : 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gradient */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)" }} />

        {/* Bottom bar */}
        <div className="relative z-10 px-3 pb-3 pt-6 pointer-events-auto">
          {/* Seek bar */}
          <div className="mb-2 relative h-1 group/seek" style={{ cursor: "pointer" }}>
            {/* Track bg */}
            <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
            {/* Progress */}
            <div className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: P }} />
            <input
              type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
              onChange={seek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              style={{ height: "100%" }}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button onClick={e => { e.stopPropagation(); togglePlay(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition hover:bg-white/15">
              {isPlaying
                ? <Pause className="w-4 h-4 text-white" />
                : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>

            {/* Restart */}
            {duration > 0 && (duration - currentTime) < 2 && (
              <button onClick={e => { e.stopPropagation(); restart(); }}
                className="w-8 h-8 flex items-center justify-center rounded-full transition hover:bg-white/15">
                <RotateCcw className="w-4 h-4 text-white" />
              </button>
            )}

            {/* Time */}
            <span className="text-white text-[11px] font-mono tabular-nums flex-1 select-none">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>

            {/* Mute */}
            <button onClick={e => { e.stopPropagation(); toggleMute(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition hover:bg-white/15">
              {isMuted
                ? <VolumeX className="w-4 h-4 text-white" />
                : <Volume2 className="w-4 h-4 text-white" />}
            </button>

            {/* Fullscreen */}
            <button onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition hover:bg-white/15">
              {isFullscreen
                ? <Minimize className="w-4 h-4 text-white" />
                : <Maximize className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      </div>

      {/* Custom seek thumb style */}
      <style>{`
        .hooda-player-seek { -webkit-appearance: none; appearance: none; background: transparent; }
        .hooda-player-seek::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(91,63,207,0.55);
          cursor: pointer;
        }
        .hooda-player-seek::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%;
          background: #fff; border: none;
          box-shadow: 0 0 0 3px rgba(91,63,207,0.55);
        }
      `}</style>
    </div>
  );
});
