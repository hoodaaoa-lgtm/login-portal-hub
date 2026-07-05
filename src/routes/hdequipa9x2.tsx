import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";
import {
  Lock, Search, Send, LogOut, Loader,
  MessageSquare, ChevronLeft, ShieldAlert, Unlock as UnlockIcon,
  LayoutDashboard, Flag, Users as UsersIcon, Ban, ShieldCheck,
  UsersRound, FileText, Radio, TrendingUp, CheckCircle2, XCircle,
  Trash2, Image as ImageIcon, Video as VideoIcon, ExternalLink,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/hdequipa9x2")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
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
  is_banned?: boolean;
  is_verified?: boolean;
  ban_reason?: string | null;
  created_at?: string;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter?: { username: string; full_name: string | null } | null;
  reported?: { username: string; full_name: string | null } | null;
};

type PostRow = {
  id: string;
  author_id: string;
  author_username: string | null;
  author_name: string | null;
  author_color: string | null;
  content: string | null;
  kind: string | null;
  created_at: string;
  photo_url: string | null;
  photos: string[] | null;
  video_url: string | null;
  video_stream_url: string | null;
  clip_video_id: string | null;
  clip_thumb_url: string | null;
  channel_name: string | null;
  views_count: number | null;
  likes_count: number | null;
  replies_count: number | null;
  reposts_count: number | null;
};

type ChannelRow = {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  created_at: string;
  owner_username?: string | null;
};

type DashboardStats = {
  totalUsers: number;
  newToday: number;
  newWeek: number;
  totalPosts: number;
  postsToday: number;
  totalChannels: number;
  pendingReports: number;
};

type AdminMsg = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type?: string | null;
  media_url?: string | null;
};

/** Nome "Hooda" com as mesmas cores letra-a-letra usadas em todo o site
 * (ver HoodaLogo.tsx) — versão compacta para caber em cabeçalhos do admin. */
const HOODA_LETTERS = [
  { c: "H", col: "#5B3FCF" },
  { c: "o", col: "#F26B3A" },
  { c: "o", col: "#1FAFA6" },
  { c: "d", col: "#6BA547" },
  { c: "a", col: "#E94B8A" },
];
function HoodaWordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", fontWeight: 900, fontSize: size, lineHeight: 1, fontFamily: '"Nunito","Quicksand",system-ui,sans-serif' }}>
      {HOODA_LETTERS.map((l, i) => <span key={i} style={{ color: l.col }}>{l.c}</span>)}
    </span>
  );
}

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

function fmtCount(n?: number | null) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

/** Mídia de uma publicação no admin: foto (grelha) ou vídeo reprodutível
 * (incluindo clipes de canal, que buscam o stream real na tabela videos). */
