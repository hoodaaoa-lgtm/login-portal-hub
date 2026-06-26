import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Channel = {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  description: string | null;
  category: string | null;
  country: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Video = {
  id: string;
  channel_id: string;
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

/* ── My Channel ─────────────────────────────────────────── */
export const myChannelQuery = () =>
  queryOptions({
    queryKey: ["my-channel"],
    queryFn: async (): Promise<Channel | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase
        .from("channels")
        .select("*")
        .eq("owner_id", session.user.id)
        .maybeSingle();
      return (data as Channel | null) ?? null;
    },
  });

/* ── My Videos ──────────────────────────────────────────── */
export const myVideosQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["my-videos", channelId],
    queryFn: async (): Promise<Video[]> => {
      if (!channelId) return [];
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false });
      return (data as Video[] | null) ?? [];
    },
    enabled: !!channelId,
  });

/* ── Channel Stats (real — usa channel_stats_view se existir,
      fallback para query directa) ─────────────────────── */
export const channelStatsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["channel-stats", channelId],
    queryFn: async (): Promise<ChannelStats> => {
      const empty: ChannelStats = {
        total: 0, published: 0, views: 0,
        views_24h: 0, views_7d: 0, views_28d: 0,
        subs: 0, subs_gained_28d: 0, avg_watch_pct: 0,
        total_duration_seconds: 0, lastActivity: null,
      };
      if (!channelId) return empty;

      /* Contar views directamente da tabela videos — evita erros da channel_stats_view */
      const { data } = await supabase
        .from("videos")
        .select("status,visibility,views_count,duration_seconds,created_at")
        .eq("channel_id", channelId);
      const rows = (data as any[] | null) ?? [];
      const total    = rows.length;
      const published = rows.filter(r => r.status === "published" && r.visibility === "public").length;
      const views    = rows.reduce((s, r) => s + (r.views_count ?? 0), 0);
      const duration = rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
      const lastActivity = rows.length
        ? rows.map(r => r.created_at).sort().reverse()[0] : null;

      /* Follows reais */
      const { count: subsCount } = await (supabase as any)
        .from("channel_follows")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId);

      return { ...empty, total, published, views, subs: subsCount ?? 0,
               total_duration_seconds: duration, lastActivity };
    },
    enabled: !!channelId,
    refetchInterval: 30_000,
  });

/* ── Vistas diárias (últimos 28 dias) ───────────────────── */
export const dailyViewsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["daily-views", channelId],
    queryFn: async (): Promise<DailyViewRow[]> => {
      if (!channelId) return [];
      try {
        const { data } = await (supabase as any)
          .from("video_views")
          .select("viewed_at")
          .eq("channel_id", channelId)
          .gte("viewed_at", new Date(Date.now() - 28 * 86400_000).toISOString());
        const rows = (data as any[] | null) ?? [];
        const map: Record<string, number> = {};
        rows.forEach(r => {
          const day = r.viewed_at?.slice(0, 10) ?? "";
          if (day) map[day] = (map[day] ?? 0) + 1;
        });
        /* Preenche todos os 28 dias */
        const result: DailyViewRow[] = [];
        for (let i = 27; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400_000);
          const key = d.toISOString().slice(0, 10);
          result.push({ day: key, views: map[key] ?? 0 });
        }
        return result;
      } catch (_) { return []; }
    },
    enabled: !!channelId,
  });

/* ── Vistas por país ─────────────────────────────────────── */
export const viewsByCountryQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["views-by-country", channelId],
    queryFn: async (): Promise<CountryRow[]> => {
      if (!channelId) return [];
      try {
        const { data } = await (supabase as any)
          .from("video_views")
          .select("country")
          .eq("channel_id", channelId)
          .not("country", "is", null);
        const rows = (data as any[] | null) ?? [];
        const map: Record<string, number> = {};
        rows.forEach(r => {
          if (r.country) map[r.country] = (map[r.country] ?? 0) + 1;
        });
        return Object.entries(map)
          .map(([country, views]) => ({ country, views }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);
      } catch (_) { return []; }
    },
    enabled: !!channelId,
  });

/* ── Top vídeos ─────────────────────────────────────────── */
export const topVideosQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["top-videos", channelId],
    queryFn: async (): Promise<Video[]> => {
      if (!channelId) return [];
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("channel_id", channelId)
        .eq("visibility", "public")
        .order("views_count", { ascending: false })
        .limit(5);
      return (data as Video[] | null) ?? [];
    },
    enabled: !!channelId,
  });
