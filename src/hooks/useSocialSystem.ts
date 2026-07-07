import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sistema social central — seguir, gostar e views.
 *
 * Antes, cada página (UniversalPostCard, u.$username, canal.$handle,
 * RightSidebar...) tinha a sua própria cópia da lógica de "seguir" e
 * "gostar", cada uma com pequenas diferenças. Isso causava o principal
 * sintoma reportado: seguir/gostar num sítio não refletia noutro, e às
 * vezes nem persistia (upsert falhava por faltar um UNIQUE constraint).
 *
 * Agora: UMA fonte de verdade por (utilizador, alvo) / (utilizador, post),
 * partilhada via a cache do React Query. Sempre que alguém segue ou
 * gosta em qualquer componente, todos os outros componentes montados que
 * usem estes hooks para o mesmo alvo/post atualizam instantaneamente —
 * sem reload, sem re-fetch manual.
 */

// ─── Seguir ───────────────────────────────────────────────────────────

export const FOLLOW_KEYS = {
  status: (myId: string | null | undefined, targetUsername: string | null | undefined) =>
    ["follow-status", myId, targetUsername] as const,
  counts: (username: string | null | undefined) => ["follow-counts", username] as const,
};

async function fetchFollowStatus(myId: string, targetUsername: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("follows")
    .select("id")
    .eq("follower_id", myId)
    .eq("target_username", targetUsername)
    .maybeSingle();
  return !!data;
}

async function fetchFollowCounts(username: string): Promise<{ followers: number; following: number }> {
  const { data } = await (supabase as any)
    .from("profiles")
    .select("followers_count,following_count")
    .eq("username", username)
    .maybeSingle();
  return { followers: data?.followers_count ?? 0, following: data?.following_count ?? 0 };
}

/**
 * Estado de "seguir" partilhado e reativo para um alvo (username).
 * `myId` null/undefined = utilizador não autenticado (isFollowing sempre false).
 */
export function useFollowState(myId: string | null | undefined, targetUsername: string | null | undefined, targetId?: string | null) {
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: FOLLOW_KEYS.status(myId, targetUsername),
    queryFn: () => fetchFollowStatus(myId as string, targetUsername as string),
    enabled: !!myId && !!targetUsername,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const countsQuery = useQuery({
    queryKey: FOLLOW_KEYS.counts(targetUsername),
    queryFn: () => fetchFollowCounts(targetUsername as string),
    enabled: !!targetUsername,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });

  const toggle = useCallback(async () => {
    if (!myId || !targetUsername) return;
    const prevFollowing = !!qc.getQueryData(FOLLOW_KEYS.status(myId, targetUsername));
    const prevCounts = qc.getQueryData<{ followers: number; following: number }>(FOLLOW_KEYS.counts(targetUsername));

    // Otimista — atualiza já toda a UI que partilha esta chave
    qc.setQueryData(FOLLOW_KEYS.status(myId, targetUsername), !prevFollowing);
    qc.setQueryData(FOLLOW_KEYS.counts(targetUsername), (prev: any) => ({
      followers: Math.max(0, (prev?.followers ?? prevCounts?.followers ?? 0) + (prevFollowing ? -1 : 1)),
      following: prev?.following ?? prevCounts?.following ?? 0,
    }));

    try {
      const { data, error } = await (supabase as any).rpc("toggle_follow", {
        p_target_username: targetUsername,
        p_target_id: targetId ?? null,
      });
      if (error) throw error;
      qc.setQueryData(FOLLOW_KEYS.status(myId, targetUsername), !!data?.following);
      qc.setQueryData(FOLLOW_KEYS.counts(targetUsername), (prev: any) => ({
        followers: data?.followers_count ?? prev?.followers ?? 0,
        following: prev?.following ?? 0,
      }));
      // A contagem "a seguir" de quem clicou também muda — invalida a dela
      qc.invalidateQueries({ queryKey: ["follow-counts"], exact: false });
      qc.invalidateQueries({ queryKey: ["profile"], exact: false });
    } catch (err) {
      console.error("[hooda:social] falha ao seguir/deixar de seguir:", err);
      // reverter otimismo
      qc.setQueryData(FOLLOW_KEYS.status(myId, targetUsername), prevFollowing);
      qc.setQueryData(FOLLOW_KEYS.counts(targetUsername), prevCounts);
    }
  }, [myId, targetUsername, targetId, qc]);

  return {
    isFollowing: statusQuery.data ?? false,
    isLoading: statusQuery.isLoading,
    followersCount: countsQuery.data?.followers ?? 0,
    followingCount: countsQuery.data?.following ?? 0,
    toggle,
  };
}

