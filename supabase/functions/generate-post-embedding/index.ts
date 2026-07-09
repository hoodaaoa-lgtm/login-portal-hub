import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════
// Fase 6 — Embedding semântico de posts (feed inteligente)
//
// Recebe { postId }, monta o mesmo "textBlob" usado em classify-content
// (título + conteúdo + hashtags — e, quando existir, a transcrição do
// vídeo/áudio gerada por outro worker), pede um vetor de 768 dimensões ao
// gateway de IA, e grava em posts.embedding via RPC.
//
// IMPORTANTE — ponto a confirmar antes de ligar isto em produção: este
// código assume que o gateway da Lovable expõe um endpoint de embeddings
// compatível com o formato OpenAI (POST /v1/embeddings, resposta
// { data: [{ embedding: number[] }] }), pelo mesmo padrão que
// ai.gateway.lovable.dev/v1/chat/completions já usa para chat. Os docs da
// Lovable confirmam suporte a "embedding models" na plataforma, mas o
// nome exato do modelo (ex.: "google/text-embedding-004" vs. outro) deve
// ser conferido em docs.lovable.dev/integrations/ai → AI Gateway → Models
// antes do primeiro deploy — ajustar a constante EMBEDDING_MODEL abaixo.
//
// Chamar depois de classify-content (ou em paralelo — não depende um do
// outro), tipicamente disparado pelo mesmo trigger/webhook de "post criado".
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY      = Deno.env.get("LOVABLE_API_KEY")!;

const AI_GATEWAY_EMBEDDINGS_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
// 768 dimensões para bater certo com posts.embedding vector(768) (migração
// 20260709140000_pgvector_embeddings.sql). Se o modelo escolhido só devolver
// 1536 (ex.: text-embedding-3-small sem truncar), ou mudar a coluna para
// vector(1536), ou pedir truncagem via parâmetro "dimensions" se o gateway
// suportar (nem todo provider aceita esse parâmetro).
const EMBEDDING_MODEL = "google/text-embedding-004";
const EMBEDDING_DIMENSIONS = 768;

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

// Mesma lógica de textBlob do classify-content — mantém os dois pipelines
// a "ver" exatamente o mesmo texto do post, para categorias e embedding
// nunca discordarem sobre do que o post trata.
function buildTextBlob(input: {
  title: string | null;
  content: string | null;
  hashtags: string[] | null;
  transcript?: string | null;
}): string {
  return [
    input.title ? `Título: ${input.title}` : null,
    input.content ? `Conteúdo: ${input.content}` : null,
    input.hashtags?.length ? `Hashtags: ${input.hashtags.join(", ")}` : null,
    input.transcript ? `Transcrição: ${input.transcript}` : null,
  ].filter(Boolean).join("\n");
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(AI_GATEWAY_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text || "(sem texto)",
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI gateway (embeddings) error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;

  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error("Resposta do gateway sem embedding válido");
  }
  return vec;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: post, error: fetchErr } = await supabase
      .from("posts")
      .select("id,title,content,hashtags,transcript")
      .eq("id", postId)
      .maybeSingle();

    if (fetchErr || !post) return json({ error: "Post não encontrado" }, 404);

    const textBlob = buildTextBlob({
      title: (post as any).title ?? null,
      content: (post as any).content ?? null,
      hashtags: (post as any).hashtags ?? null,
      // Campo opcional — só existe se houver pipeline de transcrição de
      // vídeo/áudio; se a coluna não existir na tabela, o select acima
      // falha e cai no catch geral. Remover "transcript" do select se o
      // projeto ainda não tiver essa coluna.
      transcript: (post as any).transcript ?? null,
    });

    if (!textBlob.trim()) {
      // Post sem nenhum texto (ex.: só foto, sem legenda) — não é erro,
      // simplesmente não entra no espaço semântico ainda. O ranking já
      // trata embedding NULL como neutro (nem penaliza, nem beneficia).
      return json({ ok: true, skipped: true, reason: "sem texto para gerar embedding" });
    }

    const embedding = await embedText(textBlob);

    const { error: rpcErr } = await supabase.rpc("set_post_embedding", {
      p_post_id: postId,
      p_embedding: embedding,
    });

    if (rpcErr) return json({ error: rpcErr.message }, 500);

    return json({ ok: true, dimensions: embedding.length });
  } catch (e) {
    console.error("generate-post-embedding error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
