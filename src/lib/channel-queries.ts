import { queryOptions } from "@tanstack/react-query";

// Tabelas 'channels' e 'videos' não existem neste projeto.
// Estas queries retornam valores vazios para evitar erros de TypeScript e runtime.

export const myChannelQuery = () =>
  queryOptions({
    queryKey: ["my-channel"],
    queryFn: async () => null,
  });

export const myVideosQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["my-videos", channelId],
    queryFn: async () => [] as any[],
    enabled: !!channelId,
  });

export const channelStatsQuery = (channelId: string | undefined) =>
  queryOptions({
    queryKey: ["channel-stats", channelId],
    queryFn: async () => ({ total: 0, published: 0, views: 0, lastActivity: null as string | null }),
    enabled: !!channelId,
  });
