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

export const channelStatsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["channel-stats", channelId],
    queryFn: async () => {
      if (!channelId) {
        return { total: 0, published: 0, views: 0, subs: 0, lastActivity: null as string | null };
      }
      const { data } = await supabase
        .from("videos")
        .select("status,views_count,created_at")
        .eq("channel_id", channelId);
      const rows = (data as { status: string; views_count: number; created_at: string }[] | null) ?? [];
      const total = rows.length;
      const published = rows.filter((r) => r.status === "published").length;
      const views = rows.reduce((sum, r) => sum + (r.views_count ?? 0), 0);
      const lastActivity = rows.length
        ? rows.map((r) => r.created_at).sort().reverse()[0]
        : null;
      return { total, published, views, subs: 0, lastActivity };
    },
    enabled: !!channelId,
  });