function AdminPostMedia({ p }: { p: PostRow }) {
  const [clipSrc, setClipSrc] = useState<string | null>(null);
  useEffect(() => {
    if (p.kind !== "clip" || !p.clip_video_id) return;
    db.from("videos").select("cf_stream_url,video_path").eq("id", p.clip_video_id).maybeSingle()
      .then(({ data }: any) => { if (data) setClipSrc(data.cf_stream_url || data.video_path || null); });
  }, [p.kind, p.clip_video_id]);

  const videoSrc = p.kind === "clip" ? clipSrc : (p.video_stream_url || p.video_url || null);
  const photos = p.photos && p.photos.length > 0 ? p.photos : (p.photo_url ? [p.photo_url] : []);

  if (videoSrc) {
    return (
      <video
        src={videoSrc}
        poster={p.clip_thumb_url || undefined}
        controls
        playsInline
        className="w-full max-h-72 rounded-xl bg-black mt-2 object-contain"
      />
    );
  }
  if (photos.length > 0) {
    return (
      <div className={`grid gap-1 mt-2 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {photos.slice(0, 4).map((url, i) => (
          <img key={i} src={url} alt="" className="w-full max-h-56 object-cover rounded-xl" />
        ))}
      </div>
    );
  }
  return null;
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f7f7f9" }}>
        <Loader className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (stage === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: "#f7f7f9" }}>
        <ShieldAlert className="h-10 w-10" style={{ color: "#F26B3A" }} />
        <p className="text-neutral-900 font-bold text-lg">Acesso restrito</p>
        <p className="text-neutral-400 text-sm">Esta área é apenas para a equipa Hooda.</p>
      </div>
    );
  }

  if (stage === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "radial-gradient(circle at 50% 0%, #ede9fe 0%, #f7f7f9 65%)" }}>
        <form onSubmit={tryUnlock} className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center gap-5 shadow-xl"
          style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)", boxShadow: "0 8px 30px rgba(91,63,207,0.45)" }}>
            <Lock className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <p className="flex items-center justify-center gap-1.5"><HoodaWordmark size={22} /><span className="text-neutral-500 font-extrabold text-lg">Oficial</span></p>
            <p className="text-neutral-400 text-xs mt-1">Introduz a palavra-passe de acesso</p>
          </div>
          <input
            type="password"
            autoFocus
            value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdError(false); }}
            placeholder="Palavra-passe"
            className="w-full text-center tracking-[0.3em] text-lg font-bold rounded-2xl px-4 py-3 outline-none text-neutral-900"
            style={{
              background: "#f5f5f7",
              border: pwdError ? "1px solid #EF4444" : "1px solid #e2e2e8",
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
  const [section, setSection] = useState<"dashboard" | "reports" | "users" | "messages" | "posts" | "channels">("dashboard");
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
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportFilter, setReportFilter] = useState<"pending" | "reviewed" | "dismissed">("pending");

  // ── Publicações (moderação) ──
  const [postsList, setPostsList] = useState<PostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsSearch, setPostsSearch] = useState("");

  // ── Canais ──
  const [channelsList, setChannelsList] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsSearch, setChannelsSearch] = useState("");

  // ── Dashboard: números reais ──
  useEffect(() => {
    if (section !== "dashboard" || stats) return;
    (async () => {
      setStatsLoading(true);
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startWeek = new Date(now.getTime() - 7 * 86400000).toISOString();
      const [
        { count: totalUsers },
        { count: newToday },
        { count: newWeek },
        { count: totalPosts },
        { count: postsToday },
        { count: totalChannels },
        { count: pendingReports },
      ] = await Promise.all([
        db.from("profiles").select("*", { count: "exact", head: true }),
        db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startToday),
        db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startWeek),
        db.from("posts").select("*", { count: "exact", head: true }),
        db.from("posts").select("*", { count: "exact", head: true }).gte("created_at", startToday),
        db.from("channels").select("*", { count: "exact", head: true }),
        db.from("user_reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setStats({
        totalUsers: totalUsers ?? 0, newToday: newToday ?? 0, newWeek: newWeek ?? 0,
        totalPosts: totalPosts ?? 0, postsToday: postsToday ?? 0, totalChannels: totalChannels ?? 0,
        pendingReports: pendingReports ?? 0,
      });
      setStatsLoading(false);
    })();
  }, [section, stats]);

  // ── Denúncias: lista com dados do denunciante/denunciado ──
  const loadReports = useCallback(async (status: string) => {
    setReportsLoading(true);
    const { data, error } = await db
      .from("user_reports")
      .select("id,reporter_id,reported_user_id,reason,status,created_at")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { console.error("[admin] erro a carregar denúncias:", error); toast.error("Erro ao carregar denúncias: " + error.message); setReports([]); setReportsLoading(false); return; }
    const ids = Array.from(new Set((data ?? []).flatMap((r: any) => [r.reporter_id, r.reported_user_id])));
    const profileMap: Record<string, { username: string; full_name: string | null }> = {};
    if (ids.length > 0) {
      const { data: profs } = await db.from("profiles").select("id,username,full_name").in("id", ids);
      (profs ?? []).forEach((p: any) => { profileMap[p.id] = { username: p.username, full_name: p.full_name }; });
    }
    setReports((data ?? []).map((r: any) => ({
      ...r, reporter: profileMap[r.reporter_id] ?? null, reported: profileMap[r.reported_user_id] ?? null,
    })));
    setReportsLoading(false);
  }, []);

  useEffect(() => {
    if (section !== "reports") return;
    loadReports(reportFilter);
  }, [section, reportFilter, loadReports]);

  async function resolveReport(id: string, status: "reviewed" | "dismissed") {
    const { error } = await db.from("user_reports")
      .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Não foi possível atualizar a denúncia."); return; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success(status === "reviewed" ? "Denúncia marcada como resolvida." : "Denúncia ignorada.");
  }

  /**
   * Envia uma mensagem oficial (conta "Hooda Oficial") a um utilizador —
   * usado para avisar quando uma publicação/canal dele é removido.
   * Encontra ou cria a conversa oficial, igual à lógica de openUser().
   */
  const notifyUserOfficial = useCallback(async (userId: string, text: string) => {
    try {
      const { data: myConvs } = await db
        .from("conversation_participants").select("conversation_id").eq("user_id", adminId);
      const myConvIds = (myConvs ?? []).map((c: any) => c.conversation_id);
      let foundId = "";
      if (myConvIds.length > 0) {
        const { data: shared } = await db
          .from("conversation_participants").select("conversation_id")
          .eq("user_id", userId).in("conversation_id", myConvIds);
        const sharedIds = (shared ?? []).map((c: any) => c.conversation_id);
        if (sharedIds.length > 0) {
          const { data: officialConv } = await db
            .from("conversations").select("id").in("id", sharedIds).eq("is_official", true).maybeSingle();
          if (officialConv?.id) foundId = officialConv.id;
        }
      }
      if (!foundId) {
        const { data: newConv, error: convErr } = await db
          .from("conversations").insert({ is_official: true, reply_allowed: true }).select("id").single();
        if (convErr) throw convErr;
        foundId = newConv.id;
        const { error: partErr } = await db.from("conversation_participants").insert([
          { conversation_id: foundId, user_id: adminId },
          { conversation_id: foundId, user_id: userId },
        ]);
        if (partErr) throw partErr;
      }
      const { error: msgErr } = await db.from("messages").insert({
        conversation_id: foundId, sender_id: adminId, receiver_id: userId,
        content: text, status: "sent", message_type: "text",
      });
      if (msgErr) throw msgErr;
    } catch (err) {
      console.error("[admin] erro ao notificar utilizador:", err);
    }
  }, [adminId]);

  // ── Publicações: lista real + eliminar com aviso ao autor ──
  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const { data, error } = await db
      .from("posts")
      .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url,video_stream_url,clip_video_id,clip_thumb_url,channel_name,views_count,likes_count,replies_count,reposts_count")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { console.error("[admin] erro a carregar publicações:", error); toast.error("Erro ao carregar publicações: " + error.message); setPostsList([]); setPostsLoading(false); return; }
    setPostsList(data ?? []);
    setPostsLoading(false);
  }, []);

  useEffect(() => { if (section === "posts") loadPosts(); }, [section, loadPosts]);

  async function deletePost(p: PostRow) {
    const reason = window.prompt(
      "Motivo da remoção (fica registado e é enviado ao autor):",
      "A tua publicação foi removida por violar os nossos termos de utilização."
    );
    if (reason === null) return; // admin cancelou
    const { error } = await db.from("posts").delete().eq("id", p.id);
    if (error) { toast.error("Não foi possível eliminar a publicação."); return; }
    setPostsList((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("Publicação eliminada.");
    if (p.author_id) {
      notifyUserOfficial(p.author_id, reason.trim() || "A tua publicação foi removida por violar os nossos termos de utilização.");
    }
  }

  // ── Canais: lista real + eliminar com aviso ao dono ──
  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    const { data, error } = await db
      .from("channels")
      .select("id,owner_id,name,handle,avatar_url,category,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { console.error("[admin] erro a carregar canais:", error); toast.error("Erro ao carregar canais: " + error.message); setChannelsList([]); setChannelsLoading(false); return; }
    const ownerIds = Array.from(new Set((data ?? []).map((c: any) => c.owner_id)));
    const ownerMap: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: profs } = await db.from("profiles").select("id,username").in("id", ownerIds);
      (profs ?? []).forEach((p: any) => { ownerMap[p.id] = p.username; });
    }
    setChannelsList((data ?? []).map((c: any) => ({ ...c, owner_username: ownerMap[c.owner_id] ?? null })));
    setChannelsLoading(false);
  }, []);

  useEffect(() => { if (section === "channels") loadChannels(); }, [section, loadChannels]);

  async function deleteChannel(c: ChannelRow) {
    const reason = window.prompt(
      "Motivo da remoção (fica registado e é enviado ao dono do canal):",
      "O teu canal foi removido por violar os nossos termos de utilização."
    );
    if (reason === null) return;
    const { error } = await db.from("channels").delete().eq("id", c.id);
    if (error) { toast.error("Não foi possível eliminar o canal."); return; }
    setChannelsList((prev) => prev.filter((x) => x.id !== c.id));
    toast.success("Canal eliminado.");
    if (c.owner_id) {
      notifyUserOfficial(c.owner_id, reason.trim() || "O teu canal foi removido por violar os nossos termos de utilização.");
    }
  }

  async function toggleBan(u: UserRow) {
    const next = !u.is_banned;
    const reason = next ? window.prompt("Motivo do banimento (opcional):") ?? "" : "";
    const { error } = await db.from("profiles").update({ is_banned: next, ban_reason: next ? reason : null }).eq("id", u.id);
    if (error) { toast.error("Não foi possível atualizar o utilizador."); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_banned: next, ban_reason: next ? reason : null } : x)));
    toast.success(next ? `@${u.username} foi banido.` : `@${u.username} foi desbanido.`);
  }

  async function toggleVerified(u: UserRow) {
    const next = !u.is_verified;
    const { error } = await db.from("profiles").update({ is_verified: next }).eq("id", u.id);
    if (error) { toast.error("Não foi possível atualizar o selo de verificado."); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_verified: next } : x)));
    toast.success(next ? `@${u.username} agora está verificado.` : `Selo removido de @${u.username}.`);
  }

  /** Elimina a conta por completo (auth.users + tudo em cascata: perfil,
   * publicações, canais, mensagens, etc.) — ação irreversível. */
  async function deleteAccount(u: UserRow) {
    const confirmText = window.prompt(
      `Isto elimina a conta @${u.username} PARA SEMPRE (perfil, publicações, canais, mensagens — tudo).\n\nEscreve o username "${u.username}" para confirmar:`
    );
    if (confirmText === null) return;
    if (confirmText.trim() !== u.username) { toast.error("Username não confere. Nada foi eliminado."); return; }
    const { error } = await db.rpc("admin_delete_account", { target_id: u.id });
    if (error) { toast.error("Não foi possível eliminar a conta: " + (error.message ?? "erro desconhecido")); return; }
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    if (selected?.id === u.id) { setSelected(null); setConvId(""); setMsgs([]); }
    toast.success(`Conta @${u.username} eliminada permanentemente.`);
  }

  // ── Lista de utilizadores ──
  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      // 1) Campos base — sempre existem, garantem que a lista aparece toda.
      const { data: base, error: baseError } = await db
        .from("profiles")
        .select("id,username,full_name,avatar_url,created_at")
        .neq("id", adminId)
        .order("username", { ascending: true })
        .limit(1000);
      if (baseError) {
        console.error("[admin] erro a carregar utilizadores:", baseError);
        toast.error("Erro ao carregar utilizadores: " + baseError.message);
        setUsers([]);
        setLoadingUsers(false);
        return;
      }
      let merged: UserRow[] = base ?? [];
      // 2) Campos de moderação — tenta à parte; se as colunas ainda não
      //    existirem na base de dados (migration por correr), a lista de
      //    utilizadores continua a aparecer na mesma, só sem banir/verificar.
      const { data: mod, error: modError } = await db
        .from("profiles")
        .select("id,is_banned,is_verified,ban_reason")
        .neq("id", adminId);
      if (modError) {
        console.error("[admin] colunas de moderação indisponíveis:", modError);
        toast.error("Banir/verificar indisponível: falta correr a migration de moderação no Supabase.");
      } else if (mod) {
        const modMap: Record<string, any> = {};
        mod.forEach((m: any) => { modMap[m.id] = m; });
        merged = merged.map((u) => ({ ...u, ...(modMap[u.id] ?? {}) }));
      }
      setUsers(merged);
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
        .select("id,sender_id,content,created_at,message_type,media_url")
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

  /** Envia uma foto como "Hooda Oficial" na conversa aberta. */
  async function sendOfficialImage(file: File) {
    if (!selected || !convId || uploadingImg) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolhe um ficheiro de imagem."); return; }
    setUploadingImg(true);
    const tempId = `temp-img-${Date.now()}`;
    const localPreview = URL.createObjectURL(file);
    setMsgs(prev => [...prev, { id: tempId, sender_id: adminId, content: "", created_at: new Date().toISOString(), message_type: "image", media_url: localPreview }]);
    try {
      const { url } = await uploadImageToCloudinary(file, `hooda/messages/images/${adminId}`);
      const { data, error } = await db.from("messages").insert({
        conversation_id: convId,
        sender_id: adminId,
        receiver_id: selected.id,
        content: "",
        status: "sent",
        message_type: "image",
        media_url: url,
      }).select("id").single();
      if (error) throw error;
      setMsgs(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id, media_url: url } : m));
    } catch (err: any) {
      console.error("[admin] erro ao enviar imagem:", err);
      toast.error("Erro ao enviar imagem: " + (err?.message ?? "desconhecido"));
      setMsgs(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setUploadingImg(false);
    }
  }

  return (
    <div className="h-screen flex" style={{ background: "#f7f7f9" }}>
      {/* ── Barra de navegação por ícones ── */}
      <div className="w-16 md:w-20 flex flex-col items-center py-4 gap-2 shrink-0 border-r"
        style={{ borderColor: "#ececf1", background: "#ffffff" }}>
        <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center mb-3 shrink-0" style={{ background: "white", border: "1px solid #ececf1" }}>
          <img src={LOGO} alt="" className="w-full h-full object-contain p-1" />
        </div>
        {([
          { key: "dashboard" as const, Icon: LayoutDashboard, label: "Dashboard" },
          { key: "reports" as const, Icon: Flag, label: "Denúncias", badge: stats?.pendingReports },
          { key: "posts" as const, Icon: FileText, label: "Publicações" },
          { key: "channels" as const, Icon: Radio, label: "Canais" },
          { key: "users" as const, Icon: UsersIcon, label: "Utilizadores" },
          { key: "messages" as const, Icon: MessageSquare, label: "Mensagens" },
        ]).map(({ key, Icon, label, badge }) => (
          <button key={key} onClick={() => setSection(key)} title={label}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition active:scale-90"
            style={{ background: section === key ? "linear-gradient(135deg,#5B3FCF,#7B5CE8)" : "#f5f5f7" }}>
            <Icon className="h-5 w-5" style={{ color: section === key ? "white" : "#6b6b76" }} />
            {!!badge && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: "#E94B8A" }}>{badge > 99 ? "99+" : badge}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { sessionStorage.removeItem(UNLOCK_KEY); navigate({ to: "/home" }); }}
          title="Sair do painel" className="w-12 h-12 rounded-2xl flex items-center justify-center transition active:scale-90"
          style={{ background: "rgba(239,68,68,0.12)" }}>
          <LogOut className="h-5 w-5" style={{ color: "#F87171" }} />
        </button>
      </div>

      {/* ── Dashboard ── */}
      {section === "dashboard" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Visão geral</h1>
          <p className="text-neutral-400 text-sm mb-8">Números reais da plataforma, em tempo real.</p>
          {statsLoading || !stats ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl relative overflow-hidden" style={{ background: "rgba(0,0,0,0.05)" }}>
                  <div className="skeleton-shimmer absolute inset-0" style={{ opacity: 0.15 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Utilizadores totais", value: stats.totalUsers, Icon: UsersRound, color: "#5B3FCF" },
                { label: "Novos hoje", value: stats.newToday, Icon: TrendingUp, color: "#6BA547" },
                { label: "Novos esta semana", value: stats.newWeek, Icon: TrendingUp, color: "#1FAFA6" },
                { label: "Publicações totais", value: stats.totalPosts, Icon: FileText, color: "#F26B3A" },
                { label: "Publicações hoje", value: stats.postsToday, Icon: FileText, color: "#FFC93C" },
                { label: "Canais no Studio", value: stats.totalChannels, Icon: Radio, color: "#E94B8A" },
                { label: "Denúncias pendentes", value: stats.pendingReports, Icon: Flag, color: "#F87171" },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl p-5 flex flex-col gap-3"
                  style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${c.color}22` }}>
                    <c.Icon className="h-4.5 w-4.5" style={{ color: c.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-neutral-900 leading-tight">{c.value.toLocaleString("pt-PT")}</p>
                    <p className="text-neutral-400 text-xs mt-0.5">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Denúncias ── */}
      {section === "reports" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Denúncias</h1>
          <p className="text-neutral-400 text-sm mb-6">Utilizadores denunciados por outros utilizadores.</p>
          <div className="flex items-center gap-2 mb-6">
            {([
              { key: "pending" as const, label: "Pendentes" },
              { key: "reviewed" as const, label: "Resolvidas" },
              { key: "dismissed" as const, label: "Ignoradas" },
            ]).map((f) => (
              <button key={f.key} onClick={() => setReportFilter(f.key)}
                className="px-4 py-2 rounded-full text-xs font-bold transition"
                style={{
                  background: reportFilter === f.key ? "linear-gradient(135deg,#5B3FCF,#7B5CE8)" : "#f5f5f7",
                  color: reportFilter === f.key ? "white" : "#6b6b76",
                }}>
                {f.label}
              </button>
            ))}
          </div>
          {reportsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Flag className="h-8 w-8 text-neutral-300" />
              <p className="text-neutral-400 text-sm">Nenhuma denúncia {reportFilter === "pending" ? "pendente" : reportFilter === "reviewed" ? "resolvida" : "ignorada"}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-2xl p-4 flex items-start gap-4"
                  style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900">
                      <span className="font-bold">@{r.reported?.username ?? "?"}</span>
                      <span className="text-neutral-400"> denunciado por </span>
                      <span className="font-semibold">@{r.reporter?.username ?? "?"}</span>
                    </p>
                    <p className="text-neutral-500 text-sm mt-1">{r.reason}</p>
                    <p className="text-neutral-300 text-[11px] mt-2">{new Date(r.created_at).toLocaleString("pt-PT")}</p>
                  </div>
                  {reportFilter === "pending" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => resolveReport(r.id, "reviewed")} title="Marcar como resolvida"
                        className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(107,165,71,0.15)" }}>
                        <CheckCircle2 className="h-4.5 w-4.5" style={{ color: "#6BA547" }} />
                      </button>
                      <button onClick={() => resolveReport(r.id, "dismissed")} title="Ignorar denúncia"
                        className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(0,0,0,0.05)" }}>
                        <XCircle className="h-4.5 w-4.5 text-neutral-400" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Utilizadores ── */}
      {section === "users" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Utilizadores</h1>
          <p className="text-neutral-400 text-sm mb-6">Verificar contas ou banir utilizadores que violem as regras.</p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 mb-6 max-w-sm"
            style={{ background: "#f5f5f7" }}>
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
          </div>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : (
            <div className="space-y-2">
              {users
                .filter((u) => {
                  const q = search.trim().toLowerCase();
                  if (!q) return true;
                  return u.username?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
                })
                .map((u) => (
                  <div key={u.id} className="rounded-2xl p-3 flex items-center gap-3"
                    style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: "#5B3FCF" }}>
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        : (u.full_name?.[0] ?? u.username?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900 truncate flex items-center gap-1.5">
                        {u.full_name || u.username}
                        {u.is_verified && <VerifiedBadge size={13} />}
                        {u.is_banned && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#F87171" }}>
                            BANIDO
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-neutral-400 truncate">@{u.username}{u.is_banned && u.ban_reason ? ` · ${u.ban_reason}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => toggleVerified(u)} title={u.is_verified ? "Remover selo" : "Verificar conta"}
                        className="p-2 rounded-full transition active:scale-90"
                        style={{ background: u.is_verified ? "rgba(59,158,255,0.18)" : "rgba(0,0,0,0.05)" }}>
                        <ShieldCheck className="h-4 w-4" style={{ color: u.is_verified ? "#3B9EFF" : "#9a9aa5" }} />
                      </button>
                      <button onClick={() => toggleBan(u)} title={u.is_banned ? "Desbanir" : "Banir utilizador"}
                        className="p-2 rounded-full transition active:scale-90"
                        style={{ background: u.is_banned ? "rgba(239,68,68,0.22)" : "rgba(0,0,0,0.05)" }}>
                        <Ban className="h-4 w-4" style={{ color: u.is_banned ? "#F87171" : "#9a9aa5" }} />
                      </button>
                      <button onClick={() => deleteAccount(u)} title="Eliminar conta permanentemente"
                        className="p-2 rounded-full transition active:scale-90"
                        style={{ background: "rgba(239,68,68,0.10)" }}>
                        <Trash2 className="h-4 w-4" style={{ color: "#F87171" }} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Publicações (moderação) ── */}
      {section === "posts" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Publicações</h1>
          <p className="text-neutral-400 text-sm mb-6">Todas as publicações da plataforma. Eliminar avisa automaticamente o autor.</p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 mb-6 max-w-sm"
            style={{ background: "#f5f5f7" }}>
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input value={postsSearch} onChange={(e) => setPostsSearch(e.target.value)}
              placeholder="Pesquisar por autor..."
              className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
          </div>
          {postsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : (
            <div className="space-y-2">
              {postsList
                .filter((p) => {
                  const q = postsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return p.author_username?.toLowerCase().includes(q) || p.author_name?.toLowerCase().includes(q);
                })
                .length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <FileText className="h-8 w-8 text-neutral-300" />
                  <p className="text-neutral-400 text-sm">Nenhuma publicação encontrada.</p>
                </div>
              ) : postsList
                .filter((p) => {
                  const q = postsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return p.author_username?.toLowerCase().includes(q) || p.author_name?.toLowerCase().includes(q);
                })
                .map((p) => {
                  let preview = p.content ?? "";
                  if (p.kind === "bg") { try { preview = JSON.parse(preview).text ?? ""; } catch { /* mantém texto bruto */ } }
                  const mediaLabel = p.video_url ? "Vídeo" : p.clip_video_id ? "Clipe de canal" : p.photo_url ? "Foto" : "Texto";
                  const MediaIcon = p.video_url || p.clip_video_id ? VideoIcon : p.photo_url ? ImageIcon : FileText;
                  return (
                    <div key={p.id} className="rounded-2xl p-4 flex items-start gap-3"
                      style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                        style={{ background: p.author_color || "#5B3FCF" }}>
                        {(p.author_name?.[0] ?? p.author_username?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900">
                          <span className="font-bold">{p.author_name || p.author_username || "?"}</span>
                          <span className="text-neutral-400"> @{p.author_username ?? "?"}</span>
                        </p>
                        {preview && <p className="text-neutral-500 text-sm mt-1 line-clamp-3 whitespace-pre-wrap break-words">{preview}</p>}
                        <AdminPostMedia p={p} />
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(91,63,207,0.18)", color: "#5B3FCF" }}>
                            <MediaIcon className="h-3 w-3" /> {mediaLabel}
                          </span>
                          <span className="text-[11px] text-neutral-400">👁 {fmtCount(p.views_count)}</span>
                          <span className="text-[11px] text-neutral-400">❤ {fmtCount(p.likes_count)}</span>
                          <span className="text-[11px] text-neutral-400">💬 {fmtCount(p.replies_count)}</span>
                          <span className="text-[11px] text-neutral-400">🔁 {fmtCount(p.reposts_count)}</span>
                          {p.channel_name && <span className="text-[11px] text-neutral-400">Canal: {p.channel_name}</span>}
                          <span className="text-[11px] text-neutral-300">{new Date(p.created_at).toLocaleString("pt-PT")}</span>
                        </div>
                      </div>
                      <button onClick={() => deletePost(p)} title="Eliminar publicação e avisar autor"
                        className="p-2 rounded-full transition active:scale-90 shrink-0" style={{ background: "rgba(239,68,68,0.15)" }}>
                        <Trash2 className="h-4 w-4" style={{ color: "#F87171" }} />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Canais ── */}
      {section === "channels" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Canais</h1>
          <p className="text-neutral-400 text-sm mb-6">Todos os canais criados no Hooda Studio. Eliminar avisa automaticamente o dono.</p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 mb-6 max-w-sm"
            style={{ background: "#f5f5f7" }}>
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input value={channelsSearch} onChange={(e) => setChannelsSearch(e.target.value)}
              placeholder="Pesquisar canal ou dono..."
              className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
          </div>
          {channelsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {channelsList
                .filter((c) => {
                  const q = channelsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return c.name?.toLowerCase().includes(q) || c.handle?.toLowerCase().includes(q) || c.owner_username?.toLowerCase().includes(q);
                })
                .length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 gap-2">
                  <Radio className="h-8 w-8 text-neutral-300" />
                  <p className="text-neutral-400 text-sm">Nenhum canal encontrado.</p>
                </div>
              ) : channelsList
                .filter((c) => {
                  const q = channelsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return c.name?.toLowerCase().includes(q) || c.handle?.toLowerCase().includes(q) || c.owner_username?.toLowerCase().includes(q);
                })
                .map((c) => (
                  <div key={c.id} className="rounded-2xl p-4 flex items-start gap-3"
                    style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                    <div className="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: "#5B3FCF" }}>
                      {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : c.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{c.name}</p>
                      <p className="text-[12px] text-neutral-400 truncate">@{c.handle}</p>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">Dono: @{c.owner_username ?? "?"}</p>
                      {c.category && <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(91,63,207,0.18)", color: "#5B3FCF" }}>{c.category}</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <a href={`/canal/${c.handle}`} target="_blank" rel="noreferrer" title="Ver canal"
                        className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(0,0,0,0.05)" }}>
                        <ExternalLink className="h-4 w-4 text-neutral-500" />
                      </a>
                      <button onClick={() => deleteChannel(c)} title="Eliminar canal e avisar dono"
                        className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(239,68,68,0.15)" }}>
                        <Trash2 className="h-4 w-4" style={{ color: "#F87171" }} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mensagens ── */}
      {section === "messages" && (
      <>
      <div className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-[340px] flex-col shrink-0 border-r`}
        style={{ borderColor: "#ececf1" }}>
        <div className="px-4 py-4 flex items-center justify-between gap-2 shrink-0"
          style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "white" }}>
              <img src={LOGO} alt="" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <p className="font-extrabold text-sm leading-tight flex items-center gap-1.5">
                <HoodaWordmark size={15} /><span className="text-white/85">Oficial</span> <VerifiedBadge />
              </p>
              <p className="text-white/70 text-[11px] leading-tight">Painel de mensagens</p>
            </div>
          </div>
        </div>

        <div className="px-3 py-3 shrink-0">
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2"
            style={{ background: "#f5f5f7" }}>
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingUsers && (
            <div className="flex items-center justify-center py-10">
              <Loader className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          )}
          {!loadingUsers && filtered.length === 0 && (
            <p className="text-center text-neutral-400 text-sm py-10">Nenhum utilizador encontrado.</p>
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
                <p className="text-sm font-semibold text-neutral-900 truncate">{u.full_name || u.username}</p>
                <p className="text-[12px] text-neutral-400 truncate">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Conversa ── */}
      <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <MessageSquare className="h-10 w-10 text-neutral-300" />
            <p className="text-neutral-400 text-sm">Escolhe um utilizador para enviar uma mensagem oficial.</p>
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

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: "#f3f3f6" }}>
              {loadingConv && (
                <div className="flex items-center justify-center py-10">
                  <Loader className="h-5 w-5 animate-spin text-neutral-400" />
                </div>
              )}
              {!loadingConv && msgs.length === 0 && (
                <p className="text-center text-neutral-300 text-sm py-8">Ainda sem mensagens nesta conversa.</p>
              )}
              {msgs.map(m => {
                const isAdmin = m.sender_id === adminId;
                const isImage = m.message_type === "image" && m.media_url;
                return (
                  <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%]">
                      {isAdmin && (
                        <p className="flex items-center gap-1 text-[11px] font-bold mb-1 justify-end">
                          <HoodaWordmark size={11} /><span style={{ color: "#5B3FCF" }}>Oficial</span> <VerifiedBadge size={11} />
                        </p>
                      )}
                      {isImage ? (
                        <img
                          src={m.media_url ?? ""}
                          alt=""
                          onClick={() => window.open(m.media_url ?? "", "_blank")}
                          className="rounded-2xl max-w-full max-h-72 object-cover cursor-zoom-in"
                          style={{ borderBottomRightRadius: isAdmin ? 4 : undefined, borderBottomLeftRadius: !isAdmin ? 4 : undefined }}
                        />
                      ) : (
                        <div className="rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                          style={{
                            background: isAdmin ? "linear-gradient(135deg,#5B3FCF,#7B5CE8)" : "#eceef2",
                            color: isAdmin ? "white" : "#1a1a1f",
                            borderBottomRightRadius: isAdmin ? 4 : undefined,
                            borderBottomLeftRadius: !isAdmin ? 4 : undefined,
                          }}>
                          {m.content}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2 px-3 py-3 shrink-0" style={{ background: "#ffffff" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendOfficialImage(f); e.target.value = ""; }}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImg}
                title="Enviar foto"
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 disabled:opacity-40"
                style={{ background: "#f5f5f7" }}>
                {uploadingImg ? <Loader className="h-4 w-4 animate-spin text-neutral-500" /> : <ImageIcon className="h-4 w-4 text-neutral-500" />}
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendOfficial(); } }}
                rows={1}
                placeholder="Escrever como Hooda Oficial..."
                className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none resize-none text-neutral-900 placeholder:text-neutral-400 max-h-28"
                style={{ background: "#f5f5f7" }}
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
      </>
      )}
    </div>
  );
}

// Reexporta o selo para eventual uso noutras páginas (ex.: mensagens.tsx)
export { VerifiedBadge };
