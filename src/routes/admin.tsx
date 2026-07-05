import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Lock, Search, Send, LogOut, Loader,
  MessageSquare, ChevronLeft, ShieldAlert, Unlock as UnlockIcon,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Hooda — Admin" }] }),
  component: AdminPage,
});

const ADMIN_PASSWORD = "141819";
const UNLOCK_KEY = "hooda_admin_unlocked_v1";
const LOGO = "/icons/icon-192.png";

type UserRow = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

type AdminMsg = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/** Selo azul de verificado — igual ao usado ao lado do nome "Hooda Oficial". */
function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M12 2.5l2.4 1.4 2.7-.6 1.4 2.4 2.4 1.4-.6 2.7.6 2.7-2.4 1.4-1.4 2.4-2.7-.6L12 21.5l-2.4-1.4-2.7.6-1.4-2.4-2.4-1.4.6-2.7-.6-2.7 2.4-1.4 1.4-2.4 2.7.6L12 2.5z"
        fill="#3B9EFF"
      />
      <path d="M8.5 12.3l2.2 2.2 4.8-4.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Stage = "checking" | "denied" | "password" | "unlocked";

function AdminPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [adminId, setAdminId] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  // ── Gate: sessão + is_hooda_admin() ──
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        navigate({ to: "/", replace: true });
        return;
      }
      const { data: isAdmin, error } = await db.rpc("is_hooda_admin");
      if (error || !isAdmin) {
        setStage("denied");
        setTimeout(() => navigate({ to: "/home", replace: true }), 1800);
        return;
      }
      setAdminId(session.user.id);
      const alreadyUnlocked = sessionStorage.getItem(UNLOCK_KEY) === "1";
      setStage(alreadyUnlocked ? "unlocked" : "password");
    })();
  }, [navigate]);

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setStage("unlocked");
      setPwdError(false);
    } else {
      setPwdError(true);
      setPwd("");
    }
  }

  if (stage === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f0d17" }}>
        <Loader className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (stage === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: "#0f0d17" }}>
        <ShieldAlert className="h-10 w-10" style={{ color: "#F26B3A" }} />
        <p className="text-white font-bold text-lg">Acesso restrito</p>
        <p className="text-white/50 text-sm">Esta área é apenas para a equipa Hooda.</p>
      </div>
    );
  }

  if (stage === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "radial-gradient(circle at 50% 0%, #241b3d 0%, #0f0d17 65%)" }}>
        <form onSubmit={tryUnlock} className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center gap-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)", boxShadow: "0 8px 30px rgba(91,63,207,0.45)" }}>
            <Lock className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <p className="text-white font-extrabold text-lg">Painel Hooda Oficial</p>
            <p className="text-white/45 text-xs mt-1">Introduz a palavra-passe de acesso</p>
          </div>
          <input
            type="password"
            autoFocus
            value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdError(false); }}
            placeholder="Palavra-passe"
            className="w-full text-center tracking-[0.3em] text-lg font-bold rounded-2xl px-4 py-3 outline-none text-white"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: pwdError ? "1px solid #EF4444" : "1px solid rgba(255,255,255,0.12)",
            }}
          />
          {pwdError && <p className="text-xs -mt-3" style={{ color: "#EF4444" }}>Palavra-passe incorreta.</p>}
          <button type="submit"
            className="w-full py-3 rounded-2xl font-bold text-white transition active:scale-95"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#7B5CE8)", boxShadow: "0 4px 20px rgba(91,63,207,0.4)" }}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return <AdminDashboard adminId={adminId} />;
}

// ─────────────────────────────────────────────────────────────────────────

