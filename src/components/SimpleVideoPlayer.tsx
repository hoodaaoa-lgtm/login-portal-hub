import { useRef, useState } from "react";
import { usePostVideoView } from "@/hooks/usePostVideoView";

interface Props {
  src: string;
  poster?: string;
  postId?: string;
  kind?: string; // "video" | "clip" | outros — só conta views para video/clip
}

export function SimpleVideoPlayer({ src, poster, postId, kind }: Props) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  // Regista view após 3s (só para video/clip)
  usePostVideoView(postId, kind, ref);

  function toggle() {
    const v = ref.current; if (!v) return;
    v.paused ? v.play() : v.pause();
  }

  return (
    <div className="w-full bg-black relative cursor-pointer overflow-hidden"
      onClick={toggle}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="w-full block"
        style={{ display:"block", pointerEvents:"none", objectFit:"cover", width:"100%" }}
        onContextMenu={e => e.preventDefault()}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)" }}>
            <svg className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}
      {playing && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background:"rgba(0,0,0,0.4)" }}>
            <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
