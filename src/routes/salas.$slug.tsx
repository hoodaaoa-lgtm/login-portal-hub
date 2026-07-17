import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SideNav, BottomNav, PageWrapper } from "@/components/AppShell";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { uploadFeedVideo } from "@/lib/cloudinaryFeedVideo";
import { optimizeAvatar, optimizePostPhoto } from "@/lib/imageOptimize";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Users, Send, Image as ImageIcon, Video, X, Loader2,
  Lock, Globe, Megaphone, Heart, Shield, DoorOpen,
} from "lucide-react";

export const Route = createFileRoute("/salas/$slug")({
  head: () => ({ meta: [{ title: "Sala · Snapper" }] }),
  component: SalaPage,
});

const P = "#2F6FED";

type Sala = {
  id: string; nome: string; descricao: string | null; foto_url: string | null;
  tipo: "publica" | "privada" | "anuncios"; slug: string; criador_id: string;
  conversation_id: string; membros_count: number; created_at: string;
};

type Membro = { user_id: string; papel: "admin" | "membro"; username?: string; full_name?: string; avatar_url?: string };

type Msg = {
  id: string; conversation_id: string; sender_id: string; content: string | null;
  message_type: string; media_url: string | null; created_at: string;
  sender?: { username?: string; full_name?: string; avatar_url?: string };
  likeCount?: number; likedByMe?: boolean;
};

const TIPO_INFO = {
  publica:  { label: "Pública",  Icon: Globe,     color: "#2F6FED" },
  privada:  { label: "Privada",  Icon: Lock,      color: "#6BA547" },
  anuncios: { label: "Anúncios", Icon: Megaphone, color: "#FFC93C" },
} as const;

function fmtN(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n ?? 0);
}

