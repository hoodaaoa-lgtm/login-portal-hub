import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Playlist = {
  id: string;
  channel_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_video_id: string | null;
  created_at: string;
  updated_at: string;
  /* joined */
  video_count?: number;
  cover_thumbnail_url?: string | null;
};

export type PlaylistVideo = {
  id: string;
  playlist_id: string;
  video_id: string;
  position: number;
  /* joined */
  video?: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    views_count: number;
    cf_embed_url: string | null;
    published_at: string | null;
    created_at: string;
  };
};

/* ── Playlists do meu canal (Studio) ────────────────────────────────────── */
export const myPlaylistsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["my-playlists", channelId],
    queryFn: async (): Promise<Playlist[]> => {
      if (!channelId) return [];
      const { data, error } = await (supabase as any)
        .from("playlists")
        .select(`
          *,
          cover_video:cover_video_id ( thumbnail_url ),
          playlist_videos ( id )
        `)
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as any[]) ?? []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.length ?? 0,
        cover_thumbnail_url: p.cover_video?.thumbnail_url ?? null,
        cover_video: undefined,
        playlist_videos: undefined,
      }));
    },
    enabled: !!channelId,
  });

/* ── Playlists de um canal público (HoodaTV) ────────────────────────────── */
export const channelPlaylistsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["channel-playlists", channelId],
    queryFn: async (): Promise<Playlist[]> => {
      if (!channelId) return [];
      const { data, error } = await (supabase as any)
        .from("playlists")
        .select(`
          *,
          cover_video:cover_video_id ( thumbnail_url ),
          playlist_videos ( id )
        `)
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as any[]) ?? []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.length ?? 0,
        cover_thumbnail_url: p.cover_video?.thumbnail_url ?? null,
        cover_video: undefined,
        playlist_videos: undefined,
      }));
    },
    enabled: !!channelId,
    staleTime: 60_000,
  });

/* ── Vídeos de uma playlist (ordenados) ─────────────────────────────────── */
export const playlistVideosQuery = (playlistId: string | undefined) =>
  queryOptions({
    queryKey: ["playlist-videos", playlistId],
    queryFn: async (): Promise<PlaylistVideo[]> => {
      if (!playlistId) return [];
      const { data, error } = await (supabase as any)
        .from("playlist_videos")
        .select(`
          *,
          video:video_id (
            id, title, thumbnail_url, duration_seconds,
            views_count, cf_embed_url, published_at, created_at
          )
        `)
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as PlaylistVideo[] | null) ?? [];
    },
    enabled: !!playlistId,
    staleTime: 60_000,
  });

/* ── Dados de uma playlist individual ──────────────────────────────────── */
export const playlistQuery = (playlistId: string | undefined) =>
  queryOptions({
    queryKey: ["playlist", playlistId],
    queryFn: async (): Promise<Playlist | null> => {
      if (!playlistId) return null;
      const { data, error } = await (supabase as any)
        .from("playlists")
        .select(`
          *,
          cover_video:cover_video_id ( thumbnail_url ),
          playlist_videos ( id )
        `)
        .eq("id", playlistId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        video_count: data.playlist_videos?.length ?? 0,
        cover_thumbnail_url: data.cover_video?.thumbnail_url ?? null,
        cover_video: undefined,
        playlist_videos: undefined,
      };
    },
    enabled: !!playlistId,
    staleTime: 60_000,
  });
