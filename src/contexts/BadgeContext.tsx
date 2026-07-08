import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

interface BadgeContextValue {
  /** Total de mensagens não lidas em todas as conversas */
  unreadMessages: number;
  /** Total de notificações não lidas (seguidores, likes, comentários, etc.) */
  unreadNotifications: number;
  /** Chamar quando o utilizador abre/lê uma conversa específica */
  markMessagesRead: (conversationId: string) => void;
}

const BadgeContext = createContext<BadgeContextValue>({
  unreadMessages: 0,
  unreadNotifications: 0,
  markMessagesRead: () => {},
});

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  /* ─── Notificações: total de não lidas ─── */
  const refreshUnreadNotifications = useCallback(async (uid: string) => {
    try {
      const { count, error } = await db
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("read", false);
      if (error) throw error;
      setUnreadNotifications(count || 0);
    } catch (err) {
      console.error("[badges] Erro ao calcular notificações não lidas:", err);
    }
  }, []);

  // IDs das conversas do utilizador — usados para filtrar eventos realtime
  const conversationIdsRef = useRef<Set<string>>(new Set());

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
      setUnreadNotifications(0);
      conversationIdsRef.current = new Set();
      return;
    }
    refreshUnreadMessages(userId);
    refreshUnreadNotifications(userId);
  }, [userId, refreshUnreadMessages, refreshUnreadNotifications]);

  /* ─── Realtime: notificações ─── */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`badges-notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        refreshUnreadNotifications(userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshUnreadNotifications]);

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

  /* ─── Ações expostas: zerar contadores ─── */
  // A página de chat já faz o UPDATE messages.status='read' ao abrir a conversa.
  // Aqui apenas recalculamos o contador para refletir isso imediatamente na navegação.
  const markMessagesRead = useCallback((_conversationId: string) => {
    if (!userId) return;
    refreshUnreadMessages(userId);
  }, [userId, refreshUnreadMessages]);

  return (
    <BadgeContext.Provider value={{ unreadMessages, unreadNotifications, markMessagesRead }}>
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgeContext);
}
