import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════
// Fase 2 — Classificação automática de conteúdo (texto → vídeo)
//
// Recebe { postId }, busca título/conteúdo/hashtags do post e pede a um
// modelo de linguagem para o classificar em uma ou mais categorias da
// taxonomia global (com percentagem de confiança cada), mais palavras-chave,
// entidades e sentimento. Grava tudo em post_classifications.
//
// Categorias fora da taxonomia atual são criadas automaticamente como
// subcategorias (is_auto = true) via upsert_content_category — assim a
// taxonomia cresce sozinha em vez de ficar presa à lista inicial.
//
// Nesta 1ª etapa a classificação é só de TEXTO. Vídeo/imagem (frames +
// transcrição, via Gemini multimodal) é a 2ª etapa, mais cara, e deve
// correr assíncrona num worker à parte — ver .lovable/plan.md.
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY      = Deno.env.get("LOVABLE_API_KEY")!;

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const BASE_CATEGORIES = [
  "tecnologia", "programacao", "ia", "jogos", "musica", "esportes",
  "fotografia", "negocios", "educacao", "ciencia", "moda", "viagens",
  "automoveis", "cinema", "culinaria", "arte", "humor",
];

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

function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "geral";
}

type CategoryResult = { slug: string; name: string; score: number; parent?: string | null };

async function classifyText(input: {
  title: string | null;
  content: string | null;
  hashtags: string[] | null;
}): Promise<{ categories: CategoryResult[]; keywords: string[]; entities: string[]; sentiment: string }> {
  const textBlob = [
    input.title ? `Título: ${input.title}` : null,
    input.content ? `Conteúdo: ${input.content}` : null,
    input.hashtags?.length ? `Hashtags: ${input.hashtags.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const systemPrompt =
    "Classificas conteúdo de uma rede social por tema. Taxonomia base (usa o slug quando aplicável): " +
    `${BASE_CATEGORIES.join(", ")}. ` +
    "Se o conteúdo pertencer claramente a um tema mais específico que não existe na lista (ex.: 'react', " +
    "'futebol', filho de 'programacao'/'esportes'), podes criar uma subcategoria nova — indica o pai em 'parent'. " +
    "Responde APENAS com um objeto JSON válido, sem markdown, sem texto extra, no formato exato: " +
    `{"categories":[{"slug":"...","name":"...","score":0-100,"parent":"slug_pai_ou_null"}],` +
    `"keywords":["..."],"entities":["..."],"sentiment":"positivo|neutro|negativo"}. ` +
    "Devolve entre 1 e 4 categorias, ordenadas da mais para a menos relevante, cada uma com a sua própria 'score'. " +
    "Se não conseguires perceber o tema (texto vazio, ambíguo), usa uma única categoria {\"slug\":\"geral\",\"name\":\"Geral\",\"score\":0,\"parent\":null}.";

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
    return {
      categories: [{ slug: "geral", name: "Geral", score: 0, parent: null }],
      keywords: [], entities: [], sentiment: "neutro",
    };
  }

  const categories: CategoryResult[] = Array.isArray(parsed.categories) && parsed.categories.length
    ? parsed.categories.slice(0, 4).map((c: any) => ({
        slug: slugify(String(c.slug ?? c.name ?? "geral")),
        name: String(c.name ?? c.slug ?? "Geral"),
        score: typeof c.score === "number" ? Math.max(0, Math.min(100, c.score)) : 0,
        parent: c.parent ? slugify(String(c.parent)) : null,
      }))
    : [{ slug: "geral", name: "Geral", score: 0, parent: null }];

  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10).map(String) : [];
  const entities = Array.isArray(parsed.entities) ? parsed.entities.slice(0, 10).map(String) : [];
  const sentiment = typeof parsed.sentiment === "string" ? parsed.sentiment : "neutro";

  return { categories, keywords, entities, sentiment };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: post, error: fetchErr } = await supabase
      .from("posts")
      .select("id,title,content,hashtags")
      .eq("id", postId)
      .maybeSingle();

    if (fetchErr || !post) return json({ error: "Post não encontrado" }, 404);

    const result = await classifyText({
      title: (post as any).title ?? null,
      content: (post as any).content ?? null,
      hashtags: (post as any).hashtags ?? null,
    });

    // Garante que qualquer subcategoria nova entra na taxonomia global
    // antes de gravar a classificação (não bloqueia se uma falhar).
    for (const c of result.categories) {
      if (!BASE_CATEGORIES.includes(c.slug)) {
        await supabase.rpc("upsert_content_category", {
          p_slug: c.slug, p_name: c.name, p_parent_slug: c.parent,
        }).catch((e: unknown) => console.error("upsert_content_category falhou:", e));
      }
    }

    const { error: rpcErr } = await supabase.rpc("apply_content_classification", {
      p_post_id: postId,
      p_categories: result.categories,
      p_keywords: result.keywords,
      p_entities: result.entities,
      p_sentiment: result.sentiment,
      p_source: "text",
    });

    if (rpcErr) {
      return json({ error: rpcErr.message }, 500);
    }

    return json({ ok: true, ...result });
  } catch (e) {
    console.error("classify-content error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
