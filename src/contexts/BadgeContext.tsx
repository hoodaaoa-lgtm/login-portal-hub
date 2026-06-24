import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

interface BadgeContextValue {
  /** Total de mensagens não lidas em todas as conversas */
  unreadMessages: number;
  /** Total de novas publicações + comentários desde a última visita, somado em todas as comunidades */
  unreadCommunities: number;
  /** Chamar quando o utilizador abre/lê uma conversa específica */
  markMessagesRead: (conversationId: string) => void;
  /** Chamar quando o utilizador abre uma comunidade específica */
  markCommunityVisited: (communityId: string) => void;
}

const BadgeContext = createContext<BadgeContextValue>({
  unreadMessages: 0,
  unreadCommunities: 0,
  markMessagesRead: () => {},
  markCommunityVisited: () => {},
});

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadCommunities, setUnreadCommunities] = useState(0);

  // IDs das conversas/comunidades do utilizador — usados para filtrar eventos realtime
  const conversationIdsRef = useRef<Set<string>>(new Set());
  const communityIdsRef = useRef<Set<string>>(new Set());
  const lastVisitRef = useRef<Map<string, string>>(new Map()); // community_id -> ISO timestamp

  /* ─── Mensagens: total de não lidas em todas as conversas do utilizador ─── */
  const refreshUnreadMessages = useCallback(async (uid: string) => {
    try {
      const { data: parts, error: partsErr } = await db
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", uid);
      if (partsErr) throw partsErr;

      const convIds: string[] = (parts || []).map((p: any) => p.conversation_id);
      conversationIdsRef.current = new Set(convIds);

      if (convIds.length === 0) { setUnreadMessages(0); return; }

      const { count, error } = await db
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender_id", uid)
        .neq("status", "read");
      if (error) throw error;

      setUnreadMessages(count || 0);
    } catch (err) {
      console.error("[badges] Erro ao calcular mensagens não lidas:", err);
    }
  }, []);

  /* ─── Comunidades: total de posts + comentários novos desde a última visita ─── */
  const refreshUnreadCommunities = useCallback(async (uid: string) => {
    try {
      const { data: memberships, error: memErr } = await db
        .from("community_members")
        .select("community_id")
        .eq("user_id", uid);
      if (memErr) throw memErr;

      const communityIds: string[] = (memberships || []).map((m: any) => m.community_id);
      communityIdsRef.current = new Set(communityIds);

      if (communityIds.length === 0) { setUnreadCommunities(0); return; }

      const { data: visits, error: visitsErr } = await db
        .from("community_visits")
        .select("community_id,last_visited_at")
        .eq("user_id", uid)
        .in("community_id", communityIds);
      if (visitsErr) throw visitsErr;

      const visitMap = new Map<string, string>();
      for (const v of visits || []) visitMap.set(v.community_id, v.last_visited_at);
      lastVisitRef.current = visitMap;

      // Época distante para comunidades nunca visitadas — conta tudo como novo
      const EPOCH = "1970-01-01T00:00:00.000Z";
      const oldestSince = communityIds.reduce((min, cid) => {
        const since = visitMap.get(cid) || EPOCH;
        return since < min ? since : min;
      }, new Date().toISOString());

      // Contar posts novos em comunidades que o utilizador é membro
      const { count: postCount, error: postErr } = await db
        .from("community_posts")
        .select("*", { count: "exact", head: true })
        .in("community_id", communityIds)
        .neq("author_id", uid)
        .gte("created_at", oldestSince);
      if (postErr) throw postErr;

      // Verificar cada comunidade vs. a última visita individual
      let total = 0;
      for (const cid of communityIds) {
        const since = visitMap.get(cid) || EPOCH;
        const { count, error: cErr } = await db
          .from("community_posts")
          .select("*", { count: "exact", head: true })
          .eq("community_id", cid)
          .neq("author_id", uid)
          .gte("created_at", since);
        if (!cErr && count && count > 0) total++;
      }

      setUnreadCommunities(total);
    } catch (err) {
      console.error("[badges] Erro ao calcular comunidades não lidas:", err);
    }
  }, []);

  /* ─── Sessão inicial + mudanças de auth ─── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setUnreadMessages(0);
      setUnreadCommunities(0);
      conversationIdsRef.current = new Set();
      communityIdsRef.current = new Set();
      return;
    }
    refreshUnreadMessages(userId);
    refreshUnreadCommunities(userId);
  }, [userId, refreshUnreadMessages, refreshUnreadCommunities]);

  /* ─── Realtime: mensagens ─── */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`badges-messages-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload: any) => {
        const row = payload.new || payload.old;
        if (!row || !conversationIdsRef.current.has(row.conversation_id)) return;
        refreshUnreadMessages(userId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${userId}` }, () => {
        refreshUnreadMessages(userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshUnreadMessages]);

  /* ─── Realtime: comunidades (posts, comentários, membership, visitas) ─── */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`badges-communities-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload: any) => {
        const row = payload.new;
        if (!row?.community_id || !communityIdsRef.current.has(row.community_id)) return;
        if (row.author_id === userId) return;
        refreshUnreadCommunities(userId);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments" }, () => {
        // Não sabemos a community_id sem fazer join; recalcular é barato e seguro
        refreshUnreadCommunities(userId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_members", filter: `user_id=eq.${userId}` }, () => {
        refreshUnreadCommunities(userId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_visits", filter: `user_id=eq.${userId}` }, () => {
        refreshUnreadCommunities(userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshUnreadCommunities]);

  /* ─── Ações expostas: zerar contadores ─── */
  // A página de chat já faz o UPDATE messages.status='read' ao abrir a conversa.
  // Aqui apenas recalculamos o contador para refletir isso imediatamente na navegação.
  const markMessagesRead = useCallback((_conversationId: string) => {
    if (!userId) return;
    refreshUnreadMessages(userId);
  }, [userId, refreshUnreadMessages]);

  const markCommunityVisited = useCallback((communityId: string) => {
    if (!userId) return;
    db.rpc("mark_community_visited", { p_community_id: communityId })
      .then(({ error }: any) => {
        if (error) {
          console.error("[badges] Erro ao marcar comunidade como visitada:", error);
          return;
        }
        lastVisitRef.current.set(communityId, new Date().toISOString());
        refreshUnreadCommunities(userId);
      });
  }, [userId, refreshUnreadCommunities]);

  return (
    <BadgeContext.Provider value={{ unreadMessages, unreadCommunities, markMessagesRead, markCommunityVisited }}>
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgeContext);
}
