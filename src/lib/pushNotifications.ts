import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

// Chave pública VAPID — gerada uma vez para o projecto e definida no build
// (par com VAPID_PRIVATE_KEY guardada como secret na Edge Function send-push).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Pede permissão de notificações ao utilizador e, se aceite, subscreve o
 * push real (funciona mesmo com o site fechado) guardando a subscrição
 * na tabela push_subscriptions.
 */
export async function enablePushNotifications(userId: string): Promise<"granted" | "denied" | "unsupported" | "no-vapid-key"> {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) {
    console.warn("[push] VITE_VAPID_PUBLIC_KEY não configurada — só notificações locais (tab aberto) vão funcionar.");
    return "no-vapid-key";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON() as any;
    await db.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );

    return "granted";
  } catch (err) {
    console.error("[push] erro ao subscrever:", err);
    return "denied";
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (err) {
    console.error("[push] erro ao cancelar subscrição:", err);
  }
}
