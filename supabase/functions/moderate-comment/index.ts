import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════
// Fase 7 — Moderação de comentários
//
// Recebe { commentId }, busca o texto do comentário e pede a um modelo de
// linguagem para o classificar na mesma taxonomia usada em posts (safe,
// sensitive, nudity, violence, harassment, spam, scam, illegal). Comentários
// na Baya não têm media própria, por isso a análise é só de texto.
//
// Corre em segundo plano (fire-and-forget a partir do cliente, igual ao
// moderate-content) — nunca bloqueia o envio do comentário.
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY      = Deno.env.get("LOVABLE_API_KEY")!;

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

async function classifyCommentText(
  content: string,
): Promise<{ category: Category; confidence: number; keywords: string[] }> {
  const systemPrompt =
    "Classificas comentários de uma rede social quanto à segurança. " +
    "Procura: violência (incluindo descrições de mortes/ferimentos graves), assédio/ódio, " +
    "conteúdo sexual explícito descrito em texto, automutilação, spam e golpes. " +
    "Comentários que descrevem eventos violentos ou perturbadores em contexto jornalístico, " +
    "educativo ou de alerta/consciencialização NÃO devem ser 'illegal' — no máximo 'sensitive' " +
    "ou a categoria específica, para poder ficar visível com aviso em vez de removido. " +
    "Responde APENAS com um objeto JSON válido, sem markdown, sem texto extra, no formato exato: " +
    `{"category":"safe|sensitive|nudity|violence|harassment|spam|scam|illegal","confidence":0-100,"keywords":["..."]}. ` +
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
        { role: "user", content: content || "(vazio)" },
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
    return { category: "sensitive", confidence: 0, keywords: [] };
  }

  const category: Category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "sensitive";
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 0;
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [];

  return { category, confidence, keywords };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { commentId } = await req.json();
    if (!commentId) return json({ error: "commentId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: comment, error: fetchErr } = await supabase
      .from("post_comments")
      .select("id,content,moderation_checked_at")
      .eq("id", commentId)
      .maybeSingle();

    if (fetchErr || !comment) return json({ error: "Comentário não encontrado" }, 404);

    // Cache — nunca reanalisa o mesmo comentário duas vezes.
    if (comment.moderation_checked_at) {
      return json({ skipped: true, reason: "already analyzed (cached)" });
    }

    const result = await classifyCommentText(comment.content ?? "");

    const { error: rpcErr } = await supabase.rpc("apply_comment_moderation", {
      p_comment_id: commentId,
      p_category: result.category,
      p_confidence: result.confidence,
      p_raw_result: result,
    });

    if (rpcErr) {
      await supabase.from("post_comments").update({
        moderation_status: result.category,
        is_sensitive: ["sensitive", "nudity", "violence", "harassment"].includes(result.category),
        moderation_checked_at: new Date().toISOString(),
      }).eq("id", commentId);
    }

    return json({ success: true, ...result });
  } catch (err: any) {
    console.error("moderate-comment error:", err);
    return json({ error: err.message ?? "Erro interno" }, 500);
  }
});
