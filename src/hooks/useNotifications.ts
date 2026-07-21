import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Notif, NotifType } from "@/components/Notifications";
import { playNotificationSound } from "@/lib/notificationSound";

const db = supabase as any;

const AVATAR_COLORS = ["#2F6FED", "#2F6FED", "#2F6FED", "#1FAFA6", "#3B82F6", "#F59E0B"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function textFor(type: NotifType): string {
  switch (type) {
    case "follow":        return "começou a acompanhar-te";
    case "like":          return "gostou da tua publicação";
    case "comment":       return "comentou a tua publicação";
    case "mention":       return "mencionou-te";
    case "message":       return "enviou-te uma mensagem";
    case "share":         return "partilhou a tua publicação";
    case "video_new":     return "publicou um vídeo novo";
    case "video_like":    return "gostou do teu vídeo";
    case "video_comment": return "comentou o teu vídeo";
    case "sala_add":      return "adicionou-te a um grupo";
    case "system":        return "Verifica o teu Gmail para confirmares a tua conta";
    default:              return "";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

async function mapRow(
  row: any,
  profilesCache: Map<string, any>,
  salasCache?: Map<string, { nome: string; slug: string }>,
): Promise<Notif> {
  const profile = row.actor_id ? profilesCache.get(row.actor_id) : null;
  const name = row.type === "system" ? "hooda" : (profile?.full_name || row.actor_username || "Alguém");
  const sala = row.sala_id ? salasCache?.get(row.sala_id) : null;
  return {
    id: row.id,
    type: row.type as NotifType,
    user: row.actor_username || "",
    name,
    color: profile?.avatar_color || colorFor(row.actor_username || row.id),
    text: textFor(row.type as NotifType),
    detail: sala?.nome,
    salaSlug: sala?.slug,
    time: timeAgo(row.created_at),
    read: row.read,
  };
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Notif | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const loadProfiles = useCallback(async (actorIds: string[]) => {
    const cache = new Map<string, any>();
    const ids = [...new Set(actorIds.filter(Boolean))];
    if (ids.length === 0) return cache;
    const { data } = await db.from("profiles").select("id, full_name, username, avatar_color, avatar_url").in("id", ids);
    (data || []).forEach((p: any) => cache.set(p.id, p));
    return cache;
  }, []);

  // Usado só pela notificação "sala_add" — nome + slug da sala para o
  // texto ("Fulano adicionou-te ao grupo X") e para navegar ao clicar.
  const loadSalas = useCallback(async (salaIds: string[]) => {
    const cache = new Map<string, { nome: string; slug: string }>();
    const ids = [...new Set(salaIds.filter(Boolean))];
    if (ids.length === 0) return cache;
    const { data } = await db.from("salas").select("id, nome, slug").in("id", ids);
    (data || []).forEach((s: any) => cache.set(s.id, { nome: s.nome, slug: s.slug }));
    return cache;
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .neq("type", "message") // mensagens ficam só na aba Mensagens, não aparecem no sino
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;

      const profilesCache = await loadProfiles((data || []).map((r: any) => r.actor_id));
      const salasCache = await loadSalas((data || []).map((r: any) => r.sala_id));
      const mapped = await Promise.all((data || []).map((r: any) => mapRow(r, profilesCache, salasCache)));
      setNotifications(mapped);
    } catch (err) {
      console.error("[notifications] erro ao carregar:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, loadProfiles, loadSalas]);

  useEffect(() => {
    if (!userId) { setNotifications([]); return; }
    refresh();
  }, [userId, refresh]);

  /* ─── Realtime: nova notificação chega ao vivo ─── */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        async (payload: any) => {
          const row = payload.new;
          const profilesCache = await loadProfiles([row.actor_id]);
          const salasCache = await loadSalas([row.sala_id]);
          const notif = await mapRow(row, profilesCache, salasCache);

          // Mensagens não entram na lista persistente do sino (ficam só na
          // aba Mensagens), mas têm de aparecer como toast na hora — é
          // assim que o utilizador sabe quem lhe mandou mensagem sem ter
          // de abrir a conversa às cegas.
          if (row.type !== "message") {
            setNotifications((prev) => [notif, ...prev]);
          }

          playNotificationSound();

          setToast(notif);
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 5000);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const row = payload.new;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, read: row.read } : n)));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, loadProfiles, loadSalas]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await db.rpc("mark_notifications_read", { p_ids: null });
    } catch (err) {
      console.error("[notifications] erro ao marcar lidas:", err);
    }
  }, [userId]);

  const markOneRead = useCallback(async (id: string | number) => {
    setNotifications((prev) => prev.map((n) => (String(n.id) === String(id) ? { ...n, read: true } : n)));
    try {
      await db.rpc("mark_notifications_read", { p_ids: [id] });
    } catch (err) {
      console.error("[notifications] erro ao marcar lida:", err);
    }
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  return { notifications, unreadCount, loading, toast, dismissToast, markAllRead, markOneRead, refresh };
}
