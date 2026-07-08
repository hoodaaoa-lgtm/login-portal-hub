import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /* ── Verificar chave de admin ── */
  const key = req.headers.get("x-admin-key");
  const secret = Deno.env.get("ADMIN_SECRET_KEY");
  if (!key || key !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  /* ── Cliente Supabase com acesso total ── */
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    /* ── STATS ── */
    if (action === "stats") {
      const [vidRes, userRes, chRes] = await Promise.all([
        db.from("videos").select("views_count").eq("status", "published"),
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("channels").select("id", { count: "exact", head: true }),
      ]);
      const totalViews = (vidRes.data ?? []).reduce((s: number, v: any) => s + (v.views_count ?? 0), 0);
      return Response.json({
        videos: vidRes.data?.length ?? 0,
        users: userRes.count ?? 0,
        channels: chRes.count ?? 0,
        views: totalViews,
      }, { headers: CORS });
    }

    /* ── LISTAR VÍDEOS ── */
    if (action === "videos") {
      const page    = Number(body.page ?? 0);
      const limit   = Number(body.limit ?? 12);
      const search  = body.search ?? "";
      const from    = page * limit;
      const to      = from + limit - 1;

      let q = db.from("videos")
        .select("id,title,thumbnail_url,duration_seconds,views_count,likes_count,status,visibility,published_at,created_at,cf_embed_url,description,channels(name,handle)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);

      const { data, count, error } = await q;
      if (error) throw error;
      return Response.json({ data, total: count ?? 0 }, { headers: CORS });
    }

    /* ── APAGAR VÍDEO ── */
    if (action === "delete_video") {
      const { id } = body;
      if (!id) return Response.json({ error: "id obrigatório" }, { status: 400, headers: CORS });
      const { error } = await db.from("videos").delete().eq("id", id);
      if (error) throw error;
      return Response.json({ ok: true }, { headers: CORS });
    }

    /* ── FILA DE MODERAÇÃO — recursos pendentes de posts sinalizados ── */
    if (action === "moderation_queue") {
      const { data, error } = await db
        .from("content_moderation_appeals")
        .select("id,post_id,user_id,reason,status,original_status,created_at,posts(content,title,moderation_status,is_sensitive,photo_url,thumbnail_url)")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return Response.json({ data }, { headers: CORS });
    }

    /* ── RESOLVER RECURSO — aprovar (volta a 'safe') ou rejeitar (mantém) ── */
    if (action === "resolve_appeal") {
      const { appealId, approve, note } = body;
      if (!appealId || typeof approve !== "boolean") {
        return Response.json({ error: "appealId e approve (boolean) obrigatórios" }, { status: 400, headers: CORS });
      }
      const { error } = await db.rpc("resolve_moderation_appeal", {
        p_appeal_id: appealId, p_approve: approve, p_note: note ?? null,
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: CORS });
    }

    /* ── LOG DE MODERAÇÃO — auditoria recente (posts sinalizados pela IA) ── */
    if (action === "moderation_log") {
      const limit = Number(body.limit ?? 50);
      const { data, error } = await db
        .from("content_moderation_log")
        .select("id,post_id,category,confidence,raw_result,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return Response.json({ data }, { headers: CORS });
    }

    return Response.json({ error: "Acção desconhecida" }, { status: 400, headers: CORS });

  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500, headers: CORS });
  }
});
