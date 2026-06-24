// ── React Query Client — cache inteligente + persistência IndexedDB ──
//
// Estratégia stale-while-revalidate:
//   1. Ao abrir a página → dados do IndexedDB aparecem instantaneamente
//   2. Em segundo plano → React Query faz refetch silencioso
//   3. UI atualiza SÓ SE houver alterações — nunca ecrã vazio
//
// Tempos de cache por tipo de conteúdo:
//   - Feed / Posts:          60s stale,  10min gcTime
//   - Conversas:             30s stale,  15min gcTime
//   - Mensagens:             15s stale,  10min gcTime
//   - Comunidades:           2min stale, 20min gcTime
//   - Notificações:          30s stale,  10min gcTime
//   - Perfis visitados:      5min stale, 30min gcTime
//   - Avatares / Estáticos: 10min stale, 60min gcTime
//
import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

export const queryDefaultOptions: DefaultOptions = {
  queries: {
    // stale-while-revalidate: mostra dados em cache E refaz fetch em background
    refetchOnWindowFocus: true,     // atualiza ao voltar ao tab (como WhatsApp)
    refetchOnReconnect: true,       // atualiza ao recuperar ligação
    refetchOnMount: true,           // sempre verifica ao montar (silencioso se em cache)
    staleTime: 60_000,              // dados válidos 60s por defeito
    gcTime: 10 * 60_000,            // mantém cache 10min mesmo sem uso
    retry: 1,
    // Comportamento chave: quando há dados em cache, mostra-os imediatamente
    // e faz refetch silencioso — nunca mostra loading se há cache
    placeholderData: (prev: unknown) => prev,
  },
  mutations: {
    retry: 0,
  },
};

export function createAppQueryClient() {
  return new QueryClient({ defaultOptions: queryDefaultOptions });
}

/** Instância usada apenas no browser (singleton por aba). */
export const queryClient = createAppQueryClient();

/** Chaves de cache padronizadas */
export const QUERY_KEYS = {
  feed: (uid: string) => ["feed", uid],
  profile: (uid: string) => ["profile", uid],
  profileByUsername: (username: string) => ["profile", "username", username],
  stories: (uid: string) => ["stories", uid],
  conversations: (uid: string) => ["conversations", uid],
  messages: (convId: string) => ["messages", convId],
  notifications: (uid: string) => ["notifications", uid],
  community: (id: string) => ["community", id],
  communityMessages: (id: string) => ["communityMessages", id],
  communityMembers: (id: string) => ["communityMembers", id],
  communityList: (uid: string) => ["communityList", uid],
  comments: (postId: string) => ["comments", postId],
} as const;

/** Opções de cache para conteúdo que muda frequentemente (mensagens, notificações) */
export const REALTIME_QUERY_OPTIONS = {
  staleTime: 15_000,      // 15s — refetch silencioso rápido
  gcTime: 10 * 60_000,    // mantém 10min em memória
} as const;

/** Opções de cache para conversas */
export const CONVERSATIONS_QUERY_OPTIONS = {
  staleTime: 30_000,      // 30s
  gcTime: 15 * 60_000,    // 15min
} as const;

/** Opções de cache para feed / posts */
export const FEED_QUERY_OPTIONS = {
  staleTime: 60_000,      // 1min
  gcTime: 10 * 60_000,    // 10min
} as const;

/** Opções de cache para comunidades */
export const COMMUNITY_QUERY_OPTIONS = {
  staleTime: 2 * 60_000,  // 2min
  gcTime: 20 * 60_000,    // 20min
} as const;

/** Opções de cache para notificações */
export const NOTIFICATIONS_QUERY_OPTIONS = {
  staleTime: 30_000,      // 30s
  gcTime: 10 * 60_000,    // 10min
} as const;

/** Cache longa para conteúdo estático (avatares, capas, perfis visitados, etc.) */
export const STATIC_QUERY_OPTIONS = {
  staleTime: 10 * 60_000,   // 10 minutos
  gcTime: 60 * 60_000,      // 60 minutos
} as const;

/**
 * Pré-carrega o perfil de um utilizador (por username) para a cache do
 * React Query. Chamado em onMouseEnter/onTouchStart/onPointerDown nos
 * avatares e cartões de perfil, ANTES do clique terminar — assim, quando
 * a navegação acontece, os dados já estão (ou quase) na cache e o
 * skeleton aparece por uma fração de segundo, em vez de a página inteira
 * ficar à espera da rede.
 */
export async function prefetchProfileByUsername(username: string) {
  if (!username) return;
  const { supabase } = await import("@/integrations/supabase/client");
  await queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.profileByUsername(username),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,full_name,bio,avatar_url")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    ...STATIC_QUERY_OPTIONS,
  });
}
