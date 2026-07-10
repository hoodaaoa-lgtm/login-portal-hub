import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import {
  OFFICIAL_CATEGORY_META,
  sendOfficialMessage,
  fetchOfficialMessageHistory,
  type OfficialCategory,
  type OfficialActionType,
  type OfficialAudience,
} from "@/lib/officialMessages";
import { toast } from "sonner";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { useAdminPwaShell } from "@/hooks/useAdminPwaShell";
import {
  Lock, Search, Send, LogOut, Loader,
  MessageSquare, ChevronLeft, ShieldAlert, Unlock as UnlockIcon,
  LayoutDashboard, Flag, Users as UsersIcon, Ban, ShieldCheck,
  UsersRound, FileText, Radio, TrendingUp, CheckCircle2, XCircle,
  Trash2, Image as ImageIcon, Video as VideoIcon, ExternalLink, Activity,
  Megaphone, History, UserX, Upload, Smartphone,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/hdequipa9x2")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: AdminPage,
});

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
  reporter?: { username: string; full_name: string | null; avatar_url: string | null } | null;
  reported?: { username: string; full_name: string | null; avatar_url: string | null; is_banned?: boolean } | null;
};

type AuditRow = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_label: string | null;
  details: string | null;
  created_at: string;
  admin_username?: string | null;
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
  views_count: number | null;
  likes_count: number | null;
  replies_count: number | null;
  reposts_count: number | null;
};

type PresenceRow = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  last_seen: string | null;
  total_time_seconds: number | null;
};

