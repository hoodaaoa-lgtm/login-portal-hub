/**
 * usePostVideoView
 * Regista uma view num post de vídeo/clip após 3s de reprodução.
 * Usa fingerprint + localStorage para evitar contagem duplicada (6h cooldown).
 * Só conta para posts kind = "video" ou "clip".
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const WATCH_THRESHOLD_MS = 3_000; // 3 segundos

function getFingerprint(): string {
  const raw = [navigator.language, screen.width, screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone].join("|");
  return btoa(raw).slice(0, 32);
}

export function usePostVideoView(
  postId: string | null | undefined,
  kind: string | null | undefined,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const registered = useRef(false);

  useEffect(() => {
    if (!postId || (kind !== "video" && kind !== "clip")) return;
    if (registered.current) return;

    const lsKey = `post-view-${postId}`;
    const lastSeen = localStorage.getItem(lsKey);
    if (lastSeen && Date.now() - Number(lastSeen) < SIX_HOURS) return;

    const fp = getFingerprint();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onPlay() {
      if (registered.current) return;
      timer = setTimeout(async () => {
        const vid = videoRef.current;
        if (!vid || vid.paused || vid.ended) return;
        if (registered.current) return;
        registered.current = true;

        try {
          await (supabase as any).rpc("record_post_view", {
            p_post_id:            postId,
            p_viewer_fingerprint: fp,
          });
          localStorage.setItem(lsKey, String(Date.now()));
        } catch (_) {}
      }, WATCH_THRESHOLD_MS);
    }

    function onPause() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    const vid = videoRef.current;
    if (vid) {
      vid.addEventListener("play", onPlay);
      vid.addEventListener("pause", onPause);
      vid.addEventListener("ended", onPause);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (vid) {
        vid.removeEventListener("play", onPlay);
        vid.removeEventListener("pause", onPause);
        vid.removeEventListener("ended", onPause);
      }
    };
  }, [postId, kind]);
}
