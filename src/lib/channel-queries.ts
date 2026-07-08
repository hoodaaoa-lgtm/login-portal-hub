/**
 * NOTA: este arquivo já não fala com uma tabela "channels" — ela foi
 * eliminada (ver supabase/migrations/20260708140000_remove_channels_use_profiles.sql).
 * "Channel" aqui é só um apelido de compatibilidade para o perfil do próprio
 * usuário (profiles), para não obrigar a reescrever de uma vez todos os
 * arquivos do Studio que ainda leem `channel.id/name/handle/avatar_url`.
 * O rename definitivo para `profile-queries.ts` (e eliminar a palavra
 * "channel" de vez) é a fase final do plano de limpeza.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Channel = {
  id: string;            // = profiles.id (também é o owner_id em videos/posts/playlists)
  owner_id: string;
  name: string;           // profiles.full_name
  handle: string;         // profiles.username
  description: string | null; // profiles.bio
  category: string | null;
  country: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Video = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  video_path: string | null;
  cf_stream_uid: string | null;
  cf_stream_url: string | null;
  cf_embed_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: "processing" | "published" | "failed";
  visibility: "public" | "private" | "unlisted";
  views_count: number;
  likes_count: number;
  comments_count: number;
  category: string | null;
  tags: string[] | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelStats = {
  total: number;
  published: number;
  views: number;
  views_24h: number;
  views_7d: number;
  views_28d: number;
  subs: number;
  subs_gained_28d: number;
  avg_watch_pct: number;
  total_duration_seconds: number;
  lastActivity: string | null;
};

export type DailyViewRow = { day: string; views: number };
export type CountryRow   = { country: string; views: number };

function mapProfileToChannel(p: any): Channel {
  return {
    id: p.id,
    owner_id: p.id,
    name: p.full_name,
    handle: p.username,
    description: p.bio ?? null,
    category: p.category ?? null,
    country: p.country ?? null,
    avatar_url: p.avatar_url ?? null,
    banner_url: p.banner_url ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

/* ── O meu perfil (ex-"O meu canal") ────────────────────── */
export const myChannelQuery = () =>
  queryOptions({
    queryKey: ["my-channel"],
    queryFn: async (): Promise<Channel | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, username, full_name, bio, avatar_url, banner_url, category, country, created_at, updated_at")
        .eq("id", session.user.id)
        .maybeSingle();
      return data ? mapProfileToChannel(data) : null;
    },
  });

/* ── Estatísticas (real — videos por owner_id + follows) ── */
export const channelStatsQuery = (ownerId: string | undefined) =>
  queryOptions({
    queryKey: ["channel-stats", ownerId],
    queryFn: async (): Promise<ChannelStats> => {
      const empty: ChannelStats = {
        total: 0, published: 0, views: 0,
        views_24h: 0, views_7d: 0, views_28d: 0,
        subs: 0, subs_gained_28d: 0, avg_watch_pct: 0,
        total_duration_seconds: 0, lastActivity: null,
      };
      if (!ownerId) return empty;

      const { data } = await supabase
        .from("videos")
        .select("status,visibility,views_count,duration_seconds,created_at")
        .eq("owner_id", ownerId);
      const rows = (data as any[] | null) ?? [];
      const total    = rows.length;
      const published = rows.filter(r => r.status === "published" && r.visibility === "public").length;
      const views    = rows.reduce((s, r) => s + (r.views_count ?? 0), 0);
      const duration = rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
      const lastActivity = rows.length
        ? rows.map(r => r.created_at).sort().reverse()[0] : null;

      /* Seguidores reais — já mantidos em profiles.followers_count pelo
         RPC toggle_follow, evita ter de saber o @username aqui */
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("followers_count")
        .eq("id", ownerId)
        .maybeSingle();

      return { ...empty, total, published, views, subs: prof?.followers_count ?? 0,
               total_duration_seconds: duration, lastActivity };
    },
    enabled: !!ownerId,
    refetchInterval: 30_000,
  });

/* ── Vistas diárias (últimos 28 dias) ───────────────────── */
export const dailyViewsQuery = (ownerId: string | undefined) =>
  queryOptions({
    queryKey: ["daily-views", ownerId],
    queryFn: async (): Promise<DailyViewRow[]> => {
      if (!ownerId) return [];
      try {
        const { data } = await (supabase as any)
          .from("video_views")
          .select("viewed_at")
          .eq("profile_id", ownerId)
          .gte("viewed_at", new Date(Date.now() - 28 * 86400_000).toISOString());
        const rows = (data as any[] | null) ?? [];
        const map: Record<string, number> = {};
        rows.forEach(r => {
          const day = r.viewed_at?.slice(0, 10) ?? "";
          if (day) map[day] = (map[day] ?? 0) + 1;
        });
        const result: DailyViewRow[] = [];
        for (let i = 27; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400_000);
          const key = d.toISOString().slice(0, 10);
          result.push({ day: key, views: map[key] ?? 0 });
        }
        return result;
      } catch (_) { return []; }
    },
    enabled: !!ownerId,
  });

/* ── Vistas por país ─────────────────────────────────────── */
export const viewsByCountryQuery = (ownerId: string | undefined) =>
  queryOptions({
    queryKey: ["views-by-country", ownerId],
    queryFn: async (): Promise<CountryRow[]> => {
      if (!ownerId) return [];
      try {
        const { data } = await (supabase as any)
          .from("video_views")
          .select("country, country_code")
          .eq("profile_id", ownerId)
          .not("country_code", "is", null);
        const rows = (data as any[] | null) ?? [];
        const map: Record<string, { views: number; name: string }> = {};
        rows.forEach(r => {
          const code = r.country_code;
          if (code) {
            if (!map[code]) map[code] = { views: 0, name: r.country ?? code };
            map[code].views++;
          }
        });
        return Object.entries(map)
          .map(([country, { views, name }]) => ({ country, views, name }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);
      } catch (_) { return []; }
    },
    enabled: !!ownerId,
  });

/* ── Top vídeos ─────────────────────────────────────────── */
export const topVideosQuery = (ownerId: string | undefined) =>
  queryOptions({
    queryKey: ["top-videos", ownerId],
    queryFn: async (): Promise<Video[]> => {
      if (!ownerId) return [];
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("visibility", "public")
        .order("views_count", { ascending: false })
        .limit(5);
      return (data as Video[] | null) ?? [];
    },
    enabled: !!ownerId,
  });