function AdminDashboard({ adminId }: { adminId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [convId, setConvId] = useState<string>("");
  const [replyAllowed, setReplyAllowed] = useState(true);
  const [msgs, setMsgs] = useState<AdminMsg[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Lista de utilizadores ──
  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      const { data, error } = await db
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .neq("id", adminId)
        .order("username", { ascending: true })
        .limit(500);
      if (error) console.error("[admin] erro a carregar utilizadores:", error);
      setUsers(data ?? []);
      setLoadingUsers(false);
    })();
  }, [adminId]);

  const filtered = users.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.username?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });

  // ── Garante / cria a conversa oficial com o utilizador selecionado ──
  const openUser = useCallback(async (u: UserRow) => {
    setSelected(u);
    setConvId("");
    setMsgs([]);
    setLoadingConv(true);
    try {
      const { data: myConvs } = await db
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", adminId);
      const myConvIds = (myConvs ?? []).map((c: any) => c.conversation_id);

      let foundId = "";
      if (myConvIds.length > 0) {
        const { data: shared } = await db
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", u.id)
          .in("conversation_id", myConvIds);
        const sharedIds = (shared ?? []).map((c: any) => c.conversation_id);
        if (sharedIds.length > 0) {
          const { data: officialConv } = await db
            .from("conversations")
            .select("id,reply_allowed")
            .in("id", sharedIds)
            .eq("is_official", true)
            .maybeSingle();
          if (officialConv?.id) {
            foundId = officialConv.id;
            setReplyAllowed(officialConv.reply_allowed);
          }
        }
      }

      if (!foundId) {
        const { data: newConv, error: convErr } = await db
          .from("conversations")
          .insert({ is_official: true, reply_allowed: true })
          .select("id")
          .single();
        if (convErr) throw convErr;
        foundId = newConv.id;
        setReplyAllowed(true);
        const { error: partErr } = await db.from("conversation_participants").insert([
          { conversation_id: foundId, user_id: adminId },
          { conversation_id: foundId, user_id: u.id },
        ]);
        if (partErr) throw partErr;
      }

      setConvId(foundId);
      const { data: history } = await db
        .from("messages")
        .select("id,sender_id,content,created_at")
        .eq("conversation_id", foundId)
        .order("created_at", { ascending: true });
      setMsgs((history ?? []).filter((m: AdminMsg) => !m.content?.startsWith("e2ee:")));
    } catch (err: any) {
      console.error("[admin] erro a abrir conversa:", err);
      toast.error("Erro ao abrir conversa: " + (err?.message ?? "desconhecido"));
    } finally {
      setLoadingConv(false);
    }
  }, [adminId]);

  // ── Realtime: novas respostas nesta conversa ──
  useEffect(() => {
    if (!convId) return;
    const ch = supabase.channel(`admin-conv-${convId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${convId}`,
      }, (payload: any) => {
        const m = payload.new as AdminMsg;
        if (m.content?.startsWith("e2ee:")) return;
        setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function toggleReplyAllowed() {
    const next = !replyAllowed;
    setReplyAllowed(next);
    const { error } = await db.from("conversations").update({ reply_allowed: next }).eq("id", convId);
    if (error) {
      setReplyAllowed(!next);
      toast.error("Não foi possível atualizar a permissão de resposta.");
    } else {
      toast.success(next ? "Respostas permitidas para esta conversa." : "Respostas bloqueadas para esta conversa.");
    }
  }

  async function sendOfficial() {
    const text = input.trim();
    if (!text || !selected || !convId || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    setMsgs(prev => [...prev, { id: tempId, sender_id: adminId, content: text, created_at: new Date().toISOString() }]);
    setInput("");
    try {
      const { data, error } = await db.from("messages").insert({
        conversation_id: convId,
        sender_id: adminId,
        receiver_id: selected.id,
        content: text,
        status: "sent",
        message_type: "text",
      }).select("id").single();
      if (error) throw error;
      setMsgs(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
    } catch (err: any) {
      console.error("[admin] erro ao enviar:", err);
      toast.error("Erro ao enviar: " + (err?.message ?? "desconhecido"));
      setMsgs(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-screen flex" style={{ background: "#0f0d17" }}>
      {/* ── Sidebar utilizadores ── */}
      <div className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-[340px] flex-col shrink-0 border-r`}
        style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="px-4 py-4 flex items-center justify-between gap-2 shrink-0"
          style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "white" }}>
              <img src={LOGO} alt="" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <p className="text-white font-extrabold text-sm leading-tight flex items-center gap-1">
                Hooda Oficial <VerifiedBadge />
              </p>
              <p className="text-white/70 text-[11px] leading-tight">Painel de mensagens</p>
            </div>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem(UNLOCK_KEY); navigate({ to: "/home" }); }}
            title="Sair do painel"
            className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(255,255,255,0.15)" }}>
            <LogOut className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="px-3 py-3 shrink-0">
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <Search className="h-4 w-4 text-white/40 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingUsers && (
            <div className="flex items-center justify-center py-10">
              <Loader className="h-5 w-5 animate-spin text-white/40" />
            </div>
          )}
          {!loadingUsers && filtered.length === 0 && (
            <p className="text-center text-white/35 text-sm py-10">Nenhum utilizador encontrado.</p>
          )}
          {filtered.map(u => (
            <button key={u.id} onClick={() => openUser(u)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
              style={{ background: selected?.id === u.id ? "rgba(91,63,207,0.25)" : "transparent" }}>
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: "#5B3FCF" }}>
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (u.full_name?.[0] ?? u.username?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{u.full_name || u.username}</p>
                <p className="text-[12px] text-white/45 truncate">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Conversa ── */}
      <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <MessageSquare className="h-10 w-10 text-white/20" />
            <p className="text-white/40 text-sm">Escolhe um utilizador para enviar uma mensagem oficial.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)" }}>
              <button onClick={() => setSelected(null)} className="md:hidden p-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: "#4a319c" }}>
                {selected.avatar_url
                  ? <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (selected.full_name?.[0] ?? selected.username?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{selected.full_name || selected.username}</p>
                <p className="text-[11px] text-white/70">@{selected.username} · a falar como Hooda Oficial</p>
              </div>
              <button onClick={toggleReplyAllowed}
                title={replyAllowed ? "Bloquear resposta do utilizador" : "Permitir resposta do utilizador"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition active:scale-95"
                style={{ background: replyAllowed ? "rgba(255,255,255,0.15)" : "rgba(239,68,68,0.25)", color: "white" }}>
                {replyAllowed ? <UnlockIcon className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {replyAllowed ? "Resposta permitida" : "Resposta bloqueada"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: "#151021" }}>
              {loadingConv && (
                <div className="flex items-center justify-center py-10">
                  <Loader className="h-5 w-5 animate-spin text-white/40" />
                </div>
              )}
              {!loadingConv && msgs.length === 0 && (
                <p className="text-center text-white/30 text-sm py-8">Ainda sem mensagens nesta conversa.</p>
              )}
              {msgs.map(m => {
                const isAdmin = m.sender_id === adminId;
                return (
                  <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%]">
                      {isAdmin && (
                        <p className="flex items-center gap-1 text-[11px] font-bold mb-1 justify-end" style={{ color: "#8f78e8" }}>
                          Hooda Oficial <VerifiedBadge size={11} />
                        </p>
                      )}
                      <div className="rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                        style={{
                          background: isAdmin ? "linear-gradient(135deg,#5B3FCF,#7B5CE8)" : "rgba(255,255,255,0.08)",
                          color: "white",
                          borderBottomRightRadius: isAdmin ? 4 : undefined,
                          borderBottomLeftRadius: !isAdmin ? 4 : undefined,
                        }}>
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2 px-3 py-3 shrink-0" style={{ background: "#1a1428" }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendOfficial(); } }}
                rows={1}
                placeholder="Escrever como Hooda Oficial..."
                className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none resize-none text-white placeholder:text-white/30 max-h-28"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <button onClick={sendOfficial} disabled={sending || !input.trim()}
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#7B5CE8)", boxShadow: "0 4px 14px rgba(91,63,207,0.4)" }}>
                {sending ? <Loader className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" style={{ marginLeft: 2 }} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Reexporta o selo para eventual uso noutras páginas (ex.: mensagens.tsx)
export { VerifiedBadge };
