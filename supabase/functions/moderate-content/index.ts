import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════
// Fase 6 — Moderação e conteúdo sensível
//
// Recebe { postId }, busca o texto do post (title/content/hashtags) e
// pede a um modelo de linguagem para o classificar numa das categorias:
// safe, sensitive, nudity, violence, harassment, spam, scam, illegal.
// Grava o resultado em posts.moderation_status/is_sensitive e em
// content_moderation_log (auditoria).
//
// Nesta primeira etapa a classificação é só de TEXTO (título, legenda,
// hashtags). Classificação multimodal de imagem/vídeo (frames + áudio)
// é mais cara e fica para uma 2ª etapa, a correr assíncrona num worker
// à parte — ver .lovable/plan.md, Fase 2b.
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY       = Deno.env.get("LOVABLE_API_KEY")!;

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const VALID_CATEGORIES = [
  "safe", "sensitive", "nudity", "violence", "harassment", "spam", "scam", "illegal",
] as const;
type Category = typeof VALID_CATEGORIES[number];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Pede ao modelo para classificar o texto e devolve um objeto estruturado. */
async function classifyText(input: {
  title: string | null;
  content: string | null;
  hashtags: string[] | null;
}): Promise<{ category: Category; confidence: number; keywords: string[]; sentiment: string }> {
  const textBlob = [
    input.title ? `Título: ${input.title}` : null,
    input.content ? `Conteúdo: ${input.content}` : null,
    input.hashtags?.length ? `Hashtags: ${input.hashtags.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const systemPrompt =
    "Classificas conteúdo de uma rede social quanto à segurança. " +
    "Responde APENAS com um objeto JSON válido, sem markdown, sem texto extra, " +
    "no formato exato: " +
    `{"category":"safe|sensitive|nudity|violence|harassment|spam|scam|illegal","confidence":0-100,"keywords":["..."],"sentiment":"positivo|neutro|negativo"}. ` +
    "'sensitive' é para conteúdo ambíguo que pode incomodar mas não viola claramente as regras. " +
    "'illegal' só para conteúdo que incentiva ou descreve atos claramente ilegais (ex.: abuso infantil, terrorismo, tráfico). " +
    "Sê conservador: na dúvida entre 'safe' e 'sensitive', escolhe 'sensitive'.";

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textBlob || "(sem texto)" },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
  const clean = raw.replace(/```json|```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Se o modelo não devolver JSON válido, cai no lado seguro: marca como
    // 'sensitive' para revisão humana em vez de assumir 'safe' às cegas.
    return { category: "sensitive", confidence: 0, keywords: [], sentiment: "neutro" };
  }

  const category: Category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "sensitive";
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 0;
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [];
  const sentiment = typeof parsed.sentiment === "string" ? parsed.sentiment : "neutro";

  return { category, confidence, keywords, sentiment };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: post, error: fetchErr } = await supabase
      .from("posts")
      .select("id,title,content,hashtags,moderation_status")
      .eq("id", postId)
      .maybeSingle();

    if (fetchErr || !post) return json({ error: "Post não encontrado" }, 404);

    // Se já foi marcado 'spam' pelo trigger heurístico na BD, não sobrepomos
    // essa decisão com a classificação de IA (o heurístico já é definitivo).
    if (post.moderation_status === "spam") {
      return json({ skipped: true, reason: "already flagged as spam" });
    }

    const result = await classifyText({
      title: post.title,
      content: post.content,
      hashtags: post.hashtags,
    });

    const { error: rpcErr } = await supabase.rpc("apply_content_moderation", {
      p_post_id: postId,
      p_category: result.category,
      p_confidence: result.confidence,
      p_raw_result: result,
    });

    if (rpcErr) {
      // Fallback: gravar diretamente (service role ignora RLS de qualquer forma).
      await supabase.from("posts").update({
        moderation_status: result.category,
        moderation_categories: result,
        is_sensitive: ["sensitive", "nudity", "violence", "harassment"].includes(result.category),
        moderation_checked_at: new Date().toISOString(),
      }).eq("id", postId);

      await supabase.from("content_moderation_log").insert({
        post_id: postId,
        category: result.category,
        confidence: result.confidence,
        raw_result: result,
      });
    }

    // Nota: conteúdo 'illegal' já fica automaticamente invisível para o
    // público (RLS de posts) e o registo em content_moderation_log serve
    // de fila de revisão para o admin (categoria + confiança + palavras-chave).

    return json({ success: true, ...result });
  } catch (err: any) {
    console.error("moderate-content error:", err);
    return json({ error: err.message ?? "Erro interno" }, 500);
  }
});