function Av({ src, name, size = 36 }: { src?: string | null; name?: string; size?: number }) {
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold text-white"
      style={{ width: size, height: size, background: src ? "transparent" : P, fontSize: size / 2.6 }}>
      {src ? <img src={optimizeAvatar(src, size * 2)} alt="" className="w-full h-full object-cover" /> : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ── Membros drawer ── */
function MembrosPanel({ membros, onClose }: { membros: Membro[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-sm h-full overflow-y-auto p-4" style={{ background: "var(--s0)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Membros · {membros.length}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="space-y-2">
          {membros.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-xl">
              <Av src={m.avatar_url} name={m.full_name || m.username} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{m.full_name || m.username || "Utilizador"}</p>
                {m.username && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{m.username}</p>}
              </div>
              {m.papel === "admin" && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: P, background: `${P}18` }}>
                  <Shield className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MsgBubble({ m, isMe, isAnuncio, onLike }: { m: Msg; isMe: boolean; isAnuncio: boolean; onLike: () => void }) {
  return (
    <div className={`flex gap-2 mb-3 ${isMe ? "flex-row-reverse" : ""}`}>
      {!isMe && <Av src={m.sender?.avatar_url} name={m.sender?.full_name || m.sender?.username} size={30} />}
      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
        {!isMe && (
          <span className="text-[11px] font-bold mb-0.5 px-1" style={{ color: "var(--text-muted)" }}>
            {m.sender?.full_name || m.sender?.username || "Utilizador"}
          </span>
        )}
        <div className="rounded-2xl overflow-hidden" style={{ background: isMe ? P : "var(--s2)" }}>
          {m.message_type === "image" && m.media_url && (
            <img src={optimizePostPhoto(m.media_url, 500)} alt="" className="max-w-full max-h-80 object-cover" />
          )}
          {m.message_type === "video" && m.media_url && (
            <video src={m.media_url} controls className="max-w-full max-h-80" />
          )}
          {m.content && (
            <p className="text-sm px-3 py-2" style={{ color: isMe ? "#fff" : "var(--text-primary)" }}>{m.content}</p>
          )}
        </div>
        {isAnuncio && (
          <button onClick={onLike} className="flex items-center gap-1 mt-1 px-1 text-xs font-bold"
            style={{ color: m.likedByMe ? "#e0245e" : "var(--text-muted)" }}>
            <Heart className="w-3.5 h-3.5" fill={m.likedByMe ? "#e0245e" : "none"} />
            {fmtN(m.likeCount ?? 0)}
          </button>
        )}
      </div>
    </div>
  );
}

function SalaPage() {
  const navigate = useNavigate();
  const { slug } = useParams({ from: "/salas/$slug" });
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const [sala, setSala] = useState<Sala | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [showMembros, setShowMembros] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ file: File; type: "image" | "video"; preview: string } | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data: salaData } = await supabase.from("salas" as any).select("*").eq("slug", slug).maybeSingle();
    const s = salaData as unknown as Sala | null;
    setSala(s);
    if (!s) { setLoading(false); return; }

    if (uid) {
      const { data: memb } = await supabase.from("sala_membros" as any).select("papel").eq("sala_id", s.id).eq("user_id", uid).maybeSingle();
      setIsMember(!!memb);
      setIsAdmin((memb as any)?.papel === "admin");
    }

    const { data: membrosRows } = await supabase.from("sala_membros" as any).select("user_id,papel").eq("sala_id", s.id);
    const userIds = ((membrosRows as any[]) ?? []).map((r) => r.user_id);
    let profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", userIds);
      (profs as any[] ?? []).forEach((p) => { profileMap[p.id] = p; });
    }
    setMembros(((membrosRows as any[]) ?? []).map((r) => ({
      user_id: r.user_id, papel: r.papel,
      username: profileMap[r.user_id]?.username, full_name: profileMap[r.user_id]?.full_name, avatar_url: profileMap[r.user_id]?.avatar_url,
    })));

    const { data: msgRows } = await supabase.from("messages").select("id,conversation_id,sender_id,content,message_type,media_url,created_at")
      .eq("conversation_id", s.conversation_id).eq("deleted_for_all", false).order("created_at", { ascending: true }).limit(200);
    const senderIds = Array.from(new Set(((msgRows as any[]) ?? []).map((m) => m.sender_id)));
    let senderMap: Record<string, any> = profileMap;
    const missing = senderIds.filter((id) => !senderMap[id]);
    if (missing.length) {
      const { data: profs2 } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", missing);
      (profs2 as any[] ?? []).forEach((p) => { senderMap[p.id] = p; });
    }
    const msgIds = ((msgRows as any[]) ?? []).map((m) => m.id);
    let likeMap: Record<string, { count: number; me: boolean }> = {};
    if (s.tipo === "anuncios" && msgIds.length) {
      const { data: rx } = await supabase.from("message_reactions" as any).select("message_id,user_id").in("message_id", msgIds);
      (rx as any[] ?? []).forEach((r) => {
        if (!likeMap[r.message_id]) likeMap[r.message_id] = { count: 0, me: false };
        likeMap[r.message_id].count += 1;
        if (r.user_id === uid) likeMap[r.message_id].me = true;
      });
    }
    setMsgs(((msgRows as any[]) ?? []).map((m) => ({
      ...m,
      sender: senderMap[m.sender_id],
      likeCount: likeMap[m.id]?.count ?? 0,
      likedByMe: likeMap[m.id]?.me ?? false,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, uid]);

  useEffect(() => {
    if (!sala) return;
    const channel = supabase
      .channel(`sala-${sala.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${sala.conversation_id}` },
        async (payload) => {
          const row: any = payload.new;
          let sender: Membro | undefined = membros.find((m) => m.user_id === row.sender_id);
          if (!sender) {
            const { data: p } = await supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", row.sender_id).maybeSingle();
            sender = p ? { user_id: p.id, papel: "membro" as const, username: p.username ?? undefined, full_name: p.full_name ?? undefined, avatar_url: p.avatar_url ?? undefined } : undefined;
          }
          setMsgs((prev) => [...prev, { ...row, sender, likeCount: 0, likedByMe: false }]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const handleJoin = async () => {
    if (!uid || !sala) { toast.error("Inicia sessão para entrar na sala."); return; }
    setJoining(true);
    try {
      const { error } = await supabase.rpc("sala_entrar" as any, { p_sala_id: sala.id });
      if (error) throw error;
      setIsMember(true);
      setSala((s) => s ? { ...s, membros_count: s.membros_count + 1 } : s);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível entrar na sala.");
    } finally {
      setJoining(false);
    }
  };

  const canPost = isMember && (sala?.tipo !== "anuncios" || isAdmin);

  const handleSend = async () => {
    if (!sala || !uid || sending) return;
    if (!text.trim() && !pendingMedia) return;
    setSending(true);
    try {
      let message_type = "text";
      let media_url: string | null = null;
      if (pendingMedia) {
        if (pendingMedia.type === "image") {
          const up = await uploadImageToCloudinary(pendingMedia.file, `hooda/salas/${sala.id}`);
          media_url = up.url; message_type = "image";
        } else {
          const up = await uploadFeedVideo(pendingMedia.file, { title: sala.nome, creatorId: uid, userId: uid }, () => {});
          media_url = up.playbackUrl; message_type = "video";
        }
      }
      const { error } = await supabase.from("messages").insert({
        conversation_id: sala.conversation_id,
        sender_id: uid,
        content: text.trim() || null,
        message_type,
        media_url,
        status: "sent",
      } as any);
      if (error) throw error;
      setText("");
      setPendingMedia(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleLike = async (m: Msg) => {
    if (!uid) return;
    try {
      if (m.likedByMe) {
        await supabase.from("message_reactions" as any).delete().eq("message_id", m.id).eq("user_id", uid);
        setMsgs((prev) => prev.map((x) => x.id === m.id ? { ...x, likedByMe: false, likeCount: Math.max(0, (x.likeCount ?? 1) - 1) } : x));
      } else {
        await supabase.from("message_reactions" as any).insert({ message_id: m.id, user_id: uid, emoji: "❤️" });
        setMsgs((prev) => prev.map((x) => x.id === m.id ? { ...x, likedByMe: true, likeCount: (x.likeCount ?? 0) + 1 } : x));
      }
    } catch { /* best-effort */ }
  };

  if (loading) {
    return (
      <>
        <SideNav />
        <PageWrapper className="pb-20 lg:pb-0">
          <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-6 h-6 animate-spin" style={{ color: P }} /></div>
        </PageWrapper>
      </>
    );
  }

  if (!sala) {
    return (
      <>
        <SideNav />
        <PageWrapper className="pb-20 lg:pb-0">
          <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
            <p className="font-bold" style={{ color: "var(--text-primary)" }}>Sala não encontrada.</p>
            <button onClick={() => navigate({ to: "/salas" })} className="px-4 h-9 rounded-full text-white text-sm font-bold" style={{ background: P }}>Voltar a Salas</button>
          </div>
        </PageWrapper>
      </>
    );
  }

  const info = TIPO_INFO[sala.tipo];

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        {/* Header */}
        <div className="sticky top-0 z-30 px-4 pt-4 pb-3" style={{ background: "var(--s1)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => navigate({ to: "/salas" })} className="p-1.5 rounded-full" style={{ background: "var(--s2)" }}>
              <ArrowLeft className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            </button>
            <div className="rounded-xl overflow-hidden flex items-center justify-center shrink-0 font-extrabold text-white"
              style={{ width: 40, height: 40, background: sala.foto_url ? "transparent" : P }}>
              {sala.foto_url ? <img src={optimizeAvatar(sala.foto_url, 80)} alt="" className="w-full h-full object-cover" /> : sala.nome[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-extrabold text-sm truncate" style={{ color: "var(--text-primary)" }}>{sala.nome}</p>
                <info.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: info.color }} />
              </div>
              <button onClick={() => setShowMembros(true)} className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Users className="w-3 h-3" /> {fmtN(sala.membros_count)} membro{sala.membros_count === 1 ? "" : "s"}
              </button>
            </div>
            {!isMember && (
              <button onClick={handleJoin} disabled={joining}
                className="shrink-0 px-3.5 h-9 rounded-full text-xs font-bold text-white flex items-center gap-1 disabled:opacity-60"
                style={{ background: P }}>
                {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
                Entrar na Sala
              </button>
            )}
          </div>
          {sala.descricao && <p className="text-xs px-1" style={{ color: "var(--text-muted)" }}>{sala.descricao}</p>}
        </div>

        {/* Mensagens */}
        <div className="px-4 py-4 min-h-[50vh]">
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Ainda não há publicações nesta sala.</p>
            </div>
          ) : (
            msgs.map((m) => (
              <MsgBubble key={m.id} m={m} isMe={m.sender_id === uid} isAnuncio={sala.tipo === "anuncios"} onLike={() => handleLike(m)} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        {isMember && canPost && (
          <div className="sticky bottom-[58px] lg:bottom-0 px-3 py-2.5 border-t" style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
            {pendingMedia && (
              <div className="relative inline-block mb-2 ml-1">
                {pendingMedia.type === "image"
                  ? <img src={pendingMedia.preview} alt="" className="h-20 rounded-lg object-cover" />
                  : <video src={pendingMedia.preview} className="h-20 rounded-lg" />}
                <button onClick={() => setPendingMedia(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(0,0,0,0.7)" }}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => imgInputRef.current?.click()} className="p-2 rounded-full shrink-0" style={{ background: "var(--s2)" }}>
                <ImageIcon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
              <button onClick={() => vidInputRef.current?.click()} className="p-2 rounded-full shrink-0" style={{ background: "var(--s2)" }}>
                <Video className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingMedia({ file: f, type: "image", preview: URL.createObjectURL(f) }); }} />
              <input ref={vidInputRef} type="file" accept="video/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingMedia({ file: f, type: "video", preview: URL.createObjectURL(f) }); }} />
              <input
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder={sala.tipo === "anuncios" ? "Publicar um anúncio..." : "Escreve uma mensagem..."}
                className="flex-1 px-3.5 h-10 rounded-full text-sm border outline-none"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              <button onClick={handleSend} disabled={sending || (!text.trim() && !pendingMedia)}
                className="p-2.5 rounded-full text-white shrink-0 disabled:opacity-50" style={{ background: P }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        {isMember && !canPost && (
          <div className="px-4 py-3 text-center text-xs font-bold" style={{ color: "var(--text-muted)" }}>
            Só administradores podem publicar nesta sala de anúncios. Podes reagir com ❤️.
          </div>
        )}

        <BottomNav />
      </PageWrapper>

      {showMembros && <MembrosPanel membros={membros} onClose={() => setShowMembros(false)} />}
    </>
  );
}
