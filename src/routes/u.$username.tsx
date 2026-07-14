import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useScrollLock } from "@/hooks/useScrollLock";
import { RichText } from "@/components/RichText";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { UniversalPostCard, normalizePost } from "@/components/UniversalPostCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike } from "@/lib/comments";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { UniversalSkeleton } from "@/components/Skeletons";
import {
  ChevronLeft, Flag, Share2, Ban,
  MoreHorizontal, X, MapPin,
  Link as LinkIcon, Calendar, Camera, MessageCircle,
  Copy, Check, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "Baya" }] }),
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


/* ── Modal Partilhar Perfil ── */

/* ── PostShareSheet — partilhar publicação igual ao perfil (92vh, link /post/id, copiar+nativa) ── */
function PostShareSheet({ postId, postText, authorName, onClose }: { postId: string; postText?: string; authorName: string; onClose: () => void }) {
  const [linkCopied, setLinkCopied] = useState(false);
  useScrollLock(true);
  const url = `${window.location.origin}/post/${postId}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
        style={{ maxHeight: "92vh", height: "92vh" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>Partilhar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full transition" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Link da publicação</p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-3" style={{ background: "var(--s2)" }}>
            <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>{url}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1"
              style={{ background: linkCopied ? "#6BA547" : P, color: "#fff" }}>
              {linkCopied ? (<><Check className="h-3.5 w-3.5" /> Copiado</>) : "Copiar"}
            </button>
          </div>

          {typeof navigator.share === "function" && (
            <button
              onClick={() => {
                navigator.share({ title: `Publicação de ${authorName}`, text: postText || "Vê esta publicação na Baya", url }).catch(() => {});
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] border"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
              <Share2 className="h-4 w-4" /> Partilhar via...
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ShareProfileModal({ username, name, onClose }: { username: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/u/${username}`;
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl shadow-2xl p-5"
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

/* ─── Modal de Comentários ─── */
function CommentsModal({ postId, authorId, onClose }:{ postId:string; authorId?:string; onClose:()=>void }) {
  const [myId, setMyId] = useState("");
  const [comments, setComments] = useState<import("@/components/PostCommentsModal").PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(()=>{
    (async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if (session) setMyId(session.user.id);
      const list = await fetchPostComments(postId, session?.user?.id);
      setComments(list);
      setLoading(false);
    })();
  },[postId]);

  async function handleSend(text: string) {
    if (!myId) { toast.error("Inicia sessão para comentar."); return; }
    setSending(true);
    const {data:{session}}=await supabase.auth.getSession();
    const {data:p}=await (supabase as any).from("profiles").select("username").eq("id",myId).maybeSingle();
    const created = await sendPostComment({ postId, userId: myId, username: p?.username || "utilizador", text });
    if (created) setComments(prev=>[created, ...prev]);
    setSending(false);
  }

  async function handleReply(parentId: string, text: string) {
    if (!myId) { toast.error("Inicia sessão para responder."); return; }
    const {data:p}=await (supabase as any).from("profiles").select("username").eq("id",myId).maybeSingle();
    await replyToPostComment({ postId, parentCommentId: parentId, userId: myId, username: p?.username || "utilizador", text });
  }

  async function handleLike(commentId: string) {
    if (!myId) { toast.error("Inicia sessão para curtir."); return; }
    const target = comments.flatMap(c => [c, ...(c.replies||[])]).find(c => c.id === commentId);
    await toggleCommentLike(commentId, myId, !!target?.likedByMe);
  }

  return (
    <PostCommentsModal
      onClose={onClose}
      creatorId={authorId}
      comments={comments}
      loading={loading}
      sending={sending}
      onSend={handleSend}
      onReply={handleReply}
      onLikeComment={handleLike}
    />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full sm:max-w-sm rounded-3xl overflow-hidden shadow-2xl"
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
  const [showReport, setShowReport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{top:number; right:number} | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string|null>(null);
  const [photoViewing, setPhotoViewing] = useState<string|null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  /* ─ Query 1: Perfil ─ */
  const profileQuery = useQuery({
    queryKey:["profileByUsername", username],
    queryFn: async ()=>{
      const {data}=await (supabase as any).from("profiles")
        .select("id,username,full_name,bio,avatar_url,cover_url,website,location,created_at,is_verified,whatsapp")
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

  /* ─ Query 2: Contagem de publicações (o resto do social vem do hook central) ─ */
  const statsQuery = useQuery({
    queryKey:["profilePostCount2", profileId],
    queryFn: async ()=>{
      const {count:pc} = await (supabase as any).from("posts").select("*",{count:"exact",head:true}).eq("author_id",profileId);
      return { postCount:pc??0 };
    },
    enabled:!!profileId,
    staleTime:30_000,
  });

  /* ─ Query 3: Posts ─ */
  const postsQuery = useQuery({
    queryKey:["profilePosts2", profileId],
    queryFn: async ()=>{
      const {data}=await (supabase as any).from("posts")
        .select("id,author_id,content,kind,created_at,photo_url,image_url,photos,video_url,clip_title,clip_thumb_url,clip_video_id,clip_start,clip_end,likes_count,views_count,is_draft,scheduled_at")
        .eq("author_id",profileId)
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
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

      // Contagem de comentários por post
      const postIds = posts.map((p:any)=>p.id);
      const commentsCountMap: Record<string, number> = {};
      if (postIds.length > 0) {
        const {data: commentsData} = await (supabase as any).from("post_comments")
          .select("post_id").in("post_id", postIds);
        (commentsData??[]).forEach((c:any) => {
          commentsCountMap[c.post_id] = (commentsCountMap[c.post_id] ?? 0) + 1;
        });
      }

      return posts.map((p:any)=>{
        let text=p.content, bgColor:string|null=null;
        if (p.kind==="bg"){ try{const j=JSON.parse(p.content);text=j.text;bgColor=j.bgColor;}catch(_){} }
        return {
          id:p.id, text, bgColor,
          createdAt:p.created_at, kind:p.kind,
          photo:p.photo_url||p.image_url||null,
          photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : null,
          videoUrl:p.video_url||null,
          clipTitle:p.clip_title||null,
          clipThumb:p.clip_thumb_url||null,
          clipVideoId:p.clip_video_id||null,
          clipStart:p.clip_start??0, clipEnd:p.clip_end??0,
          videoStreamUrl: p.clip_video_id ? (streamMap[p.clip_video_id]||null) : null,
          likesCount:p.likes_count??0,
          viewsCount:(p as any).views_count??0,
          commentsCount: commentsCountMap[p.id] ?? 0,
        };
      });
    },
    enabled:!!profileId,
    staleTime:30_000,
  });

  const posts = postsQuery.data??[];

  const postCount = statsQuery.data?.postCount??0;
  const name = profile?.full_name||profile?.username||username;
  const avatarUrl = profile?.avatar_url||null;
  const coverUrl = profile?.cover_url||null;
  const color = colorFor(username);

  /* ─ Bloqueio: mesma tabela/lógica usada em mensagens.tsx ─ */
  useEffect(()=>{
    if (!myId||!profileId) { setIsBlocked(false); return; }
    (supabase as any).from("blocked_users").select("blocker_id")
      .eq("blocker_id",myId).eq("blocked_id",profileId).maybeSingle()
      .then(({data}:any)=>setIsBlocked(!!data));
  },[myId,profileId]);

  async function blockUser() {
    if (!myId||!profileId) return;
    setShowBlockConfirm(false);
    const { error } = await (supabase as any).from("blocked_users").upsert(
      { blocker_id:myId, blocked_id:profileId }, { onConflict:"blocker_id,blocked_id" }
    );
    if (error) { toast.error("Erro ao bloquear: "+error.message); return; }
    setIsBlocked(true);
    setShowMenu(false);
    toast.success(`🚫 @${profile?.username} bloqueado`);
  }

  async function unblockUser() {
    if (!myId||!profileId) return;
    const { error } = await (supabase as any).from("blocked_users")
      .delete().eq("blocker_id",myId).eq("blocked_id",profileId);
    if (error) { toast.error("Erro ao desbloquear: "+error.message); return; }
    setIsBlocked(false);
    setShowMenu(false);
    toast.success(`✓ @${profile?.username} desbloqueado`);
  }

  /* ─ Ações ─ */
  function shareProfile() {
    setShowShareModal(true);
    setShowMenu(false);
  }

  /* Fecha o menu de três pontos ao clicar fora — sem overlay a tapar
     os botões (o menu vive num portal, por isso comparamos com o botão
     e com o próprio menu via refs, nunca com z-index). */
  useEffect(() => {
    if (!showMenu) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuBtnRef.current?.contains(target)) return;
      setShowMenu(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showMenu]);

  /* ─ Loading ─ */
  if (profileQuery.isLoading) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <UniversalSkeleton variant="profile" />
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
          <p className="text-sm" style={{color:"var(--text-muted)"}}>@{username} não existe na Baya</p>
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
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
      <FeedLayout
        feed={
        <>
        {/* ── Header fixo ── */}
        <header className="sticky top-0 z-30 border-b"
          style={{background:"var(--s0)",borderColor:"var(--border-subtle)"}}>
          <div className="px-4 h-14 flex items-center gap-3">
            <button onClick={()=>navigate({to:"/home"})}
              className="p-2 rounded-full hover:bg-[var(--s2)] transition active:scale-90">
              <ChevronLeft className="h-5 w-5" style={{color:"var(--text-primary)"}} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate" style={{color:"var(--text-primary)"}}>{name}</p>
              <p className="text-[11px]" style={{color:"var(--text-muted)"}}>{postCount} publicações</p>
            </div>
            <div className="relative">
              <button ref={menuBtnRef} onClick={()=>{
                  if (!showMenu && menuBtnRef.current) {
                    const r = menuBtnRef.current.getBoundingClientRect();
                    setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                  }
                  setShowMenu(m=>!m);
                }}
                className="p-2 rounded-full hover:bg-[var(--s2)] transition">
                <MoreHorizontal className="h-5 w-5" style={{color:"var(--text-primary)"}} />
              </button>
              {showMenu && menuPos && createPortal(
                <div ref={menuRef} className="fixed w-48 rounded-2xl shadow-2xl py-1 z-[999]"
                  style={{background:"var(--s0)",border:"1px solid var(--border-subtle)",top:menuPos.top,right:menuPos.right}}>
                  {[
                    {icon:<Share2 className="h-4 w-4"/>, label:"Partilhar perfil", action:shareProfile, danger:false},
                    ...(myId ? [{
                      icon:<Ban className="h-4 w-4"/>,
                      label: isBlocked ? "Desbloquear" : "Bloquear",
                      action: ()=>{ setShowMenu(false); if (isBlocked) unblockUser(); else setShowBlockConfirm(true); },
                      danger: !isBlocked,
                    }] : []),
                    {icon:<Flag className="h-4 w-4"/>, label:"Denunciar", action:()=>{setShowMenu(false);setShowReport(true);}, danger:false},
                  ].map(item=>(
                    <button key={item.label} onClick={item.action}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--s2)] transition text-left"
                      style={{color: item.danger ? "#ef4444" : "var(--text-primary)"}}>
                      <span style={{color: item.danger ? "#ef4444" : "var(--text-muted)"}}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>
        </header>

        <main className="w-full">

          {/* ── Capa ── */}
          <div className="relative" style={{height:208}}>
            {coverUrl
              ? <img src={coverUrl} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full"
                  style={{background:`linear-gradient(135deg,${color} 0%,#8B5CF6 55%,#E94B8A 100%)`}}/>}
            {/* Avatar */}
            <div className="absolute" style={{bottom:-66,left:20}}>
              {avatarUrl
                ? <img src={avatarUrl} alt={name}
                    className="rounded-full object-cover cursor-pointer"
                    style={{width:132,height:132,border:"4px solid var(--s0)"}}
                    onClick={()=>setPhotoViewing(avatarUrl)}/>
                : <div className="rounded-full flex items-center justify-center font-bold text-white"
                    style={{width:132,height:132,background:color,border:"4px solid var(--s0)",fontSize:40}}>
                    {name[0]?.toUpperCase()}
                  </div>}
            </div>
          </div>

          {/* ── Botões de ação ── */}
          <div className="flex justify-end gap-2 px-4 pt-3 pb-2">
            <button onClick={() => navigate({ to: "/mensagens" })}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-full text-sm font-bold transition active:scale-95 shadow-sm"
              style={{background:"var(--s2)",border:"1px solid var(--border-default)",color:"var(--text-secondary)"}}>
              <MessageCircle className="h-4 w-4"/>Mensagem
            </button>
          </div>

          {/* ── Info ── */}
          <div className="px-4 pt-9 pb-3">
            <h1 className="text-xl font-extrabold inline-flex items-center gap-1.5" style={{color:"var(--text-primary)"}}>
              {name}{profile.is_verified && <VerifiedBadge size={17} />}
            </h1>
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
              {profile.whatsapp && (
                <a href={`https://wa.me/${profile.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs hover:underline" style={{color:"#25D366"}}>
                  <MessageCircle className="h-3.5 w-3.5"/>WhatsApp
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

          {/* ── Separador ── */}
          <div className="border-t mx-4 mb-2" style={{borderColor:"var(--border-subtle)"}}/>

          {/* ── Posts ── */}
          {postsQuery.isLoading ? (
            <div className="px-4 py-2">
              <UniversalSkeleton variant="feed" count={2} />
            </div>
          ) : posts.length===0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{background:P+"12"}}>
                <Camera className="h-7 w-7" style={{color:P}}/>
              </div>
              <p className="font-bold" style={{color:"var(--text-primary)"}}>Ainda sem publicações</p>
              <p className="text-sm" style={{color:"var(--text-muted)"}}>
                Quando publicar, aparece aqui.
              </p>
            </div>
          ) : (
            <div className="pb-6 space-y-3 w-full px-3 pt-2">
              {posts.map((post:any)=>(
                <UniversalPostCard key={post.id}
                  post={normalizePost(post, "userPage", { name, username: profile.username, avatarUrl, authorId: profileId, isVerified: !!profile.is_verified })}
                  onDeleted={()=>qc.invalidateQueries({queryKey:["profilePosts2", profileId]})}
                />
              ))}
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
        </>
        }
        sidebar={<RightSidebar />}
      />
      </PageWrapper>
      </div>

      {/* ── Modais ── */}
      {commentPostId && <CommentsModal postId={commentPostId} authorId={profileId ?? undefined} onClose={()=>setCommentPostId(null)}/>}
      {showReport && <ReportModal username={profile.username} userId={profileId!} onClose={()=>setShowReport(false)}/>}

      {showBlockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:"rgba(0,0,0,0.6)"}} onClick={()=>setShowBlockConfirm(false)}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl p-5" style={{background:"var(--s0)"}}
            onClick={e=>e.stopPropagation()}>
            <p className="font-extrabold text-base mb-1" style={{color:"var(--text-primary)"}}>Bloquear @{profile.username}?</p>
            <p className="text-sm mb-4" style={{color:"var(--text-muted)"}}>
              @{profile.username} deixa de poder enviar-te mensagens ou ver o teu perfil.
            </p>
            <div className="flex gap-2">
              <button onClick={()=>setShowBlockConfirm(false)}
                className="flex-1 h-10 rounded-xl text-sm font-semibold" style={{background:"var(--s2)",color:"var(--text-primary)"}}>
                Cancelar
              </button>
              <button onClick={blockUser}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white" style={{background:"#ef4444"}}>
                Bloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visualizador de foto ── */}
      {photoViewing && (
        <PhotoViewer
          src={photoViewing}
          alt={name}
          subtitle={profile?.username ? `@${profile.username}` : undefined}
          onClose={() => setPhotoViewing(null)}
        />
      )}

      {showShareModal && (
        <ShareProfileModal username={profile.username} name={name} onClose={() => setShowShareModal(false)} />
      )}
    </>
  );
}