// ─── Gostar (posts) ───────────────────────────────────────────────────

export const LIKE_KEYS = {
  post: (postId: string) => ["like-state", "post", postId] as const,
};

/** Estado de "gostei" partilhado para um post — sincronizado entre todos
 * os cartões que mostrem o mesmo post (feed, perfil, explorador, etc.). */
export function usePostLikeState(postId: string, myId: string | null | undefined, initial?: { liked: boolean; count: number }) {
  const qc = useQueryClient();
  const key = LIKE_KEYS.post(postId);

  useEffect(() => {
    if (initial && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => initial ?? { liked: false, count: 0 },
    enabled: false, // valor inicial vem sempre do post carregado; só mutamos via toggle
    initialData: initial,
    staleTime: Infinity,
  });

  const toggle = useCallback(async () => {
    if (!myId) return;
    const prev = qc.getQueryData<{ liked: boolean; count: number }>(key) ?? { liked: false, count: 0 };
    qc.setQueryData(key, { liked: !prev.liked, count: Math.max(0, prev.count + (prev.liked ? -1 : 1)) });
    try {
      const { data, error } = await (supabase as any).rpc("toggle_post_like", { p_post_id: postId });
      if (error) throw error;
      qc.setQueryData(key, { liked: !!data?.liked, count: data?.likes_count ?? prev.count });
    } catch (err) {
      console.error("[hooda:social] falha ao gostar do post:", err);
      qc.setQueryData(key, prev);
    }
  }, [postId, myId, qc, key]);

  return { liked: query.data?.liked ?? false, likeCount: query.data?.count ?? 0, toggle };
}

// ─── Gostar (vídeos do HoodaTV) ────────────────────────────────────────

export const VIDEO_LIKE_KEYS = {
  video: (videoId: string) => ["like-state", "video", videoId] as const,
};

/** Equivalente a usePostLikeState, mas para vídeos (toggle_video_like). */
export function useVideoLikeState(videoId: string, myId: string | null | undefined, initial?: { liked: boolean; count: number }) {
  const qc = useQueryClient();
  const key = VIDEO_LIKE_KEYS.video(videoId);

  useEffect(() => {
    if (initial && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => initial ?? { liked: false, count: 0 },
    enabled: false,
    initialData: initial,
    staleTime: Infinity,
  });

  const toggle = useCallback(async () => {
    if (!myId) return;
    const prev = qc.getQueryData<{ liked: boolean; count: number }>(key) ?? { liked: false, count: 0 };
    qc.setQueryData(key, { liked: !prev.liked, count: Math.max(0, prev.count + (prev.liked ? -1 : 1)) });
    try {
      const { data, error } = await (supabase as any).rpc("toggle_video_like", { p_video_id: videoId });
      if (error) throw error;
      qc.setQueryData(key, { liked: !!data?.liked, count: data?.likes_count ?? prev.count });
    } catch (err) {
      console.error("[hooda:social] falha ao gostar do vídeo:", err);
      qc.setQueryData(key, prev);
    }
  }, [videoId, myId, qc, key]);

  return { liked: query.data?.liked ?? false, likeCount: query.data?.count ?? 0, toggle };
}

// ─── Views (posts e vídeos) ───────────────────────────────────────────

export function getViewerFingerprint(): string {
  const KEY = "hooda_viewer_fp";
  let fp = localStorage.getItem(KEY);
  if (!fp) {
    fp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, fp);
  }
  return fp;
}

/** Regista uma view para conteúdo SEM vídeo (texto/foto) assim que fica
 * visível no ecrã — sujeito ao cooldown de 12h decidido pela BD. */
export function usePostImpressionView(postId: string | null | undefined, enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || !postId || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !done.current) {
          done.current = true;
          const fp = getViewerFingerprint();
          (supabase as any).rpc("record_post_view", {
            p_post_id: postId,
            p_viewer_fingerprint: fp,
          }).then(() => {});
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [postId, enabled]);

  return ref;
}

