import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

/**
 * Sincronização em tempo real: uma ÚNICA subscrição por sessão de app
 * (não uma por componente montado) ouve mudanças nas tabelas sociais
 * (follows, post_comments, post_likes, post_saves) e invalida a cache
 * partilhada certa. Assim, uma ação num dispositivo/aba reflete-se
 * automaticamente em qualquer outro sítio aberto, sem refresh.
 */
let followRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
function ensureFollowRealtimeSync(qc: ReturnType<typeof useQueryClient>) {
  if (followRealtimeChannel) return;
  followRealtimeChannel = supabase
    .channel("social-realtime-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, () => {
      qc.invalidateQueries({ queryKey: ["follow-status"], exact: false });
      qc.invalidateQueries({ queryKey: ["follow-counts"], exact: false });
      qc.invalidateQueries({ queryKey: ["profile"], exact: false });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, (payload: any) => {
      const postId = payload?.new?.post_id ?? payload?.old?.post_id;
      if (postId) {
        // Recalcula pelo valor real da BD (posts.comments_count é mantido
        // por trigger), evitando drift entre dispositivos/abas.
        (supabase as any).from("posts").select("comments_count").eq("id", postId).maybeSingle()
          .then(({ data }: any) => {
            if (data) qc.setQueryData(COMMENT_COUNT_KEYS.post(postId), data.comments_count ?? 0);
          });
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, (payload: any) => {
      const postId = payload?.new?.post_id ?? payload?.old?.post_id;
      if (postId) {
        (supabase as any).from("posts").select("likes_count").eq("id", postId).maybeSingle()
          .then(({ data }: any) => {
            if (data) qc.setQueryData<{ liked: boolean; count: number }>(LIKE_KEYS.post(postId), (prev) =>
              ({ liked: prev?.liked ?? false, count: data.likes_count ?? prev?.count ?? 0 }));
          });
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "post_saves" }, () => {
      qc.invalidateQueries({ queryKey: ["post-saved"], exact: false });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "video_likes" }, (payload: any) => {
      const videoId = payload?.new?.video_id ?? payload?.old?.video_id;
      if (videoId) {
        (supabase as any).from("videos").select("likes_count").eq("id", videoId).maybeSingle()
          .then(({ data }: any) => {
            if (data) qc.setQueryData<{ liked: boolean; count: number }>(VIDEO_LIKE_KEYS.video(videoId), (prev) =>
              ({ liked: prev?.liked ?? false, count: data.likes_count ?? prev?.count ?? 0 }));
          });
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "video_comments" }, (payload: any) => {
      const videoId = payload?.new?.video_id ?? payload?.old?.video_id;
      if (videoId) {
        (supabase as any).from("videos").select("comments_count").eq("id", videoId).maybeSingle()
          .then(({ data }: any) => {
            if (data) qc.setQueryData(VIDEO_COMMENT_COUNT_KEYS.video(videoId), data.comments_count ?? 0);
          });
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "videos" }, (payload: any) => {
      // Cobre views_count (incrementado via RPC record_video_view) e qualquer
      // outra alteração ao contador de vídeo feita fora de likes/comments.
      const videoId = payload?.new?.id;
      if (videoId) {
        qc.setQueryData(VIDEO_VIEWS_COUNT_KEYS.video(videoId), payload.new.views_count ?? 0);
        qc.setQueryData(VIDEO_COMMENT_COUNT_KEYS.video(videoId), payload.new.comments_count ?? 0);
        qc.setQueryData<{ liked: boolean; count: number }>(VIDEO_LIKE_KEYS.video(videoId), (prev) =>
          prev ? { ...prev, count: payload.new.likes_count ?? prev.count } : prev);
      }
    })
    .subscribe();
}

async function fetchFollowStatus(myId: string, targetUsername: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("follows")
    .select("id")
    .eq("follower_id", myId)
    .eq("target_username", targetUsername)
    .maybeSingle();
  // Importante: se a consulta falhar (RLS, rede, etc.), NÃO podemos
  // devolver "false" como se fosse resposta válida — isso faz o React
  // Query gravar "não sigo" como sucesso e apagar o "sigo" correto que já
  // estava em cache (era exatamente isto que fazia o botão "esquecer"
  // que já se seguia alguém ao fim de um tempo, mesmo com o contador
  // certo). Lançar o erro faz o React Query manter o último valor bom.
  if (error) throw error;
  return !!data;
}

async function fetchFollowCounts(username: string): Promise<{ followers: number; following: number }> {
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("followers_count,following_count")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return { followers: data?.followers_count ?? 0, following: data?.following_count ?? 0 };
}

/**
 * Estado de "seguir" partilhado e reativo para um alvo (username).
 * `myId` null/undefined = utilizador não autenticado (isFollowing sempre false).
 */
export function useFollowState(myId: string | null | undefined, targetUsername: string | null | undefined, targetId?: string | null) {
  const qc = useQueryClient();
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => { ensureFollowRealtimeSync(qc); }, [qc]);

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
    // Impede duplo-clique/duplicação: só um toggle de cada vez por hook
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
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
    } catch (err: any) {
      console.error("[hooda:social] falha ao seguir/deixar de seguir:", err);
      toast.error(err?.message ? `Não foi possível acompanhar: ${err.message}` : "Não foi possível acompanhar. Tenta novamente.");
      // reverter otimismo
      qc.setQueryData(FOLLOW_KEYS.status(myId, targetUsername), prevFollowing);
      qc.setQueryData(FOLLOW_KEYS.counts(targetUsername), prevCounts);
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }, [myId, targetUsername, targetId, qc]);

  return {
    isFollowing: statusQuery.data ?? false,
    isLoading: statusQuery.isLoading,
    followersCount: countsQuery.data?.followers ?? 0,
    followingCount: countsQuery.data?.following ?? 0,
    // Loading real dos CONTADORES (followers/following) — distinto de
    // `isLoading`, que só reflete se JÁ sigo o alvo. Sem isto, um
    // consumidor não tem como saber se "0" é o valor real ou só ainda
    // não chegou, e acaba a mostrar "0" durante o carregamento.
    countsLoading: countsQuery.isLoading,
    // Verdadeiro enquanto o pedido de seguir/deixar de seguir está em
    // curso — usar para desativar o botão e impedir duplo-clique.
    isPending,
    toggle,
  };
}

// ─── Comentários (contador) ────────────────────────────────────────────

export const COMMENT_COUNT_KEYS = {
  post: (postId: string) => ["comment-count", "post", postId] as const,
};

/** Contador de comentários partilhado — sincronizado entre todos os
 * cartões que mostrem o mesmo post (feed, perfil, explorador, favoritos,
 * página da publicação...). Atualiza de forma otimista ao comentar/
 * apagar, e por realtime quando a alteração acontece noutro dispositivo
 * ou noutra aba. */
export function usePostCommentCount(postId: string, initial?: number) {
  const qc = useQueryClient();
  const key = COMMENT_COUNT_KEYS.post(postId);

  useEffect(() => {
    if (initial !== undefined && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => { ensureFollowRealtimeSync(qc); }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => initial ?? 0,
    enabled: false,
    initialData: initial ?? 0,
    staleTime: Infinity,
  });

  const increment = useCallback((delta: number) => {
    qc.setQueryData<number>(key, (prev) => Math.max(0, (prev ?? 0) + delta));
  }, [qc, key]);

  const setCount = useCallback((n: number) => {
    qc.setQueryData(key, Math.max(0, n));
  }, [qc, key]);

  return { count: query.data ?? 0, increment, setCount };
}



// ─── Guardar (posts) ────────────────────────────────────────────────

export const SAVE_KEYS = {
  post: (postId: string) => ["save-state", "post", postId] as const,
};

/** Estado de "guardado" partilhado — sincronizado entre todos os cartões
 * que mostrem o mesmo post (feed, perfil, explorador, favoritos...). */
export function useBookmarkState(postId: string, myId: string | null | undefined, initial?: boolean) {
  const qc = useQueryClient();
  const key = SAVE_KEYS.post(postId);

  useEffect(() => {
    if (initial !== undefined && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => { ensureFollowRealtimeSync(qc); }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!myId) return false;
      const { data, error } = await (supabase as any).from("post_saves").select("id")
        .eq("post_id", postId).eq("user_id", myId).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!myId && initial === undefined,
    initialData: initial,
    staleTime: 60_000,
  });

  const toggle = useCallback(async () => {
    if (!myId) return;
    const prev = qc.getQueryData<boolean>(key) ?? false;
    const next = !prev;
    qc.setQueryData(key, next);
    try {
      if (next) {
        const { error } = await (supabase as any).from("post_saves").insert({ post_id: postId, user_id: myId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("post_saves").delete().eq("post_id", postId).eq("user_id", myId);
        if (error) throw error;
      }
    } catch (err) {
      console.error("[hooda:social] falha ao guardar/desguardar post:", err);
      qc.setQueryData(key, prev);
    }
  }, [postId, myId, qc, key]);

  return { bookmarked: query.data ?? false, toggle };
}

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

// ─── Comentários e views (vídeos do HoodaTV) ───────────────────────────

export const VIDEO_COMMENT_COUNT_KEYS = {
  video: (videoId: string) => ["comment-count", "video", videoId] as const,
};

export const VIDEO_VIEWS_COUNT_KEYS = {
  video: (videoId: string) => ["views-count", "video", videoId] as const,
};

/** Contador de comentários de vídeo partilhado — sincronizado em tempo
 * real entre todos os espectadores (canal, watch, studio...), tal como
 * usePostCommentCount faz para posts. Antes, cada VideoCard guardava o
 * contador só no seu próprio useState local: quem comentava via o valor
 * mudar (otimismo local), mas todos os outros ficavam presos ao número
 * carregado na primeira vez que a página abriu — nunca atualizava. */
export function useVideoCommentCount(videoId: string, initial?: number) {
  const qc = useQueryClient();
  const key = VIDEO_COMMENT_COUNT_KEYS.video(videoId);

  useEffect(() => {
    if (initial !== undefined && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => { ensureFollowRealtimeSync(qc); }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => initial ?? 0,
    enabled: false,
    initialData: initial ?? 0,
    staleTime: Infinity,
  });

  const increment = useCallback((delta: number) => {
    qc.setQueryData<number>(key, (prev) => Math.max(0, (prev ?? 0) + delta));
  }, [qc, key]);

  return { count: query.data ?? 0, increment };
}

/** Contador de views de vídeo partilhado — mesma lógica de sincronização
 * em tempo real, para não ficar preso ao valor carregado inicialmente. */
export function useVideoViewsCount(videoId: string, initial?: number) {
  const qc = useQueryClient();
  const key = VIDEO_VIEWS_COUNT_KEYS.video(videoId);

  useEffect(() => {
    if (initial !== undefined && qc.getQueryData(key) === undefined) {
      qc.setQueryData(key, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => { ensureFollowRealtimeSync(qc); }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => initial ?? 0,
    enabled: false,
    initialData: initial ?? 0,
    staleTime: Infinity,
  });

  return { count: query.data ?? 0 };
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

