import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhotoViewer } from "@/components/PhotoViewer";
import { RichText } from "@/components/RichText";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import {
  ChevronLeft, MessageCircle, Flag, Heart, Share2,
  MoreHorizontal, UserCheck, UserPlus, X, MapPin,
  Link as LinkIcon, Calendar, Play, Pause, Camera,
  MessageSquare, Eye, Repeat2, Forward, Bookmark, BookmarkCheck,
  Copy, Check, TypeIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "hooda — Perfil" }] }),
  component: UserProfilePage,
});

/* ─── Constantes ─── */
const P      = "#5B3FCF";
const PINK   = "#E94B8A";
const GRAD   = `linear-gradient(135deg,${P},${PINK})`;
const COLORS = [P, "#F26B3A", "#1FAFA6", "#6BA547", PINK, "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

/* ─── Helpers ─── */
function fmtNum(n: number) { return n >= 1_000 ? `${(n/1000).toFixed(1)}k` : String(n ?? 0); }
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 86400*30) return `${Math.floor(s/86400)}d`;
  return new Date(d).toLocaleDateString("pt-PT", { day:"numeric", month:"short" });
}
function fmtTime(s: number) {
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,"0")}`;
}

/* ─── Avatar ─── */
function Av({ name, src, size=40, color, ring=false }:
  { name:string; src?:string|null; size?:number; color?:string; ring?:boolean }) {
  const bg = color || colorFor(name || "?");
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0, overflow:"hidden",
      background:bg, display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.38, fontWeight:700, color:"#fff",
      border: ring ? `3px solid white` : undefined,
      boxShadow: ring ? "0 0 0 3px "+bg : undefined,
    }}>
      {src
        ? <img src={src} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}
            onError={e=>e.currentTarget.style.display="none"} />
        : (name?.[0]??"?").toUpperCase()}
    </div>
  );
}

import { usePostVideoView } from "@/hooks/usePostVideoView";

/* ── Modal Partilhar Perfil ── */
function ShareProfileModal({ username, name, onClose }: { username: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/u/${username}`;
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-5"
        style={{ background: "var(--s0)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>Partilhar perfil</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>Link do perfil de <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{name}</span></p>
        <div className="flex items-center gap-2 p-3 rounded-2xl border mb-1"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          <p className="flex-1 text-sm truncate" style={{ color: "var(--text-secondary)" }}>{url}</p>
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
            style={copied ? { background: "#6BA547", color: "#fff" } : { background: P, color: "#fff" }}>
            {copied ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── RepostModal ── */
function RepostModal({ post, myId, myUsername, onClose, onReposted }: {
  post: any; myId: string; myUsername: string;
  onClose: () => void; onReposted: (count: number, did: boolean) => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"menu" | "quote" | "done">("menu");
  const [quoteText, setQuoteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [alreadyReposted, setAlreadyReposted] = useState(false);

  useEffect(() => {
    if (!myId) return;
    (supabase as any).from("reposts").select("id").eq("user_id", myId).eq("post_id", post.id).maybeSingle()
      .then(({ data }: any) => setAlreadyReposted(!!data));
  }, [myId, post.id]);

  async function doRepost(quote?: string) {
    if (!myId || loading) return;
    setLoading(true);
    if (alreadyReposted) {
      await (supabase as any).from("reposts").delete().eq("user_id", myId).eq("post_id", post.id);
      onReposted((post.repostCount ?? 1) - 1, false);
    } else {
      await (supabase as any).from("reposts").insert({ user_id: myId, post_id: post.id, quote_text: quote || null });
      onReposted((post.repostCount ?? 0) + 1, true);
    }
    setLoading(false);
    setMode("done");
    setTimeout(onClose, 900);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--s0)", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>

        {mode === "menu" && (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>
                {alreadyReposted ? "Desfazer repost?" : "Repostar"}
              </h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
                <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            {/* Preview */}
            <div className="mx-4 mb-4 p-3 rounded-2xl border" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
              {post.text && <p className="text-sm line-clamp-2" style={{ color: "var(--text-secondary)" }}>{post.text}</p>}
              {post.photo && <img src={post.photo} alt="" className="w-full rounded-xl mt-2 object-cover max-h-28" />}
            </div>
            <div className="px-4 pb-5 space-y-2">
              {alreadyReposted ? (
                <button onClick={() => doRepost()} disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm transition active:scale-[0.98]"
                  style={{ background: "#ef444415", color: "#ef4444" }}>
                  <Repeat2 className="w-5 h-5" />
                  <div className="text-left"><p className="font-bold">Desfazer repost</p></div>
                </button>
              ) : (
                <>
                  <button onClick={() => doRepost()} disabled={loading}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm transition active:scale-[0.98]"
                    style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: P + "15" }}>
                      <Repeat2 className="w-5 h-5" style={{ color: P }} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold">Repostar</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Partilha com os teus seguidores</p>
                    </div>
                  </button>
                  <button onClick={() => setMode("quote")}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm transition active:scale-[0.98]"
                    style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: PINK + "15" }}>
                      <MessageSquare className="w-5 h-5" style={{ color: PINK }} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold">Citar publicação</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Adiciona o teu comentário</p>
                    </div>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {mode === "quote" && (
          <>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <button onClick={() => setMode("menu")} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
                <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
              </button>
              <h3 className="font-extrabold text-base flex-1" style={{ color: "var(--text-primary)" }}>Citar publicação</h3>
              <button onClick={() => doRepost(quoteText)} disabled={!quoteText.trim() || loading}
                className="px-4 h-8 rounded-full text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
                style={{ background: GRAD }}>
                {loading ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : "Publicar"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
              <div className="flex gap-3 mb-4">
                <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ background: P }}>
                  {myUsername?.[0]?.toUpperCase() ?? "?"}
                </div>
                <textarea autoFocus value={quoteText} onChange={e => setQuoteText(e.target.value)}
                  maxLength={280} placeholder="Adiciona o teu comentário…" rows={3}
                  className="flex-1 resize-none outline-none text-sm leading-relaxed bg-transparent"
                  style={{ color: "var(--text-primary)" }} />
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
                {post.text && <p className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>{post.text.slice(0, 120)}{post.text.length > 120 ? "…" : ""}</p>}
                {post.photo && <img src={post.photo} alt="" className="w-full object-cover max-h-40" />}
              </div>
              <div className="flex justify-end mt-1">
                <span className="text-xs" style={{ color: quoteText.length > 260 ? "#ef4444" : "var(--text-muted)" }}>{quoteText.length}/280</span>
              </div>
            </div>
          </>
        )}

        {mode === "done" && (
          <div className="flex flex-col items-center gap-3 py-10 px-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: P + "15" }}>
              <Repeat2 className="w-7 h-7" style={{ color: P }} />
            </div>
            <p className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>
              {alreadyReposted ? "Repost removido" : "Repostado!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ForwardModal — igual ao modal de comentários: createPortal, sem scroll de fundo, feedback de copiado ── */
function ForwardModal({ post, myId, onClose }: { post: any; myId: string; onClose: () => void }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!myId) return;
    (async () => {
      const { data } = await (supabase as any).from("conversations")
        .select("id,participants,updated_at").contains("participants", [myId])
        .order("updated_at", { ascending: false }).limit(30);
      if (!data) return;
      const otherIds = [...new Set(data.flatMap((c: any) => c.participants.filter((p: string) => p !== myId)))];
      const { data: profs } = await (supabase as any).from("profiles").select("id,username,full_name,avatar_url").in("id", otherIds);
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profMap[p.id] = p; });
      setConversations(data.map((c: any) => {
        const otherId = c.participants.find((p: string) => p !== myId);
        const prof = profMap[otherId] || {};
        return { ...c, otherName: prof.full_name || prof.username || "Utilizador", otherUsername: prof.username, avatar: prof.avatar_url };
      }));
    })();
  }, [myId]);

  async function forward(convId: string) {
    if (!myId || sending) return;
    setSending(convId);
    const postUrl = `${window.location.origin}/post/${post.id}`;
    const text = `${post.text ? post.text.slice(0, 100) + "\n" : ""}🔗 ${postUrl}`;
    await (supabase as any).from("messages").insert({ conversation_id: convId, sender_id: myId, content: text, type: "text" });
    setSent(s => new Set([...s, convId]));
    setSending(null);
  }

  const filtered = conversations.filter(c => !search || c.otherName?.toLowerCase().includes(search.toLowerCase()));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
        style={{ maxHeight: "92vh", height: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator mobile */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>Partilhar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full transition" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Conteúdo scrollável: link + partilha nativa + lista de conversas, tudo num scroll só */}
        <div className="overflow-y-auto flex-1">

          {/* Link directo */}
          <div className="px-4 pt-4">
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Link da publicação</p>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-3" style={{ background: "var(--s2)" }}>
              <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {`${window.location.origin}/post/${post.id}`}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1"
                style={{ background: linkCopied ? "#6BA547" : P, color: "#fff" }}>
                {linkCopied ? (<><Check className="h-3.5 w-3.5" /> Copiado</>) : "Copiar"}
              </button>
            </div>

            {/* Partilha nativa */}
            {typeof navigator.share === "function" && (
              <button
                onClick={() => {
                  navigator.share({
                    title: `Publicação de ${post.authorName ?? post.authorUsername}`,
                    text: post.text || "Vê esta publicação na Hooda",
                    url: `${window.location.origin}/post/${post.id}`,
                  }).catch(() => {});
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition active:scale-[0.98] border mb-1"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                <Share2 className="h-4 w-4" /> Partilhar via...
              </button>
            )}
          </div>

          {/* Enviar para conversa */}
          <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Enviar para conversa
          </p>
          <div className="px-4 py-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar…"
              className="w-full px-4 h-9 rounded-full text-sm outline-none border"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>
          <div className="px-2 pb-4">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>Sem conversas</p>
            ) : filtered.map(c => (
              <button key={c.id} onClick={() => forward(c.id)} disabled={!!sending || sent.has(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition hover:bg-[var(--s2)] active:scale-[0.98]">
                <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: P }}>
                  {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.otherName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.otherName}</p>
                  {c.otherUsername && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>@{c.otherUsername}</p>}
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center transition" style={sent.has(c.id) ? { background: "#6BA54720", color: "#6BA547" } : { background: "var(--s3)", color: "var(--text-muted)" }}>
                  {sending === c.id
                    ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: P, borderTopColor: "transparent" }} />
                    : sent.has(c.id) ? <Check className="w-4 h-4" /> : <Forward className="w-4 h-4" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── VideoPlayer — adapta tamanho ao vídeo (short vs landscape) ─── */
function VideoPlayer({ src, poster, postId, kind }: { src:string; poster?:string; postId?:string; kind?:string }) {
  const [playing, setPlaying] = useState(false);
  const [isShort, setIsShort] = useState<boolean | null>(null);
  const ref = useRef<HTMLVideoElement>(null);

  usePostVideoView(postId, kind, ref);

  function toggle() {
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  return (
    <div
      className="w-full bg-black relative cursor-pointer overflow-hidden"
      style={{ maxHeight: isShort ? "600px" : "420px" }}
      onClick={toggle}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          const v = ref.current;
          if (v) setIsShort(v.videoHeight > v.videoWidth);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onContextMenu={e => e.preventDefault()}
        className="w-full block"
        style={{
          pointerEvents: "none",
          objectFit: isShort ? "contain" : "cover",
          width: "100%",
          maxHeight: isShort ? "600px" : "420px",
        }}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}
      {playing && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.4)" }}>
            <Pause className="h-6 w-6 text-white" fill="white" />
          </div>
        </div>
      )}
      {isShort === null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      )}
    </div>
  );
}

/* ─── Modal de Seguidores/Seguindo ─── */
function FollowListModal({ userId, kind, onClose }:
  { userId:string; kind:"followers"|"following"; onClose:()=>void }) {
  const [myId, setMyId] = useState("");
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.body.style.overflow = "hidden";
    supabase.auth.getSession().then(({data:{session}})=>{ if(session) setMyId(session.user.id); });
    return ()=>{ document.body.style.overflow=""; };
  },[]);

  const { data=[], isLoading } = useQuery({
    queryKey:["followList",userId,kind],
    queryFn: async () => {
      const db = supabase as any;
      if (kind==="followers") {
        const {data:rows}=await db.from("follows").select("profiles!follower_id(id,username,full_name,avatar_url)").eq("target_username",(await db.from("profiles").select("username").eq("id",userId).single()).data?.username);
        return (rows??[]).map((r:any)=>r.profiles).filter(Boolean);
      } else {
        const {data:rows}=await db.from("follows").select("profiles!target_username(id,username,full_name,avatar_url)").eq("follower_id",userId);
        return (rows??[]).map((r:any)=>r.profiles).filter(Boolean);
      }
    },
    staleTime:30_000,
  });

  async function toggleFollow(targetId:string, targetUsername:string) {
    if (!myId || myId===targetId) return;
    const isF = following.has(targetId);
    setFollowing(prev=>{ const s=new Set(prev); isF?s.delete(targetId):s.add(targetId); return s; });
    const db=supabase as any;
    if (isF) await db.from("follows").delete().eq("follower_id",myId).eq("target_username",targetUsername);
    else await db.from("follows").insert({follower_id:myId,target_username:targetUsername});
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl"
        style={{background:"var(--s0)",maxHeight:"80vh"}}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{borderColor:"var(--border-subtle)"}}>
          <span className="font-bold text-base" style={{color:"var(--text-primary)"}}>
            {kind==="followers"?"Seguidores":"Seguindo"}
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--s2)]">
            <X className="h-4 w-4" style={{color:"var(--text-muted)"}} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 py-2">
          {isLoading ? (
            [1,2,3].map(i=>(
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-10 h-10 rounded-full" style={{background:"var(--s3)"}}/>
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded-full w-1/2" style={{background:"var(--s3)"}}/>
                  <div className="h-2.5 rounded-full w-1/3" style={{background:"var(--s3)"}}/>
                </div>
              </div>
            ))
          ) : data.length===0 ? (
            <p className="text-center py-12 text-sm" style={{color:"var(--text-muted)"}}>
              {kind==="followers"?"Ainda sem seguidores":"Não segue ninguém"}
            </p>
          ) : data.map((u:any)=>(
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--s1)] transition">
              <Av name={u.full_name||u.username} src={u.avatar_url} size={42} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{color:"var(--text-primary)"}}>{u.full_name||u.username}</p>
                <p className="text-xs" style={{color:"var(--text-muted)"}}>@{u.username}</p>
              </div>
              {myId && myId!==u.id && (
                <button onClick={()=>toggleFollow(u.id,u.username)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95"
                  style={following.has(u.id)
                    ?{background:"var(--s2)",color:"var(--text-secondary)",border:"1px solid var(--border-default)"}
                    :{background:P,color:"#fff"}}>
                  {following.has(u.id)?"Seguindo":"Seguir"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Modal de Comentários ─── */
function CommentsModal({ postId, onClose }:{ postId:string; onClose:()=>void }) {
  const [myId, setMyId] = useState("");
  const [myUsername, setMyUsername] = useState("");
  const [myAvatar, setMyAvatar] = useState<string|null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    document.body.style.overflow="hidden";
    (async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if (session) {
        setMyId(session.user.id);
        const {data:p}=await (supabase as any).from("profiles").select("username,avatar_url").eq("id",session.user.id).single();
        if (p){ setMyUsername(p.username); setMyAvatar(p.avatar_url); }
      }
      const {data}=await (supabase as any).from("post_comments")
        .select("id,content,created_at,author_id,profiles(username,full_name,avatar_url)")
        .eq("post_id",postId).order("created_at",{ascending:true}).limit(50);
      setComments(data??[]);
      setLoading(false);
    })();
    return ()=>{ document.body.style.overflow=""; };
  },[postId]);

  async function send() {
    if (!text.trim()||!myId||sending) return;
    setSending(true);
    const {data:c}=await (supabase as any).from("post_comments")
      .insert({post_id:postId,author_id:myId,content:text.trim()})
      .select("id,content,created_at,author_id,profiles(username,full_name,avatar_url)")
      .single();
    if (c) setComments(prev=>[...prev,c]);
    setText(""); setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl"
        style={{background:"var(--s0)",maxHeight:"85vh"}}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{borderColor:"var(--border-subtle)"}}>
          <span className="font-bold text-base" style={{color:"var(--text-primary)"}}>Comentários</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--s2)]">
            <X className="h-4 w-4" style={{color:"var(--text-muted)"}} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 py-3 px-4 space-y-3">
          {loading ? (
            [1,2,3].map(i=>(
              <div key={i} className="flex gap-2 animate-pulse">
                <div className="w-8 h-8 rounded-full shrink-0" style={{background:"var(--s3)"}}/>
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded-full w-1/3" style={{background:"var(--s3)"}}/>
                  <div className="h-2.5 rounded-full w-2/3" style={{background:"var(--s3)"}}/>
                </div>
              </div>
            ))
          ) : comments.length===0 ? (
            <p className="text-center py-8 text-sm" style={{color:"var(--text-muted)"}}>Sem comentários ainda. Sê o primeiro!</p>
          ) : comments.map((c:any)=>{
            const prof = c.profiles;
            return (
              <div key={c.id} className="flex gap-2.5">
                <Av name={prof?.full_name||prof?.username||"?"} src={prof?.avatar_url} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl px-3 py-2" style={{background:"var(--s2)"}}>
                    <p className="text-xs font-bold" style={{color:"var(--text-primary)"}}>{prof?.full_name||prof?.username}</p>
                    <p className="text-sm mt-0.5 leading-relaxed" style={{color:"var(--text-secondary)"}}>{c.content}</p>
                  </div>
                  <p className="text-[10px] mt-1 ml-2" style={{color:"var(--text-muted)"}}>{timeAgo(c.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
        {myId && (
          <div className="px-4 py-3 border-t flex gap-2 items-end shrink-0" style={{borderColor:"var(--border-subtle)"}}>
            <Av name={myUsername} src={myAvatar} size={34} />
            <div className="flex-1 relative">
              <textarea ref={inputRef} value={text} onChange={e=>setText(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                placeholder="Escreve um comentário…" rows={1}
                className="w-full resize-none rounded-2xl px-4 py-2 text-sm outline-none border pr-10"
                style={{background:"var(--s2)",borderColor:"var(--border-default)",color:"var(--text-primary)",maxHeight:120}} />
              <button onClick={send} disabled={!text.trim()||sending}
                className="absolute right-2 bottom-2 w-7 h-7 rounded-full flex items-center justify-center transition disabled:opacity-40"
                style={{background:P}}>
                <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Modal Denunciar ─── */
function ReportModal({ username, userId, onClose }:{ username:string; userId:string; onClose:()=>void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(()=>{ document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=""; }; },[]);

  const reasons = ["Spam ou conteúdo enganoso","Assédio ou bullying","Conteúdo inapropriado","Conta falsa ou impostura","Venda de produtos ilegais","Outro motivo"];

  async function send() {
    if (!reason||sending) return;
    setSending(true);
    try {
      const {data:{session}}=await supabase.auth.getSession();
      await (supabase as any).from("reports").insert({
        reporter_id:session?.user.id, reported_user_id:userId, reason, kind:"profile"
      });
    } catch(_){}
    setDone(true);
    setTimeout(()=>onClose(),1600);
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{background:"var(--s0)"}}>
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{borderColor:"var(--border-subtle)"}}>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4" style={{color:PINK}} />
            <span className="font-bold text-sm" style={{color:"var(--text-primary)"}}>Denunciar @{username}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--s2)]">
            <X className="h-4 w-4" style={{color:"var(--text-muted)"}} />
          </button>
        </div>
        <div className="p-5 space-y-2.5">
          {done ? (
            <div className="py-8 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-bold" style={{color:"var(--text-primary)"}}>Denúncia enviada</p>
              <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>Obrigado pelo teu feedback.</p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-3" style={{color:"var(--text-muted)"}}>Porque queres denunciar este perfil?</p>
              {reasons.map(r=>(
                <button key={r} onClick={()=>setReason(r)}
                  className="w-full text-left px-4 py-2.5 rounded-2xl text-sm border transition"
                  style={{
                    borderColor:reason===r?PINK:"var(--border-subtle)",
                    background:reason===r?PINK+"10":"var(--s1)",
                    color:"var(--text-primary)", fontWeight:reason===r?600:400,
                  }}>
                  {r}
                </button>
              ))}
              <button onClick={send} disabled={!reason||sending}
                className="w-full h-11 rounded-2xl font-bold text-sm text-white mt-2 transition disabled:opacity-40"
                style={{background:PINK}}>
                {sending?"A enviar...":"Enviar denúncia"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════ */
function UserProfilePage() {
  const { username } = useParams({ from: "/u/$username" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─ Sessão (perfil é público — não bloqueia visitantes sem sessão) ─ */
  const [myId, setMyId] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if (session) setMyId(session.user.id);
      setSessionChecked(true);
    });
  },[]);

  /* ─ UI state ─ */
  const [openingChat, setOpeningChat] = useState(false);
  const [followOverride, setFollowOverride] = useState<boolean|null>(null);
  const [followerDelta, setFollowerDelta] = useState(0);
  const [likeOverrides, setLikeOverrides] = useState<Record<string,boolean>>({});
  const [likeCountOverrides, setLikeCountOverrides] = useState<Record<string,number>>({});
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [repostingPost, setRepostingPost] = useState<any>(null);
  const [forwardingPost, setForwardingPost] = useState<any>(null);
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string|null>(null);
  const [photoViewing, setPhotoViewing] = useState<string|null>(null);

  /* ─ Query 1: Perfil ─ */
  const profileQuery = useQuery({
    queryKey:["profileByUsername", username],
    queryFn: async ()=>{
      const {data}=await (supabase as any).from("profiles")
        .select("id,username,full_name,bio,avatar_url,cover_url,website,location,created_at")
        .eq("username",username).maybeSingle();
      return data;
    },
    staleTime:5*60_000,
  });
  const profile = profileQuery.data ?? null;
  const profileId = profile?.id;

  /* Redireciona se for o próprio */
  useEffect(()=>{
    if (sessionChecked&&myId&&profileId&&profileId===myId)
      navigate({to:"/perfil",replace:true});
  },[sessionChecked,myId,profileId,navigate]);

  /* ─ Query 2: Stats + follow ─ */
  const statsQuery = useQuery({
    queryKey:["profileStats2", username, profileId, myId],
    queryFn: async ()=>{
      const db=supabase as any;
      const [
        followRowRes,
        {count:fc},
        {count:foc},
        {count:pc},
      ] = await Promise.all([
        myId
          ? db.from("follows").select("follower_id").eq("follower_id",myId).eq("target_username",username).maybeSingle()
          : Promise.resolve({data:null}),
        db.from("follows").select("*",{count:"exact",head:true}).eq("target_username",username),
        db.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",profileId),
        db.from("posts").select("*",{count:"exact",head:true}).eq("author_id",profileId),
      ]);
      return { following:!!followRowRes?.data, followerCount:fc??0, followingCount:foc??0, postCount:pc??0 };
    },
    enabled:!!profileId,
    staleTime:30_000,
  });

  /* ─ Query 3: Posts ─ */
  const postsQuery = useQuery({
    queryKey:["profilePosts2", profileId],
    queryFn: async ()=>{
      const {data}=await (supabase as any).from("posts")
        .select("id,author_id,content,kind,created_at,photo_url,image_url,video_url,clip_title,clip_thumb_url,channel_name,channel_handle,channel_avatar,clip_video_id,clip_start,clip_end,likes_count,views_count")
        .eq("author_id",profileId)
        .order("created_at",{ascending:false})
        .limit(30);

      const posts = (data??[]).filter((p:any) => p.kind !== "clip" || p.author_id === profileId);

      // Buscar cf_stream_url dos vídeos referenciados pelos clips
      const clipVideoIds = [...new Set(posts.filter((p:any)=>p.clip_video_id).map((p:any)=>p.clip_video_id))];
      const streamMap: Record<string, string> = {};
      if (clipVideoIds.length > 0) {
        const {data: vids} = await (supabase as any).from("videos")
          .select("id,cf_stream_url,cf_embed_url").in("id", clipVideoIds);
        (vids??[]).forEach((v:any) => {
          streamMap[v.id] = v.cf_stream_url || v.cf_embed_url || "";
        });
      }

      return posts.map((p:any)=>{
        let text=p.content, bgColor:string|null=null;
        if (p.kind==="bg"){ try{const j=JSON.parse(p.content);text=j.text;bgColor=j.bgColor;}catch(_){} }
        return {
          id:p.id, text, bgColor,
          createdAt:p.created_at, kind:p.kind,
          photo:p.photo_url||p.image_url||null,
          videoUrl:p.video_url||null,
          clipTitle:p.clip_title||null,
          clipThumb:p.clip_thumb_url||null,
          clipVideoId:p.clip_video_id||null,
          clipStart:p.clip_start??0, clipEnd:p.clip_end??0,
          channelName:p.channel_name||null,
          channelHandle:p.channel_handle||null,
          channelAvatar:p.channel_avatar||null,
          videoStreamUrl: p.clip_video_id ? (streamMap[p.clip_video_id]||null) : null,
          likesCount:p.likes_count??0,
          viewsCount:(p as any).views_count??0,
        };
      });
    },
    enabled:!!profileId,
    staleTime:30_000,
  });

  /* ─ Query 4: Likes do utilizador ─ */
  const posts = postsQuery.data??[];
  const postIds = useMemo(()=>posts.map((p:any)=>p.id),[posts]);
  const likesQuery = useQuery({
    queryKey:["profileLikes2", myId, postIds.join(",")],
    queryFn: async ()=>{
      const {data}=await (supabase as any).from("post_likes")
        .select("post_id").eq("user_id",myId).in("post_id",postIds);
      return new Set<string>((data??[]).map((l:any)=>l.post_id));
    },
    enabled:!!myId&&postIds.length>0,
    staleTime:30_000,
  });
  const likedPosts:Set<string> = likesQuery.data??new Set();

  /* ─ Valores derivados ─ */
  const following = followOverride??statsQuery.data?.following??false;
  const followerCount = (statsQuery.data?.followerCount??0)+followerDelta;
  const followingCount = statsQuery.data?.followingCount??0;
  const postCount = statsQuery.data?.postCount??0;
  const name = profile?.full_name||profile?.username||username;
  const avatarUrl = profile?.avatar_url||null;
  const coverUrl = profile?.cover_url||null;
  const color = colorFor(username);

  /* ─ Ações ─ */
  async function toggleFollow() {
    if (!profile||!myId) return;
    const next=!following;
    setFollowOverride(next);
    setFollowerDelta(d=>d+(next?1:-1));
    const db=supabase as any;
    try {
      if (!next) await db.from("follows").delete().eq("follower_id",myId).eq("target_username",username);
      else await db.from("follows").insert({follower_id:myId,target_username:username});
      qc.invalidateQueries({queryKey:["profileStats2",username,profileId,myId]});
    } catch(_){ setFollowOverride(!next); setFollowerDelta(d=>d-(next?1:-1)); }
  }

  async function openChat() {
    if (!profile||!myId||openingChat) return;
    setOpeningChat(true);
    try {
      const db=supabase as any;
      const {data:tp}=await db.from("profiles").select("msg_permission").eq("id",profile.id).single();
      const perm=tp?.msg_permission??"todos";

      /* Verificar conversa existente */
      const {data:myConvs}=await db.from("conversation_participants").select("conversation_id").eq("user_id",myId);
      if (myConvs?.length>0){
        const ids=myConvs.map((c:any)=>c.conversation_id);
        const {data:shared}=await db.from("conversation_participants").select("conversation_id")
          .eq("user_id",profile.id).in("conversation_id",ids).maybeSingle();
        if (shared){ navigate({to:"/mensagens",search:{conv:shared.conversation_id} as any}); return; }
      }

      /* Permissão restrita */
      if (perm!=="todos"){
        const {data:req}=await db.from("message_requests").select("id,status")
          .eq("sender_id",myId).eq("receiver_id",profile.id).maybeSingle();
        if (req?.status==="rejected"){ toast.error(`@${profile.username} não aceita pedidos.`); return; }
        if (!req) await db.from("message_requests").insert({
          sender_id:myId,receiver_id:profile.id,preview_text:"Quero enviar-te uma mensagem.",status:"pending"
        });
        toast.success(`Pedido enviado a @${profile.username}!`); return;
      }

      /* Criar conversa nova */
      const {data:conv,error}=await db.from("conversations").insert({type:"direct"}).select("id").single();
      if (error||!conv?.id){ toast.error("Erro ao iniciar conversa"); return; }
      await db.from("conversation_participants").insert([
        {conversation_id:conv.id,user_id:myId},
        {conversation_id:conv.id,user_id:profile.id},
      ]);
      navigate({to:"/mensagens",search:{conv:conv.id} as any});
    } finally { setOpeningChat(false); }
  }

  async function toggleLike(postId:string, currentCount:number) {
    if (!myId) { toast.error("Inicia sessão para gostar."); return; }
    const isLiked=likeOverrides[postId]??likedPosts.has(postId);
    setLikeOverrides(prev=>({...prev,[postId]:!isLiked}));
    setLikeCountOverrides(prev=>({...prev,[postId]:(prev[postId]??currentCount)+(isLiked?-1:1)}));
    const db=supabase as any;
    try {
      if (isLiked) await db.from("post_likes").delete().eq("post_id",postId).eq("user_id",myId);
      else await db.from("post_likes").insert({post_id:postId,user_id:myId});
    } catch(_){
      setLikeOverrides(prev=>({...prev,[postId]:isLiked}));
      setLikeCountOverrides(prev=>({...prev,[postId]:currentCount}));
    }
  }

  function shareProfile() {
    setShowShareModal(true);
    setShowMenu(false);
  }

  /* ─ Loading ─ */
  if (profileQuery.isLoading) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="animate-pulse">
          <div className="h-36" style={{background:"var(--s3)"}}/>
          <div className="px-4 pt-3 pb-4 space-y-3">
            <div className="h-5 w-1/3 rounded-full" style={{background:"var(--s3)"}}/>
            <div className="h-3 w-1/4 rounded-full" style={{background:"var(--s3)"}}/>
            <div className="h-3 w-2/3 rounded-full" style={{background:"var(--s3)"}}/>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  if (!profile) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-8">
          <p className="text-5xl">🔍</p>
          <p className="font-bold text-lg" style={{color:"var(--text-primary)"}}>Utilizador não encontrado</p>
          <p className="text-sm" style={{color:"var(--text-muted)"}}>@{username} não existe na Hooda</p>
          <button onClick={()=>navigate({to:"/home"})}
            className="mt-2 px-6 py-2.5 rounded-full text-white font-bold text-sm"
            style={{background:P}}>
            Voltar ao início
          </button>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {/* ── Header fixo ── */}
        <header className="sticky top-0 z-30 border-b"
          style={{background:"var(--s0)",borderColor:"var(--border-subtle)"}}>
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={()=>navigate({to:"/home"})}
              className="p-2 rounded-full hover:bg-[var(--s2)] transition active:scale-90">
              <ChevronLeft className="h-5 w-5" style={{color:"var(--text-primary)"}} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate" style={{color:"var(--text-primary)"}}>{name}</p>
              <p className="text-[11px]" style={{color:"var(--text-muted)"}}>{postCount} publicações</p>
            </div>
            <button onClick={()=>setShowMenu(m=>!m)}
              className="p-2 rounded-full hover:bg-[var(--s2)] transition relative">
              <MoreHorizontal className="h-5 w-5" style={{color:"var(--text-primary)"}} />
              {showMenu && (
                <div className="absolute right-0 top-10 w-48 rounded-2xl shadow-2xl py-1 z-50"
                  style={{background:"var(--s0)",border:"1px solid var(--border-subtle)"}}>
                  {[
                    {icon:<Share2 className="h-4 w-4"/>, label:"Partilhar perfil", action:shareProfile},
                    {icon:<Flag className="h-4 w-4"/>, label:"Denunciar", action:()=>{setShowMenu(false);setShowReport(true);}},
                  ].map(item=>(
                    <button key={item.label} onClick={item.action}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--s2)] transition text-left"
                      style={{color:"var(--text-primary)"}}>
                      <span style={{color:"var(--text-muted)"}}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              )}
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto">

          {/* ── Capa ── */}
          <div className="relative" style={{height:140}}>
            {coverUrl
              ? <img src={coverUrl} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full"
                  style={{background:`linear-gradient(135deg,${color} 0%,#1FAFA6 50%,#FFC93C 100%)`}}/>}
            {/* Avatar */}
            <div className="absolute" style={{bottom:-44,left:16}}>
              <div className="rounded-full p-[3px]" style={{background:GRAD}}>
                <div className="rounded-full p-[2px]" style={{background:"var(--s0)"}}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={name}
                        className="rounded-full object-cover cursor-pointer"
                        style={{width:86,height:86,border:"3px solid var(--s0)"}}
                        onClick={()=>setPhotoViewing(avatarUrl)}/>
                    : <div className="rounded-full flex items-center justify-center font-bold text-white text-3xl"
                        style={{width:86,height:86,background:color}}>
                        {name[0]?.toUpperCase()}
                      </div>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Botões de ação ── */}
          <div className="flex justify-end gap-2 px-4 pt-3 pb-2">
            <button onClick={openChat} disabled={openingChat}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition active:scale-95 disabled:opacity-60"
              style={{borderColor:"var(--border-default)",color:"var(--text-primary)",background:"var(--s0)"}}>
              {openingChat
                ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:P,borderTopColor:"transparent"}}/>
                : <MessageCircle className="h-4 w-4" style={{color:P}}/>}
              Mensagem
            </button>
            <button onClick={toggleFollow}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-full text-sm font-bold transition active:scale-95 shadow-sm"
              style={following
                ?{background:"var(--s2)",border:"1px solid var(--border-default)",color:"var(--text-secondary)"}
                :{background:P,color:"#fff"}}>
              {following ? <><UserCheck className="h-4 w-4"/>Seguindo</> : <><UserPlus className="h-4 w-4"/>Seguir</>}
            </button>
          </div>

          {/* ── Info ── */}
          <div className="px-4 pt-8 pb-3">
            <h1 className="text-xl font-extrabold" style={{color:"var(--text-primary)"}}>{name}</h1>
            <p className="text-sm mt-0.5" style={{color:"var(--text-muted)"}}>@{profile.username}</p>
            {profile.bio && (
              <p className="text-sm mt-2 leading-relaxed" style={{color:"var(--text-secondary)"}}>{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {profile.location && (
                <span className="flex items-center gap-1 text-xs" style={{color:"var(--text-muted)"}}>
                  <MapPin className="h-3.5 w-3.5"/>{profile.location}
                </span>
              )}
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs hover:underline" style={{color:P}}>
                  <LinkIcon className="h-3.5 w-3.5"/>{profile.website.replace(/^https?:\/\//,"")}
                </a>
              )}
              {profile.created_at && (
                <span className="flex items-center gap-1 text-xs" style={{color:"var(--text-muted)"}}>
                  <Calendar className="h-3.5 w-3.5"/>
                  Membro desde {new Date(profile.created_at).toLocaleDateString("pt-PT",{month:"long",year:"numeric"})}
                </span>
              )}
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {[
              {n:postCount, l:"Publicações", action:undefined},
              {n:followerCount, l:"Seguidores", action:()=>setShowFollowers(true)},
              {n:followingCount, l:"Seguindo", action:()=>setShowFollowing(true)},
            ].map(s=>(
              <button key={s.l} onClick={s.action}
                className="rounded-2xl py-3 text-center border transition hover:bg-[var(--s2)] active:scale-95"
                style={{background:"var(--s0)",borderColor:"var(--border-subtle)"}}>
                {statsQuery.isLoading
                  ? <div className="h-5 w-8 rounded-full mx-auto animate-pulse" style={{background:"var(--s3)"}}/>
                  : <p className="text-lg font-extrabold" style={{color:"var(--text-primary)"}}>{fmtNum(s.n)}</p>}
                <p className="text-[11px] font-medium mt-0.5" style={{color:"var(--text-muted)"}}>{s.l}</p>
              </button>
            ))}
          </div>

          {/* ── Separador ── */}
          <div className="border-t mx-4 mb-2" style={{borderColor:"var(--border-subtle)"}}/>

          {/* ── Posts ── */}
          {postsQuery.isLoading ? (
            <div className="space-y-4 px-4 py-2">
              {[1,2].map(i=>(
                <div key={i} className="rounded-2xl border animate-pulse p-4 space-y-3"
                  style={{borderColor:"var(--border-subtle)"}}>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full" style={{background:"var(--s3)"}}/>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded-full" style={{background:"var(--s3)"}}/>
                      <div className="h-2.5 w-1/4 rounded-full" style={{background:"var(--s3)"}}/>
                    </div>
                  </div>
                  <div className="h-40 rounded-xl" style={{background:"var(--s3)"}}/>
                </div>
              ))}
            </div>
          ) : posts.length===0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{background:P+"12"}}>
                <Camera className="h-7 w-7" style={{color:P}}/>
              </div>
              <p className="font-bold" style={{color:"var(--text-primary)"}}>Ainda sem publicações</p>
              <p className="text-sm" style={{color:"var(--text-muted)"}}>
                {following?"Quando publicar, aparece aqui.":"Segue para ver as publicações."}
              </p>
            </div>
          ) : (
            <div className="pb-4 space-y-3 px-2">
              {posts.map((post:any)=>{
                const isLiked = likeOverrides[post.id]??likedPosts.has(post.id);
                const likeCount = likeCountOverrides[post.id]??post.likesCount;
                return (
                  <article key={post.id} className="rounded-2xl overflow-hidden border"
                    style={{background:"var(--s0)",borderColor:"var(--border-subtle)"}}>

                    {/* Cabeçalho do post */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Av name={name} src={avatarUrl} size={40} color={color}/>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm" style={{color:"var(--text-primary)"}}>{name}</p>
                        <p className="text-[11px]" style={{color:"var(--text-muted)"}}>
                          @{profile.username} · {timeAgo(post.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Conteúdo */}
                    {post.text&&!post.bgColor&&(
                      <p className="px-4 pb-3 text-sm leading-relaxed" style={{color:"var(--text-secondary)"}}>
                        <RichText text={post.text} />
                      </p>
                    )}
                    {post.bgColor&&(
                      <div className="px-4 pb-3">
                        <div className="rounded-2xl px-5 py-8 flex items-center justify-center min-h-32"
                          style={{background:post.bgColor}}>
                          <RichText text={post.text} className="font-bold text-center leading-snug text-white text-xl" />
                        </div>
                      </div>
                    )}
                    {post.photo&&(
                      <img src={post.photo} alt="" className="w-full object-cover"
                        style={{maxHeight:480}} loading="lazy"
                        onContextMenu={e=>e.preventDefault()}/>
                    )}
                    {post.videoUrl&&!post.photo&&(
                      <>
                        <VideoPlayer src={post.videoUrl} postId={post.id} kind="video"/>
                        <div className="px-4 py-1.5 flex items-center gap-1"
                          style={{background:"var(--s1)"}}>
                          <Eye className="w-3.5 h-3.5" style={{color:"var(--text-muted)"}}/>
                          <span className="text-[11px]" style={{color:"var(--text-muted)"}}>
                            {fmtNum(post.viewsCount??0)} visualizações
                          </span>
                        </div>
                      </>
                    )}
                    {post.kind==="clip"&&post.clipVideoId&&(
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 border-t"
                          style={{borderColor:"var(--border-subtle)",background:"var(--s1)"}}>
                          {post.channelAvatar
                            ?<img src={post.channelAvatar} alt="" className="w-6 h-6 rounded-full object-cover"/>
                            :<div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{background:P}}>{post.channelName?.[0]}</div>}
                          <span className="text-xs font-semibold truncate" style={{color:"var(--text-primary)"}}>{post.channelName}</span>
                          <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full font-bold"
                            style={{background:P+"15",color:P}}>✂ Clipe</span>
                        </div>
                        {post.videoStreamUrl
                          ?<VideoPlayer src={post.videoStreamUrl} poster={post.clipThumb??undefined} postId={post.id} kind="clip"/>
                          :post.clipThumb
                            ?<button onClick={()=>navigate({to:`/hoodatv/watch/${post.clipVideoId}`})} className="w-full block">
                                <img src={post.clipThumb} alt="" className="w-full object-cover" style={{maxHeight:280}}/>
                              </button>
                            :null}
                        {post.clipTitle&&(
                          <p className="px-4 py-2 text-sm font-semibold" style={{color:"var(--text-primary)"}}>{post.clipTitle}</p>
                        )}
                        <div className="px-4 pb-2">
                          <button onClick={()=>navigate({to:`/hoodatv/watch/${post.clipVideoId}`})}
                            className="text-xs font-bold px-3 py-1.5 rounded-xl transition"
                            style={{color:P,background:P+"10"}}>
                            Ver vídeo completo →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex items-center px-3 py-2 border-t gap-0.5"
                      style={{borderColor:"var(--border-subtle)"}}>
                      <button onClick={()=>toggleLike(post.id,post.likesCount)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 group">
                        <Heart className={`h-5 w-5 transition-all ${isLiked?"fill-red-500 text-red-500 scale-110":"text-[var(--text-muted)] group-hover:text-red-400"}`}/>
                        {likeCount>0&&<span className="text-xs font-semibold"
                          style={{color:isLiked?"#ef4444":"var(--text-muted)"}}>{fmtNum(likeCount)}</span>}
                      </button>
                      <button onClick={()=>setCommentPostId(post.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 hover:bg-[var(--s2)]">
                        <MessageSquare className="h-5 w-5" style={{color:"var(--text-muted)"}}/>
                      </button>
                      <button onClick={()=>{ if(!myId){toast.error("Inicia sessão para repostar.");return;} setRepostingPost(post); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 hover:bg-[var(--s2)]">
                        <Repeat2 className="h-5 w-5" style={{color: repostedIds.has(post.id) ? "#1FAFA6" : "var(--text-muted)"}}/>
                      </button>
                      <button onClick={()=>{ if(!myId){toast.error("Inicia sessão para reencaminhar.");return;} setForwardingPost(post); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 hover:bg-[var(--s2)]">
                        <Forward className="h-5 w-5" style={{color:"var(--text-muted)"}}/>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ── Denunciar perfil ── */}
          {!postsQuery.isLoading && (
            <div className="px-4 pb-8">
              <button onClick={()=>setShowReport(true)}
                className="w-full h-11 rounded-xl border text-sm flex items-center justify-center gap-2 transition hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                style={{borderColor:"var(--border-default)",color:"var(--text-muted)"}}>
                <Flag className="h-4 w-4"/> Denunciar perfil
              </button>
            </div>
          )}
        </main>

        <BottomNav />
      </PageWrapper>

      {/* ── Modais ── */}
      {showFollowers && <FollowListModal userId={profileId!} kind="followers" onClose={()=>setShowFollowers(false)}/>}
      {showFollowing && <FollowListModal userId={profileId!} kind="following" onClose={()=>setShowFollowing(false)}/>}
      {commentPostId && <CommentsModal postId={commentPostId} onClose={()=>setCommentPostId(null)}/>}
      {showReport && <ReportModal username={profile.username} userId={profileId!} onClose={()=>setShowReport(false)}/>}

      {/* ── Visualizador de foto ── */}
      {photoViewing && (
        <PhotoViewer
          src={photoViewing}
          alt={name}
          subtitle={profile?.username ? `@${profile.username}` : undefined}
          onClose={() => setPhotoViewing(null)}
        />
      )}

      {/* Fechar menu ao clicar fora */}
      {showMenu && (
        <div className="fixed inset-0 z-40" onClick={()=>setShowMenu(false)}/>
      )}

      {showShareModal && (
        <ShareProfileModal username={profile.username} name={name} onClose={() => setShowShareModal(false)} />
      )}

      {repostingPost && myId && (
        <RepostModal
          post={{ ...repostingPost, authorUsername: profile.username }}
          myId={myId}
          myUsername={profile.username}
          onClose={() => setRepostingPost(null)}
          onReposted={(_, did) => {
            setRepostedIds(prev => {
              const next = new Set(prev);
              if (did) next.add(repostingPost.id); else next.delete(repostingPost.id);
              return next;
            });
          }}
        />
      )}

      {forwardingPost && myId && (
        <ForwardModal
          post={{ ...forwardingPost, authorUsername: profile.username }}
          myId={myId}
          onClose={() => setForwardingPost(null)}
        />
      )}
    </>
  );
}