const WATCH_THRESHOLDS_KEY_PREFIX = "hooda_view_sent_";

/** Regista uma view para post de vídeo/clip com a lógica pedida:
 *  - vídeo ≤30s: conta com ≥5s assistidos
 *  - vídeo mais longo: conta com ≥50% assistido, até um teto de 15min
 *  - o mesmo espectador só volta a contar passadas 12h (decidido na BD;
 *    aqui só evitamos chamadas repetidas óbvias na mesma sessão). */
export function useVideoPostView(postId: string | null | undefined, kind: string | null | undefined, videoRef: React.RefObject<HTMLVideoElement | null>) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!postId || (kind !== "video" && kind !== "clip")) return;
    sentRef.current = false;
    const sessionKey = `${WATCH_THRESHOLDS_KEY_PREFIX}${postId}`;
    if (sessionStorage.getItem(sessionKey)) return; // já tentámos nesta aba

    const vid = videoRef.current;
    if (!vid) return;

    function onTimeUpdate() {
      if (sentRef.current || !vid || vid.paused) return;
      const duration = vid.duration;
      if (!duration || Number.isNaN(duration)) return;
      const watched = vid.currentTime;
      const threshold = duration <= 30 ? 5 : Math.min(900, duration * 0.5);
      if (watched >= threshold) {
        sentRef.current = true;
        sessionStorage.setItem(sessionKey, "1");
        const fp = getViewerFingerprint();
        (supabase as any).rpc("record_post_view", {
          p_post_id: postId,
          p_viewer_fingerprint: fp,
          p_watch_seconds: watched,
          p_duration_seconds: duration,
        }).then(() => {});
      }
    }

    vid.addEventListener("timeupdate", onTimeUpdate);
    return () => vid.removeEventListener("timeupdate", onTimeUpdate);
  }, [postId, kind, videoRef]);
}

/** Regista uma view para vídeo do HoodaTV (páginas de canal/watch) com a
 * mesma lógica de limiar de tempo assistido + cooldown de 12h na BD. */
export function useVideoViewTracking(
  videoId: string | null | undefined,
  channelId: string | null | undefined,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!videoId) return;
    sentRef.current = false;
    const sessionKey = `${WATCH_THRESHOLDS_KEY_PREFIX}v_${videoId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const vid = videoRef.current;
    if (!vid) return;

    function onTimeUpdate() {
      if (sentRef.current || !vid || vid.paused) return;
      const duration = vid.duration;
      if (!duration || Number.isNaN(duration)) return;
      const watched = vid.currentTime;
      const threshold = duration <= 30 ? 5 : Math.min(900, duration * 0.5);
      if (watched >= threshold) {
        sentRef.current = true;
        sessionStorage.setItem(sessionKey, "1");
        const fp = getViewerFingerprint();
        (supabase as any).rpc("record_video_view", {
          p_video_id: videoId,
          p_channel_id: channelId ?? null,
          p_viewer_fingerprint: fp,
          p_watch_seconds: watched,
          p_duration_seconds: duration,
        }).then(() => {});
      }
    }

    vid.addEventListener("timeupdate", onTimeUpdate);
    return () => vid.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoId, channelId, videoRef]);
}
