import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════════════
// Pesquisa inteligente do Explorar
//
// Recebe { query, candidates: [{id, type, text}] } — os candidatos já
// vêm do frontend (resultado das pesquisas ILIKE existentes, alargadas),
// e esta função pede a um modelo de linguagem (Lovable AI Gateway, mesma
// infra do classify-content — sem chave nova) para:
//   1. Perceber a INTENÇÃO da pesquisa, não só bater a palavra exata
//      (sinónimos, tema relacionado, erros de escrita, gíria).
//   2. Escolher, dos candidatos, só os que fazem mesmo sentido.
//   3. Ordenar por relevância real.
//   4. Escrever uma frase curta em português (Angola) a dizer o que
//      encontrou — mostrada antes dos resultados no Explorar.
//
// Continua stateless: não lê nem escreve na base de dados, só reordena/
// filtra o que o frontend já buscou. Se a IA falhar por qualquer razão,
// devolve os candidatos na ordem original (nunca fica sem resultado).
// ═══════════════════════════════════════════════════════════════════════

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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

type Candidate = { id: string; type: string; text: string };
type RankedItem = { id: string; type: string; score: number };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { query, candidates } = await req.json() as { query?: string; candidates?: Candidate[] };
    const q = (query ?? "").trim();
    const list = Array.isArray(candidates) ? candidates.slice(0, 60) : [];

    if (!q) return json({ summary: "", ranked: [] });
    if (list.length === 0) return json({ summary: "Ainda não há nada sobre isso na Hooda.", ranked: [] });

    // Cada candidato entra com um snippet curto — mantém o pedido leve e barato.
    const catalog = list
      .map((c, i) => `${i}. [${c.type}] ${(c.text || "").replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");

    const systemPrompt =
      "És o motor de pesquisa inteligente da Hooda, uma rede social. Recebes o termo que o " +
      "utilizador procurou e uma lista numerada de conteúdos candidatos (vídeos e publicações), " +
      "cada um com um pequeno resumo do texto. A tua tarefa:\n" +
      "1. Perceber a INTENÇÃO da pesquisa — considera sinónimos, temas relacionados, erros de " +
      "escrita comuns e gíria, não apenas a palavra exata.\n" +
      "2. Escolher, só entre os candidatos da lista, os que realmente fazem sentido para essa " +
      "pesquisa — ignora os que só partilham uma palavra mas não o tema.\n" +
      "3. Ordenar do mais para o menos relevante, com uma pontuação de 0 a 100 (só inclui score >= 40).\n" +
      "4. Escrever uma frase curta, natural, em português de Angola, a dizer o que encontraste — " +
      "ex: \"Encontrei alguns vídeos e publicações sobre futebol angolano.\" Se não houver nada " +
      "realmente relevante, diz isso com simpatia, sem inventar.\n" +
      "Responde APENAS com um objeto JSON válido, sem markdown, sem texto extra, no formato exato: " +
      '{"summary":"...","results":[{"index":0,"score":0-100}]}';

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
          { role: "user", content: `Pesquisa: "${q}"\n\nCandidatos:\n${catalog}` },
        ],
      }),
    });

    if (!res.ok) {
      // IA indisponível — devolve a lista original em vez de rebentar a pesquisa.
      return json({
        summary: "",
        ranked: list.map((c) => ({ id: c.id, type: c.type, score: 50 })),
      });
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return json({
        summary: "",
        ranked: list.map((c) => ({ id: c.id, type: c.type, score: 50 })),
      });
    }

    const results: { index: number; score: number }[] = Array.isArray(parsed.results) ? parsed.results : [];
    const ranked: RankedItem[] = results
      .filter((r) => typeof r.index === "number" && list[r.index] && (r.score ?? 0) >= 40)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((r) => ({ id: list[r.index].id, type: list[r.index].type, score: r.score }));

    const summary = typeof parsed.summary === "string" ? parsed.summary : "";

    return json({ summary, ranked });
  } catch (err) {
    console.error("smart-search error:", err);
    return json({ summary: "", ranked: [] }, 200);
  }
});
