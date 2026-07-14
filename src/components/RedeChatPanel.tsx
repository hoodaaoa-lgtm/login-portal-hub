import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { timeAgo } from "@/hooks/useTimeAgo";
import { Send } from "lucide-react";

type RedeMsg = {
  id: string; sender_id: string; content: string | null; created_at: string;
  sender?: { username: string; full_name: string | null; avatar_url: string | null };
};

/** Conversa em grupo da Rede. Reaproveita `conversations`/`messages` —
 * a mesma base de dados do sistema de mensagens 1-para-1 — mas com uma UI
 * própria, já que a caixa de entrada pessoal (mensagens.tsx) assume sempre
 * exactamente um "outro" participante por conversa.
 *
 * Nota: ao contrário das conversas diretas (que são E2EE), as mensagens de
 * uma Rede não são cifradas ponta-a-ponta — são visíveis apenas aos membros
 * via RLS, como um grupo normal. */
export function RedeChatPanel({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<RedeMsg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("messages")
        .select("id,sender_id,content,created_at")
        .eq("conversation_id", conversationId)
        .eq("deleted_for_all", false)
        .order("created_at", { ascending: true })
        .limit(200);
      const rows: RedeMsg[] = data ?? [];
      const senderIds = [...new Set(rows.map((m) => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", senderIds);
        const byId: Record<string, any> = {};
        (profs ?? []).forEach((p: any) => { byId[p.id] = p; });
        rows.forEach((m) => { m.sender = byId[m.sender_id]; });
      }
      if (!cancelled) { setMsgs(rows); setLoading(false); }
    })();

    const channel = supabase
      .channel(`rede-chat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, async (payload: any) => {
        const m = payload.new as RedeMsg;
        const { data: prof } = await supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", m.sender_id).maybeSingle();
        setMsgs((prev) => [...prev, { ...m, sender: prof ?? undefined }]);
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function handleSend() {
    const t = text.trim();
    if (!t || !user || sending) return;
    setSending(true);
    setText("");
    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: t,
      status: "sent",
      message_type: "text",
    });
    setSending(false);
    if (error) { setText(t); console.error("[RedeChatPanel] erro ao enviar:", error); }
  }

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading && <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>A carregar conversa…</p>}
        {!loading && msgs.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>Ainda não há mensagens. Sê o primeiro a escrever!</p>
        )}
        {msgs.map((m) => {
          const isMe = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: "#5B3FCF" }}>
                {m.sender?.avatar_url
                  ? <img src={m.sender.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (m.sender?.full_name?.[0] ?? m.sender?.username?.[0] ?? "?").toUpperCase()}
              </div>
              <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                {!isMe && (
                  <span className="text-[10px] font-semibold px-1" style={{ color: "var(--text-muted)" }}>{m.sender?.full_name || m.sender?.username || "?"}</span>
                )}
                <div className="px-3 py-2 rounded-2xl text-sm" style={{
                  background: isMe ? "#5B3FCF" : "var(--s2)",
                  color: isMe ? "#fff" : "var(--text-primary)",
                }}>
                  {m.content}
                </div>
                <span className="text-[9px] px-1 mt-0.5" style={{ color: "var(--text-muted)" }}>{timeAgo(m.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Escrever mensagem…"
          className="flex-1 h-10 rounded-full px-4 text-sm outline-none"
          style={{ background: "var(--s2)", color: "var(--text-primary)" }}
        />
        <button onClick={handleSend} disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
          style={{ background: "#5B3FCF" }}>
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}
