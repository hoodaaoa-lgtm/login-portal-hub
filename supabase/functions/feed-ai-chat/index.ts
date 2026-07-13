import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════
// Entrega de Conteúdo — chat do admin com a IA que ajusta o algoritmo do feed
//
// Recebe { message }, junta o histórico da conversa + estado atual real do
// feed (pesos de algorithm_settings, estatísticas do dashboard, análise de
// conteúdo por estado de distribuição) e manda tudo para a IA (Gemini via
// API direta da Google, com chave gratuita do AI Studio), que:
//   1. Responde em português (Angola) explicando o que percebeu.
//   2. Se fizer sentido ajustar o algoritmo, propõe novos pesos através da
//      tool `propor_pesos` — nunca aplica sozinho.
//
// O admin confirma a proposta no frontend, que chama a RPC já existente
// admin_update_algorithm_weights, e só depois marca a mensagem como
// aplicada (mark_feed_ai_proposal_applied). Esta função nunca escreve em
// algorithm_settings diretamente.
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY       = Deno.env.get("GEMINI_API_KEY")!;

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-2.5-flash";

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

const WEIGHT_KEYS = [
  "weight_seguidores", "weight_interesses", "weight_similaridade",
  "weight_descoberta", "weight_tendencias", "weight_curtidas",
  "weight_comentarios", "weight_partilhas", "weight_guardados", "weight_retencao",
] as const;

const PROPOR_PESOS_TOOL = {
  type: "function",
  function: {
    name: "propor_pesos",
    description:
      "Propõe uma alteração aos pesos do algoritmo do feed. Só chama isto quando o pedido do " +
      "admin implicar mesmo mudar o comportamento do feed — para perguntas informativas, responde só em texto.",
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        WEIGHT_KEYS.map((k) => [k, { type: "number", description: `Novo valor para ${k}` }])
      ),
      required: [],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { message } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "message em falta" }, 400);

    // Cliente com o token do próprio admin, para respeitar RLS (is_hooda_admin()).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) return json({ error: "não autenticado" }, 401);
    const adminId = userData.user.id;

    const { data: isAdmin } = await supabase.rpc("is_hooda_admin");
    if (!isAdmin) return json({ error: "apenas administradores" }, 403);

    // ── Contexto real do feed ──
    const [{ data: weights }, { data: stats }, { data: history }] = await Promise.all([
      supabase.from("algorithm_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.rpc("get_ai_dashboard_stats"),
      supabase.rpc("get_feed_ai_chat_history", { p_limit: 20 }),
    ]);

    const pastMessages = (history ?? []).slice().reverse().map((m: { role: string; content: string }) => ({
      role: m.role === "admin" ? "user" : "assistant",
      content: m.content,
    }));

    const systemPrompt =
      "És a IA que ajuda o administrador da Baya (rede social angolana) a entender e ajustar o " +
      "algoritmo de distribuição do feed. Falas em português de Angola, direto e sem enrolar.\n\n" +
      "Pesos atuais do algoritmo (0-100, composição do feed): " + JSON.stringify(weights) + "\n\n" +
      "Estatísticas reais dos últimos dias: " + JSON.stringify(stats) + "\n\n" +
      "Quando o admin pedir uma mudança de comportamento do feed (ex: 'mais vídeos', 'menos spam', " +
      "'dá mais chance a contas novas'), usa a tool propor_pesos com os valores completos e " +
      "ajustados (não só os que mudam — envia o conjunto todo de pesos). Explica em texto o " +
      "raciocínio antes de propor. Se o pedido for só uma pergunta sobre como o feed está a " +
      "funcionar, responde só em texto, sem usar a tool.";

    const aiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...pastMessages,
          { role: "user", content: message },
        ],
        tools: [PROPOR_PESOS_TOOL],
      }),
    });

    if (aiRes.status === 429) {
      return json({ error: "Muitos pedidos à IA. Espera um pouco e tenta outra vez." }, 429);
    }
    if (aiRes.status === 401 || aiRes.status === 403) {
      return json({ error: "Chave da IA inválida ou em falta. Verifica o segredo GEMINI_API_KEY." }, 401);
    }
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[feed-ai-chat] erro da Gemini API:", errText);
      return json({ error: "A IA não respondeu. Tenta outra vez." }, 502);
    }

    const data = await aiRes.json();
    const choice = data.choices?.[0]?.message;
    let replyText = choice?.content ?? "";
    let proposedWeights: Record<string, number> | null = null;

    for (const call of choice?.tool_calls ?? []) {
      if (call.function?.name === "propor_pesos") {
        try {
          proposedWeights = JSON.parse(call.function.arguments);
        } catch (e) {
          console.error("[feed-ai-chat] erro ao parsear tool_calls:", e);
        }
      }
    }
    if (!replyText?.trim()) replyText = "Aqui está a proposta de ajuste:";

    // Guarda a mensagem do admin e a resposta da IA no histórico.
    await supabase.from("feed_ai_chat_messages").insert({ admin_id: adminId, role: "admin", content: message });
    const { data: inserted, error: insertErr } = await supabase
      .from("feed_ai_chat_messages")
      .insert({
        admin_id: adminId,
        role: "assistant",
        content: replyText,
        proposed_weights: proposedWeights,
      })
      .select()
      .single();
    if (insertErr) console.error("[feed-ai-chat] erro ao guardar resposta:", insertErr);

    return json({ reply: replyText, proposedWeights, messageId: inserted?.id ?? null });
  } catch (e) {
    console.error("[feed-ai-chat] erro inesperado:", e);
    return json({ error: "Erro inesperado. Tenta outra vez." }, 500);
  }
});
