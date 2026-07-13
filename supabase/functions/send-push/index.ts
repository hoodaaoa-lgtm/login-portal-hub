import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// ═══════════════════════════════════════════════════════════════════════
// send-push
//
// Disparada automaticamente (Database Webhook) sempre que uma linha nova
// é inserida em public.notifications. Busca as push_subscriptions do
// destinatário e envia uma notificação push real (funciona mesmo com o
// site fechado, desde que o utilizador tenha aceitado as notificações e
// instalado/permitido o Service Worker).
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@hooda.co.ao";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function messageFor(type: string, actor: string | null): { title: string; body: string; icon: string } {
  const name = actor || "Alguém";
  const icon = "/icons/icon-192.png";
  switch (type) {
    case "message":       return { title: "Nova mensagem", body: `${name} enviou-te uma mensagem`, icon };
    case "follow":        return { title: "Novo seguidor", body: `${name} começou a seguir-te`, icon };
    case "like":          return { title: "Gostaram da tua publicação", body: `${name} gostou da tua publicação`, icon };
    case "comment":       return { title: "Novo comentário", body: `${name} comentou a tua publicação`, icon };
    case "mention":       return { title: "Foste mencionado", body: `${name} mencionou-te`, icon };
    case "share":         return { title: "Partilharam a tua publicação", body: `${name} partilhou a tua publicação`, icon };
    case "video_new":     return { title: "Vídeo novo", body: `${name} publicou um vídeo novo`, icon };
    case "video_like":    return { title: "Gostaram do teu vídeo", body: `${name} gostou do teu vídeo`, icon };
    case "video_comment": return { title: "Novo comentário no vídeo", body: `${name} comentou o teu vídeo`, icon };
    case "system":        return { title: "Baya", body: "Tens uma notificação nova", icon };
    default:              return { title: "Baya", body: "Tens uma notificação nova", icon };
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    if (!record?.user_id) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", record.user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { title, body, icon } = messageFor(record.type, record.actor_username);
    const pushPayload = JSON.stringify({
      title,
      body,
      icon,
      badge: "/icons/icon-96.png",
      tag: record.type,
      data: { url: record.type === "message" ? "/mensagens" : "/home?notifications=1", notificationId: record.id },
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
        );
        sent++;
      } catch (err: any) {
        // Subscrição expirada/inválida (410/404) -> remover
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send error:", err?.message || err);
        }
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (err: any) {
    console.error("send-push error:", err?.message || err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 200 });
  }
});