type DashboardStats = {
  totalUsers: number;
  newToday: number;
  newWeek: number;
  totalPosts: number;
  postsToday: number;
  totalVideos: number;
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

/** Limiar para considerar um utilizador "online agora": se o último heartbeat
 * (a cada 30s enquanto a app está visível) foi há menos de 90s, está online.
 * Não confiamos apenas na flag is_online guardada na BD porque não há forma
 * fiável de a apagar quando o utilizador fecha a aba/app (beforeunload não é
 * garantido, especialmente em mobile) — por isso calculamos aqui pela
 * recência do last_seen. */
const ONLINE_THRESHOLD_MS = 90_000;

function isOnlineNow(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

/** "Visto pela última vez": agora / há Xm / há Xh / hoje às HH:MM / data. */
function fmtLastSeen(lastSeen: string | null) {
  if (!lastSeen) return "Nunca entrou";
  const d = new Date(lastSeen);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 90) return "Agora mesmo";
  if (s < 3600) return `Há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Há ${Math.floor(s / 3600)} h`;
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) return `Hoje às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    ` às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Tempo total acumulado no site: 45min / 3h 20min / 12h. */
function fmtDuration(totalSeconds: number | null) {
  const s = totalSeconds ?? 0;
  if (s < 60) return "menos de 1 min";
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours} h ${remMins} min` : `${hours} h`;
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
    // Mesmo player do feed (HoodaPlayer via FeedVideoPlayer): respeita a
    // proporção real do vídeo — encolhe em largura quando é vertical, em
    // vez de esticar a caixa toda como fazia o <video> nativo antes.
    return (
      <div className="mt-2 max-w-sm">
        <FeedVideoPlayer
          src={videoSrc}
          poster={p.clip_thumb_url || undefined}
          postId={p.id}
          kind={p.kind ?? "video"}
          autoPlay={false}
          forceLoad
          maxHeightRatio={0.5}
          rounded="rounded-xl"
        />
      </div>
    );
  }
  if (photos.length > 0) {
    return (
      <div className="mt-2 max-w-sm space-y-1">
        {photos.slice(0, 4).map((url, i) => (
          <img key={i} src={url} alt="" className="w-full max-h-80 object-contain rounded-xl bg-neutral-100" />
        ))}
        {photos.length > 4 && (
          <p className="text-[11px] text-neutral-400">+{photos.length - 4} foto(s) não mostrada(s)</p>
        )}
      </div>
    );
  }
  return null;
}

type Stage = "checking" | "denied" | "unlocked";

function AdminPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [adminId, setAdminId] = useState("");

  // Ativa a identidade do PWA "Hooda Admin" (manifest, ícones, Service
  // Worker próprio) assim que sabemos que é mesmo um admin — nunca antes
  // do gate de is_hooda_admin() responder.
  useAdminPwaShell(stage !== "checking" && stage !== "denied");

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
      setStage("unlocked");
    })();
  }, [navigate]);

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


  return <AdminDashboard adminId={adminId} />;
}

// ─────────────────────────────────────────────────────────────────────────

function AdminDashboard({ adminId }: { adminId: string }) {
  const navigate = useNavigate();
  const [section, setSection] = useState<"dashboard" | "reports" | "users" | "messages" | "posts" | "presence" | "broadcast" | "official" | "audit">("dashboard");
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

  // ── Presença (utilizadores online / última vez visto / tempo no site) ──
  const [presenceList, setPresenceList] = useState<PresenceRow[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceSearch, setPresenceSearch] = useState("");
  const [nowTick, setNowTick] = useState(Date.now()); // força recálculo de "há Xm" e do estado online

  // ── Comunicados (broadcast oficial para todos os utilizadores) ──
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{ sent: number; total: number } | null>(null);
  const [broadcastNoReply, setBroadcastNoReply] = useState(false);

  // ── Auditoria (registo de ações do admin) ──
  const [auditList, setAuditList] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // ── Mensagens Oficiais (Instalar App / Atualizações / Dicas) ──
  const [officialCategory, setOfficialCategory] = useState<OfficialCategory>("INSTALL_APP");
  const [officialTitle, setOfficialTitle] = useState("");
  const [officialDescription, setOfficialDescription] = useState("");
  const [officialImageUrl, setOfficialImageUrl] = useState<string | null>(null);
  const [officialUploadingImg, setOfficialUploadingImg] = useState(false);
  const [officialButtonText, setOfficialButtonText] = useState("");
  const [officialActionType, setOfficialActionType] = useState<OfficialActionType>("none");
  const [officialActionValue, setOfficialActionValue] = useState("");
  const [officialAudience, setOfficialAudience] = useState<OfficialAudience>("all");
  const [officialSending, setOfficialSending] = useState(false);
  const [officialHistory, setOfficialHistory] = useState<Awaited<ReturnType<typeof fetchOfficialMessageHistory>>>([]);
  const [officialHistoryLoading, setOfficialHistoryLoading] = useState(true);
  const officialImgInputRef = useRef<HTMLInputElement>(null);

  // ── Dashboard: números reais ──
  useEffect(() => {
    if (section !== "dashboard" || stats) return;
    (async () => {
      setStatsLoading(true);
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startWeek = new Date(now.getTime() - 7 * 86400000).toISOString();
      const [
        totalUsersRes, newTodayRes, newWeekRes,
        totalPostsRes, postsTodayRes, totalVideosRes, pendingReportsRes,
      ] = await Promise.all([
        // NOTA: "profiles" só tem GRANT SELECT em colunas específicas (ver
        // migração 20260627085510) — nunca em todas ("*"). Pedir select("*")
        // aqui fazia a query falhar sempre (erro de permissão), e o count
        // ficava undefined -> 0, mesmo havendo utilizadores reais. Pedir só
        // "id" evita o problema porque "id" está sempre na lista de colunas
        // concedidas.
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", startToday),
        db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", startWeek),
        db.from("posts").select("id", { count: "exact", head: true }),
        db.from("posts").select("id", { count: "exact", head: true }).gte("created_at", startToday),
        db.from("videos").select("id", { count: "exact", head: true }),
        db.from("user_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      [totalUsersRes, newTodayRes, newWeekRes, totalPostsRes, postsTodayRes, totalVideosRes, pendingReportsRes]
        .forEach((r, i) => {
          if (r.error) console.error(`[admin] erro ao contar estatística #${i}:`, r.error);
        });
      setStats({
        totalUsers: totalUsersRes.count ?? 0, newToday: newTodayRes.count ?? 0, newWeek: newWeekRes.count ?? 0,
        totalPosts: totalPostsRes.count ?? 0, postsToday: postsTodayRes.count ?? 0, totalVideos: totalVideosRes.count ?? 0,
        pendingReports: pendingReportsRes.count ?? 0,
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
    const profileMap: Record<string, { username: string; full_name: string | null; avatar_url: string | null; is_banned?: boolean }> = {};
    if (ids.length > 0) {
      const { data: profs } = await db.from("profiles").select("id,username,full_name,avatar_url,is_banned").in("id", ids);
      (profs ?? []).forEach((p: any) => { profileMap[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, is_banned: p.is_banned }; });
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
    const target = reports.find((r) => r.id === id);
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success(status === "reviewed" ? "Denúncia marcada como resolvida." : "Denúncia ignorada.");
    logAudit(status === "reviewed" ? "report_resolved" : "report_dismissed", "report", `@${target?.reported?.username ?? "?"}`, target?.reason);
  }

  /**
   * Envia uma mensagem oficial (conta "Hooda Oficial") a um utilizador —
   * usado para avisar quando uma publicação/canal dele é removido.
   * Encontra ou cria a conversa oficial, igual à lógica de openUser().
   */
  const notifyUserOfficial = useCallback(async (userId: string, text: string, opts?: { replyAllowed?: boolean }) => {
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
        const { data: newConvId, error: rpcErr } = await db.rpc("create_official_conversation", {
          p_other_id: userId,
        });
        if (rpcErr) throw rpcErr;
        foundId = newConvId as string;
      }
      // Comunicado global "ninguém pode responder" — sobrepõe qualquer
      // permissão de resposta que essa conversa já tivesse (manual ou não).
      if (opts?.replyAllowed !== undefined) {
        await db.from("conversations").update({ reply_allowed: opts.replyAllowed }).eq("id", foundId);
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

  /** Regista uma ação no registo de auditoria (tabela admin_audit_log).
   * Falha em silêncio (só um log na consola) se a migration ainda não tiver
   * sido aplicada — nunca deve travar a ação principal do admin. */
  const logAudit = useCallback(async (action: string, targetType: string, targetLabel: string, details?: string) => {
    try {
      const { error } = await db.from("admin_audit_log").insert({
        admin_id: adminId, action, target_type: targetType, target_label: targetLabel, details: details ?? null,
      });
      if (error) console.error("[admin] erro ao registar auditoria:", error);
    } catch (err) {
      console.error("[admin] erro ao registar auditoria:", err);
    }
  }, [adminId]);

  /** Bane rapidamente o utilizador denunciado, direto do cartão de denúncia
   * (sem precisar de ir até à aba Utilizadores procurá-lo). */
  async function banFromReport(r: ReportRow) {
    if (!r.reported) return;
    const next = !r.reported.is_banned;
    const reason = next ? window.prompt("Motivo do banimento (opcional):") ?? "" : "";
    const { error } = await db.from("profiles").update({ is_banned: next, ban_reason: next ? reason : null }).eq("id", r.reported_user_id);
    if (error) { toast.error("Não foi possível atualizar o utilizador."); return; }
    setReports((prev) => prev.map((x) => x.id === r.id ? { ...x, reported: { ...x.reported!, is_banned: next } } : x));
    setUsers((prev) => prev.map((x) => (x.id === r.reported_user_id ? { ...x, is_banned: next, ban_reason: next ? reason : null } : x)));
    toast.success(next ? `@${r.reported.username} foi banido.` : `@${r.reported.username} foi desbanido.`);
    logAudit(next ? "ban" : "unban", "user", `@${r.reported.username}`, next ? (reason || "via denúncia") : "via denúncia");
  }

  // ── Publicações: lista real + eliminar com aviso ao autor ──
  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const { data, error } = await db
      .from("posts")
      .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url,video_stream_url,clip_video_id,clip_thumb_url,views_count,likes_count,replies_count,reposts_count")
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
    logAudit("delete_post", "post", `@${p.author_username ?? "?"}`, reason.trim() || undefined);
  }

  // ── Presença: lista real de last_seen/total_time_seconds, com atualização
  // periódica (poll a cada 20s) para o estado "online agora" refletir a
  // realidade sem precisar de recarregar a página. ──
  const loadPresence = useCallback(async () => {
    const { data, error } = await db
      .from("profiles")
      .select("id,username,full_name,avatar_url,last_seen,total_time_seconds")
      .neq("id", adminId)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      console.error("[admin] erro a carregar presença:", error);
      toast.error("Erro ao carregar utilizadores online: " + error.message);
      setPresenceList([]);
      setPresenceLoading(false);
      return;
    }
    setPresenceList(data ?? []);
    setPresenceLoading(false);
  }, [adminId]);

  useEffect(() => {
    if (section !== "presence") return;
    setPresenceLoading(true);
    loadPresence();
    const pollId = setInterval(loadPresence, 20_000);
    const tickId = setInterval(() => setNowTick(Date.now()), 5_000);
    return () => { clearInterval(pollId); clearInterval(tickId); };
  }, [section, loadPresence]);

  const filteredPresence = presenceList.filter((u) => {
    const q = presenceSearch.trim().toLowerCase();
    if (!q) return true;
    return u.username?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });
  const onlineCount = presenceList.filter((u) => isOnlineNow(u.last_seen)).length;

  // ── Auditoria: carregar registo de ações do admin ──
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data, error } = await db
      .from("admin_audit_log")
      .select("id,admin_id,action,target_type,target_label,details,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      console.error("[admin] erro a carregar auditoria:", error);
      toast.error("Auditoria indisponível: falta correr a migration do registo de ações.");
      setAuditList([]);
      setAuditLoading(false);
      return;
    }
    const adminIds = Array.from(new Set((data ?? []).map((r: any) => r.admin_id)));
    const adminMap: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: profs } = await db.from("profiles").select("id,username").in("id", adminIds);
      (profs ?? []).forEach((p: any) => { adminMap[p.id] = p.username; });
    }
    setAuditList((data ?? []).map((r: any) => ({ ...r, admin_username: adminMap[r.admin_id] ?? null })));
    setAuditLoading(false);
  }, []);

  useEffect(() => { if (section === "audit") loadAudit(); }, [section, loadAudit]);

  // ── Mensagens Oficiais ──
  const loadOfficialHistory = useCallback(async () => {
    setOfficialHistoryLoading(true);
    setOfficialHistory(await fetchOfficialMessageHistory());
    setOfficialHistoryLoading(false);
  }, []);

  useEffect(() => { if (section === "official") loadOfficialHistory(); }, [section, loadOfficialHistory]);

  async function uploadOfficialImage(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Escolhe um ficheiro de imagem."); return; }
    setOfficialUploadingImg(true);
    try {
      const { url } = await uploadImageToCloudinary(file, `hooda/official-messages/${adminId}`);
      setOfficialImageUrl(url);
    } catch (err: any) {
      console.error("[admin] erro ao enviar imagem da mensagem oficial:", err);
      toast.error("Erro ao enviar imagem: " + (err?.message ?? "desconhecido"));
    } finally {
      setOfficialUploadingImg(false);
    }
  }

  function resetOfficialForm() {
    setOfficialTitle("");
    setOfficialDescription("");
    setOfficialImageUrl(null);
    setOfficialButtonText("");
    setOfficialActionType("none");
    setOfficialActionValue("");
    setOfficialAudience("all");
  }

  async function handleSendOfficial() {
    const title = officialTitle.trim();
    const description = officialDescription.trim();
    if (!title || !description || officialSending) return;
    const audienceLabel = officialAudience === "all" ? "todos os utilizadores" : officialAudience === "new_users" ? "novos utilizadores (últimos 7 dias)" : "utilizadores que ainda não instalaram a app";
    const confirmed = window.confirm(`Isto envia "${title}" (${OFFICIAL_CATEGORY_META[officialCategory].label}) para ${audienceLabel}. Confirmas?`);
    if (!confirmed) return;
    setOfficialSending(true);
    try {
      const { recipients } = await sendOfficialMessage({
        category: officialCategory,
        title,
        description,
        imageUrl: officialImageUrl,
        buttonText: officialButtonText.trim() || null,
        actionType: officialActionType,
        actionValue: officialActionValue.trim() || null,
        audience: officialAudience,
      });
      toast.success(`Mensagem enviada a ${recipients} utilizadores.`);
      logAudit("send_official_message", "official_message", OFFICIAL_CATEGORY_META[officialCategory].label, `${title} → ${recipients} utilizadores`);
      resetOfficialForm();
      loadOfficialHistory();
    } catch (err: any) {
      console.error("[admin] erro ao enviar mensagem oficial:", err);
      toast.error("Erro ao enviar: " + (err?.message ?? "desconhecido"));
    } finally {
      setOfficialSending(false);
    }
  }

  // ── Comunicados: envia uma mensagem oficial a TODOS os utilizadores ──
  async function sendBroadcast() {
    const text = broadcastText.trim();
    if (!text || broadcastSending) return;
    const confirmMsg = broadcastNoReply
      ? `Isto envia esta mensagem, como Hooda Oficial, para TODOS os ${users.length} utilizadores — e bloqueia respostas para todos eles (mesmo quem já podia responder antes). Confirmas?`
      : `Isto envia esta mensagem, como Hooda Oficial, para TODOS os ${users.length} utilizadores. Confirmas?`;
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;
    setBroadcastSending(true);
    setBroadcastProgress({ sent: 0, total: users.length });
    let okCount = 0;
    for (let i = 0; i < users.length; i++) {
      try {
        await notifyUserOfficial(users[i].id, text, broadcastNoReply ? { replyAllowed: false } : undefined);
        okCount++;
      } catch (err) {
        console.error("[admin] erro no broadcast para", users[i].username, err);
      }
      setBroadcastProgress({ sent: i + 1, total: users.length });
    }
    setBroadcastSending(false);
    setBroadcastText("");
    toast.success(`Comunicado enviado a ${okCount} de ${users.length} utilizadores.${broadcastNoReply ? " Respostas bloqueadas." : ""}`);
    logAudit("broadcast", "all_users", `${okCount} utilizadores`, broadcastNoReply ? `${text} [ninguém pode responder]` : text);
  }

  async function toggleBan(u: UserRow) {
    const next = !u.is_banned;
    const reason = next ? window.prompt("Motivo do banimento (opcional):") ?? "" : "";
    const { error } = await db.from("profiles").update({ is_banned: next, ban_reason: next ? reason : null }).eq("id", u.id);
    if (error) { toast.error("Não foi possível atualizar o utilizador."); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_banned: next, ban_reason: next ? reason : null } : x)));
    toast.success(next ? `@${u.username} foi banido.` : `@${u.username} foi desbanido.`);
    logAudit(next ? "ban" : "unban", "user", `@${u.username}`, next ? reason : undefined);
  }

  async function toggleVerified(u: UserRow) {
    const next = !u.is_verified;
    const { error } = await db.from("profiles").update({ is_verified: next }).eq("id", u.id);
    if (error) { toast.error("Não foi possível atualizar o selo de verificado."); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_verified: next } : x)));
    toast.success(next ? `@${u.username} agora está verificado.` : `Selo removido de @${u.username}.`);
    logAudit(next ? "verify" : "unverify", "user", `@${u.username}`);
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
    logAudit("delete_account", "user", `@${u.username}`);
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
        const { data: newConvId, error: rpcErr } = await db.rpc("create_official_conversation", {
          p_other_id: u.id,
        });
        if (rpcErr) throw rpcErr;
        foundId = newConvId as string;
        setReplyAllowed(true);
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

  async function setReplyAllowedTo(next: boolean) {
    if (next === replyAllowed) return; // já está neste estado, não faz nada
    const prev = replyAllowed;
    setReplyAllowed(next);
    const { error } = await db.from("conversations").update({ reply_allowed: next }).eq("id", convId);
    if (error) {
      setReplyAllowed(prev);
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
      {/* ── Barra de navegação lateral (estilo da sidebar do site: ícone + texto) ── */}
      <div className="w-[76px] md:w-[240px] flex flex-col py-4 px-2 md:px-3 gap-1 shrink-0 border-r"
        style={{ borderColor: "#ececf1", background: "#ffffff" }}>
        <div className="flex items-center gap-2.5 px-1.5 mb-4">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "white", border: "1px solid #ececf1" }}>
            <img src={LOGO} alt="" className="w-full h-full object-contain p-1" />
          </div>
          <p className="hidden md:flex items-center gap-1.5 font-extrabold">
            <HoodaWordmark size={17} /><span className="text-neutral-500 text-sm">Oficial</span>
          </p>
        </div>
        {([
          { key: "dashboard" as const, Icon: LayoutDashboard, label: "Dashboard" },
          { key: "reports" as const, Icon: Flag, label: "Denúncias", badge: stats?.pendingReports },
          { key: "posts" as const, Icon: FileText, label: "Publicações" },
          { key: "presence" as const, Icon: Activity, label: "Em Linha", badge: onlineCount || undefined },
          { key: "users" as const, Icon: UsersIcon, label: "Utilizadores" },
          { key: "messages" as const, Icon: MessageSquare, label: "Mensagens" },
          { key: "broadcast" as const, Icon: Megaphone, label: "Comunicados" },
          { key: "official" as const, Icon: Smartphone, label: "Mensagens Oficiais" },
          { key: "audit" as const, Icon: History, label: "Auditoria" },
        ]).map(({ key, Icon, label, badge }) => (
          <button key={key} onClick={() => setSection(key)} title={label}
            className="relative flex items-center gap-3 px-2.5 md:px-3 py-2.5 rounded-2xl transition active:scale-[0.98] w-full"
            style={{ background: section === key ? "linear-gradient(135deg,#5B3FCF,#7B5CE8)" : "transparent" }}>
            <Icon className="h-5 w-5 shrink-0" style={{ color: section === key ? "white" : "#6b6b76" }} strokeWidth={section === key ? 2.3 : 1.9} />
            <span className="hidden md:inline text-[14px] truncate flex-1 text-left"
              style={{ color: section === key ? "white" : "#3a3a42", fontWeight: section === key ? 800 : 500 }}>
              {label}
            </span>
            {!!badge && (
              <span className="absolute top-1.5 right-1.5 md:static min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: section === key ? "rgba(255,255,255,0.25)" : "#E94B8A" }}>{badge > 99 ? "99+" : badge}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { navigate({ to: "/home" }); }}
          title="Sair do painel" className="flex items-center gap-3 px-2.5 md:px-3 py-2.5 rounded-2xl transition active:scale-[0.98] w-full"
          style={{ background: "rgba(239,68,68,0.08)" }}>
          <LogOut className="h-5 w-5 shrink-0" style={{ color: "#F87171" }} />
          <span className="hidden md:inline text-[14px] font-semibold" style={{ color: "#F87171" }}>Sair do painel</span>
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
                { label: "Vídeos publicados", value: stats.totalVideos, Icon: Radio, color: "#E94B8A" },
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
                <div key={r.id} className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-2.5">
                      {/* Denunciado — nome, avatar e link para o perfil */}
                      <a href={r.reported?.username ? `/u/${r.reported.username}` : undefined} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2.5 group">
                        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                          style={{ background: "#E94B8A" }}>
                          {r.reported?.avatar_url
                            ? <img src={r.reported.avatar_url} alt="" className="w-full h-full object-cover" />
                            : (r.reported?.username?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-neutral-900 flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold group-hover:underline">@{r.reported?.username ?? "?"}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(233,75,138,0.15)", color: "#E94B8A" }}>Denunciado</span>
                            {r.reported?.is_banned && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#F87171" }}>BANIDO</span>
                            )}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-neutral-300 shrink-0" />
                      </a>
                      <p className="text-neutral-500 text-sm bg-neutral-50 rounded-xl px-3 py-2">{r.reason}</p>
                      {/* Denunciante */}
                      <div className="flex items-center gap-2 pl-1">
                        <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                          style={{ background: "#5B3FCF" }}>
                          {r.reporter?.avatar_url
                            ? <img src={r.reporter.avatar_url} alt="" className="w-full h-full object-cover" />
                            : (r.reporter?.username?.[0] ?? "?").toUpperCase()}
                        </div>
                        <p className="text-[12px] text-neutral-400">
                          denunciado por <span className="font-semibold text-neutral-500">@{r.reporter?.username ?? "?"}</span>
                        </p>
                      </div>
                      <p className="text-neutral-300 text-[11px]">{new Date(r.created_at).toLocaleString("pt-PT")}</p>
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      {reportFilter === "pending" && (
                        <>
                          <button onClick={() => resolveReport(r.id, "reviewed")} title="Marcar como resolvida"
                            className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(107,165,71,0.15)" }}>
                            <CheckCircle2 className="h-4.5 w-4.5" style={{ color: "#6BA547" }} />
                          </button>
                          <button onClick={() => resolveReport(r.id, "dismissed")} title="Ignorar denúncia"
                            className="p-2 rounded-full transition active:scale-90" style={{ background: "rgba(0,0,0,0.05)" }}>
                            <XCircle className="h-4.5 w-4.5 text-neutral-400" />
                          </button>
                        </>
                      )}
                      <button onClick={() => banFromReport(r)} title={r.reported?.is_banned ? "Desbanir denunciado" : "Banir denunciado"}
                        className="p-2 rounded-full transition active:scale-90" style={{ background: r.reported?.is_banned ? "rgba(239,68,68,0.22)" : "rgba(239,68,68,0.10)" }}>
                        <UserX className="h-4.5 w-4.5" style={{ color: "#F87171" }} />
                      </button>
                    </div>
                  </div>
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
            <div className="space-y-2 max-w-2xl">
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
      {/* ── Em Linha (presença) ── */}
      {section === "presence" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-extrabold text-neutral-900">Utilizadores em linha</h1>
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(107,165,71,0.15)", color: "#4d8a32" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#6BA547" }} />
              {onlineCount} online agora
            </span>
          </div>
          <p className="text-neutral-400 text-sm mb-6">
            Quem está no Hooda neste momento, quando cada um esteve por último e quanto tempo já passou na app.
          </p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 mb-6 max-w-sm"
            style={{ background: "#f5f5f7" }}>
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input value={presenceSearch} onChange={(e) => setPresenceSearch(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
          </div>
          {presenceLoading ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : filteredPresence.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Activity className="h-8 w-8 text-neutral-300" />
              <p className="text-neutral-400 text-sm">Nenhum utilizador encontrado.</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
              {filteredPresence.map((u, i) => {
                const online = isOnlineNow(u.last_seen);
                return (
                  <div key={u.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderTop: i === 0 ? "none" : "1px solid #f0f0f3" }}>
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold"
                        style={{ background: "#5B3FCF" }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (u.full_name?.[0] ?? u.username?.[0] ?? "?").toUpperCase()}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                        style={{ background: online ? "#6BA547" : "#c9c9d2", borderColor: "#ffffff" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{u.full_name || u.username}</p>
                      <p className="text-[12px] text-neutral-400 truncate">@{u.username}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-bold" style={{ color: online ? "#6BA547" : "#9a9aa5" }}>
                        {online ? "Online agora" : fmtLastSeen(u.last_seen)}
                      </p>
                      <p className="text-[11px] text-neutral-400">{fmtDuration(u.total_time_seconds)} no total</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Comunicados (broadcast oficial) ── */}
      {section === "broadcast" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Comunicados</h1>
          <p className="text-neutral-400 text-sm mb-6">
            Envia uma mensagem como <strong>Hooda Oficial</strong> para todos os {users.length} utilizadores da plataforma de uma só vez.
          </p>
          <div className="max-w-xl rounded-2xl p-5" style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "#5B3FCF" }}>
                <img src={LOGO} alt="" className="w-full h-full object-contain p-1" />
              </div>
              <p className="flex items-center gap-1.5 font-extrabold text-sm">
                <HoodaWordmark size={15} /><span className="text-neutral-500">Oficial</span> <VerifiedBadge size={13} />
              </p>
            </div>
            <textarea
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              disabled={broadcastSending}
              rows={5}
              placeholder="Escreve o comunicado que vai chegar a todos os utilizadores..."
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none text-neutral-900 placeholder:text-neutral-400 disabled:opacity-60"
              style={{ background: "#f5f5f7" }}
            />
            <button
              type="button"
              onClick={() => setBroadcastNoReply(v => !v)}
              disabled={broadcastSending}
              className="w-full flex items-center justify-between gap-3 mt-3 px-4 py-3 rounded-2xl transition disabled:opacity-60"
              style={{ background: broadcastNoReply ? "#5B3FCF12" : "#f5f5f7", border: broadcastNoReply ? "1px solid #5B3FCF40" : "1px solid transparent" }}>
              <div className="text-left">
                <p className="text-sm font-bold text-neutral-900">🔒 Ninguém pode responder</p>
                <p className="text-[11px] text-neutral-400">Bloqueia respostas para todos os utilizadores neste comunicado, mesmo quem já podia responder antes.</p>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${broadcastNoReply ? "bg-[#5B3FCF]" : "bg-neutral-300"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${broadcastNoReply ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </button>
            <div className="flex items-center justify-between mt-4 gap-3">
              <p className="text-[11px] text-neutral-400">
                {broadcastSending && broadcastProgress
                  ? `A enviar... ${broadcastProgress.sent}/${broadcastProgress.total}`
                  : "Cada utilizador recebe isto na conversa oficial, como quando um post é removido."}
              </p>
              <button onClick={sendBroadcast} disabled={broadcastSending || !broadcastText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm text-white transition active:scale-95 disabled:opacity-40 shrink-0"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#7B5CE8)", boxShadow: "0 4px 14px rgba(91,63,207,0.4)" }}>
                {broadcastSending ? <Loader className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                Enviar a todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mensagens Oficiais (Instalar App / Atualizações / Dicas) ── */}
      {section === "official" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Mensagens Oficiais</h1>
          <p className="text-neutral-400 text-sm mb-6">
            Cartões ricos que chegam à caixa de entrada, sem perfil e sem possibilidade de resposta.
          </p>

          <div className="max-w-xl rounded-2xl p-5 mb-8" style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
            {/* Categoria — ícone e nome são fixos, o admin só escolhe qual */}
            <p className="text-[12px] font-bold text-neutral-500 mb-2">Categoria</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(Object.keys(OFFICIAL_CATEGORY_META) as OfficialCategory[]).map((cat) => {
                const meta = OFFICIAL_CATEGORY_META[cat];
                const isSel = officialCategory === cat;
                return (
                  <button key={cat} onClick={() => setOfficialCategory(cat)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition"
                    style={{ background: isSel ? `${meta.color}18` : "#f5f5f7", border: isSel ? `1px solid ${meta.color}60` : "1px solid transparent" }}>
                    <meta.Icon className="h-5 w-5" style={{ color: meta.color }} />
                    <span className="text-[11px] font-bold text-center" style={{ color: isSel ? meta.color : "#6b6b76" }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[12px] font-bold text-neutral-500 mb-2">Imagem</p>
            <input ref={officialImgInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOfficialImage(f); }} />
            <button onClick={() => officialImgInputRef.current?.click()} disabled={officialUploadingImg}
              className="w-full mb-4 rounded-2xl overflow-hidden flex items-center justify-center transition disabled:opacity-60"
              style={{ background: "#f5f5f7", height: officialImageUrl ? 140 : 90, border: "1px dashed #d4d4db" }}>
              {officialUploadingImg ? (
                <Loader className="h-5 w-5 animate-spin text-neutral-400" />
              ) : officialImageUrl ? (
                <img src={officialImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload className="h-5 w-5 text-neutral-400" />
                  <span className="text-[12px] text-neutral-400">Carregar imagem</span>
                </div>
              )}
            </button>

            <p className="text-[12px] font-bold text-neutral-500 mb-2">Título</p>
            <input value={officialTitle} onChange={(e) => setOfficialTitle(e.target.value)}
              placeholder='Ex.: "Instala a Hooda"'
              className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none text-neutral-900 placeholder:text-neutral-400 mb-4"
              style={{ background: "#f5f5f7" }} />

            <p className="text-[12px] font-bold text-neutral-500 mb-2">Descrição</p>
            <textarea value={officialDescription} onChange={(e) => setOfficialDescription(e.target.value)}
              rows={3} placeholder="Ex.: Adiciona a Hooda ao teu ecrã inicial para uma experiência melhor."
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none text-neutral-900 placeholder:text-neutral-400 mb-4"
              style={{ background: "#f5f5f7" }} />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-[12px] font-bold text-neutral-500 mb-2">Texto do botão</p>
                <input value={officialButtonText} onChange={(e) => setOfficialButtonText(e.target.value)}
                  placeholder="Instalar App"
                  className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none text-neutral-900 placeholder:text-neutral-400"
                  style={{ background: "#f5f5f7" }} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-neutral-500 mb-2">Ação</p>
                <select value={officialActionType} onChange={(e) => setOfficialActionType(e.target.value as OfficialActionType)}
                  className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none text-neutral-900"
                  style={{ background: "#f5f5f7" }}>
                  <option value="none">Sem botão</option>
                  <option value="install_pwa">Instalar PWA</option>
                  <option value="open_page">Abrir página (interna)</option>
                  <option value="open_link">Abrir link (externo)</option>
                </select>
              </div>
            </div>

            {(officialActionType === "open_page" || officialActionType === "open_link") && (
              <div className="mb-4">
                <p className="text-[12px] font-bold text-neutral-500 mb-2">
                  {officialActionType === "open_page" ? "Caminho da página (ex.: /explorar)" : "URL (ex.: https://...)"}
                </p>
                <input value={officialActionValue} onChange={(e) => setOfficialActionValue(e.target.value)}
                  placeholder={officialActionType === "open_page" ? "/explorar" : "https://..."}
                  className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none text-neutral-900 placeholder:text-neutral-400"
                  style={{ background: "#f5f5f7" }} />
              </div>
            )}

            <p className="text-[12px] font-bold text-neutral-500 mb-2">Público</p>
            <select value={officialAudience} onChange={(e) => setOfficialAudience(e.target.value as OfficialAudience)}
              className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none text-neutral-900 mb-5"
              style={{ background: "#f5f5f7" }}>
              <option value="all">Todos os utilizadores</option>
              <option value="new_users">Novos utilizadores (últimos 7 dias)</option>
              <option value="not_installed">Utilizadores que ainda não instalaram</option>
            </select>

            <button onClick={handleSendOfficial} disabled={officialSending || !officialTitle.trim() || !officialDescription.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white transition active:scale-95 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#5B3FCF,#7B5CE8)", boxShadow: "0 4px 14px rgba(91,63,207,0.4)" }}>
              {officialSending ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar mensagem
            </button>
          </div>

          <h2 className="text-lg font-extrabold text-neutral-900 mb-3">Histórico</h2>
          {officialHistoryLoading ? (
            <div className="flex items-center justify-center py-10"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : officialHistory.length === 0 ? (
            <p className="text-neutral-400 text-sm">Ainda sem mensagens enviadas.</p>
          ) : (
            <div className="max-w-xl rounded-2xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
              {officialHistory.map((m, i) => {
                const meta = OFFICIAL_CATEGORY_META[m.category];
                return (
                  <div key={m.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #f0f0f3" }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
                      <meta.Icon className="h-4 w-4" style={{ color: meta.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-neutral-900 truncate">{m.title}</p>
                      <p className="text-[12px] text-neutral-400">{meta.label} · {m.recipients} destinatários</p>
                    </div>
                    <p className="text-[11px] text-neutral-300 shrink-0">{new Date(m.created_at).toLocaleString("pt-PT")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Auditoria (registo de ações do admin) ── */}
      {section === "audit" && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">Auditoria</h1>
          <p className="text-neutral-400 text-sm mb-6">Histórico de todas as ações de moderação feitas no painel.</p>
          {auditLoading ? (
            <div className="flex items-center justify-center py-16"><Loader className="h-5 w-5 animate-spin text-neutral-400" /></div>
          ) : auditList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <History className="h-8 w-8 text-neutral-300" />
              <p className="text-neutral-400 text-sm">Ainda sem ações registadas.</p>
            </div>
          ) : (
            <div className="max-w-2xl rounded-2xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid #ececf1" }}>
              {auditList.map((a, i) => {
                const actionLabels: Record<string, { label: string; color: string }> = {
                  ban: { label: "Baniu", color: "#F87171" },
                  unban: { label: "Desbaniu", color: "#6BA547" },
                  verify: { label: "Verificou", color: "#3B9EFF" },
                  unverify: { label: "Removeu selo de", color: "#9a9aa5" },
                  delete_account: { label: "Eliminou a conta de", color: "#F87171" },
                  delete_post: { label: "Eliminou publicação de", color: "#F26B3A" },
                  delete_channel: { label: "Eliminou canal de", color: "#F26B3A" },
                  report_resolved: { label: "Resolveu denúncia sobre", color: "#6BA547" },
                  report_dismissed: { label: "Ignorou denúncia sobre", color: "#9a9aa5" },
                  broadcast: { label: "Enviou comunicado a", color: "#5B3FCF" },
                  send_official_message: { label: "Enviou mensagem oficial", color: "#5B3FCF" },
                };
                const info = actionLabels[a.action] ?? { label: a.action, color: "#5B3FCF" };
                return (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #f0f0f3" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: info.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-900">
                        <span className="font-semibold">@{a.admin_username ?? "admin"}</span>
                        <span style={{ color: info.color }}> {info.label} </span>
                        <span className="font-semibold">{a.target_label ?? ""}</span>
                      </p>
                      {a.details && <p className="text-neutral-400 text-[12px] mt-0.5 line-clamp-2">{a.details}</p>}
                    </div>
                    <p className="text-[11px] text-neutral-300 shrink-0">{new Date(a.created_at).toLocaleString("pt-PT")}</p>
                  </div>
                );
              })}
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
              <div className="flex items-center gap-1 p-1 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <button onClick={() => setReplyAllowedTo(true)}
                  title="Permitir que o utilizador responda nesta conversa"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95"
                  style={{
                    background: replyAllowed ? "#ffffff" : "transparent",
                    color: replyAllowed ? "#4d8a32" : "rgba(255,255,255,0.75)",
                  }}>
                  <UnlockIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Permitir</span>
                </button>
                <button onClick={() => setReplyAllowedTo(false)}
                  title="Bloquear resposta do utilizador nesta conversa"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95"
                  style={{
                    background: !replyAllowed ? "#ffffff" : "transparent",
                    color: !replyAllowed ? "#EF4444" : "rgba(255,255,255,0.75)",
                  }}>
                  <Lock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Bloquear</span>
                </button>
              </div>
            </div>
            {!replyAllowed && (
              <div className="px-4 py-1.5 text-center text-[11px] font-semibold shrink-0"
                style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
                Resposta bloqueada — o utilizador vê um aviso e não consegue escrever nesta conversa.
              </div>
            )}

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
                const isVideo = m.message_type === "video" && m.media_url;
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
                          className="rounded-2xl max-w-full max-h-[420px] object-contain bg-black/5 cursor-zoom-in"
                          style={{ borderBottomRightRadius: isAdmin ? 4 : undefined, borderBottomLeftRadius: !isAdmin ? 4 : undefined }}
                        />
                      ) : isVideo ? (
                        <video
                          src={m.media_url ?? ""}
                          controls
                          playsInline
                          className="rounded-2xl max-w-full max-h-[420px] object-contain bg-black"
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
