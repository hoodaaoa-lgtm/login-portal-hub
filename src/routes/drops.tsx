import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { DropsCreator } from "@/components/DropsCreator";
  Heart, MessageCircle, Repeat2, Share2, Eye, Plus, Clock,
  X, Image as ImageIcon, Music, Video, Type as TypeIcon, Play, Send, Droplet,
} from "lucide-react";
import { timeAgo } from "@/hooks/useTimeAgo";
import i18n from "@/lib/i18n";

function t(key: string, fallback: string) {
  const val = i18n.t(key) as string;
  return val === key ? fallback : val;
}

export const Route = createFileRoute("/drops")({
  head: () => ({ meta: [{ title: "Hooda — Drops" }] }),
  component: DropsPage,
});

const ACCENT = "#5B3FCF";
const PINK = "#E94B8A";
const TEAL = "#1FAFA6";
const PAGE = 10;

type ContentType = "photo" | "video" | "text" | "music";

interface Drop {
  id: string;
  user_id: string;
  author_username: string;
  content_type: ContentType;
  content_url: string | null;
  text_content: string | null;
  music_url: string | null;
  music_title: string | null;
  aspect_ratio: number | null;
  duration_hours: number;
  created_at: string;
  expires_at: string;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  shares_count: number;
  views_count: number;
  username: string;
  avatar_url: string | null;
  is_liked: boolean;
  is_reposted: boolean;
}

/* Devolve "expira em 20h" / "expira em 45m" / "a expirar" */
function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return t("drops.expiring", "a expirar");
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `${t("drops.expires_in", "expira em")} ${h}h`;
  const m = Math.max(1, Math.floor(diff / 60_000));
  return `${t("drops.expires_in", "expira em")} ${m}m`;
}

function DropsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/" }); return; }
      setUserId(session.user.id);
    })();
  }, [navigate]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["drops-feed"],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data: rows, error } = await (supabase as any)
        .from("drops")
        .select(`*, drop_interactions(interaction_type, user_id)`)
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE - 1);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((r: any) => r.user_id))];
      const pmap: Record<string, { username: string; avatar_url: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids as string[]);
        (profs || []).forEach((p: any) => { pmap[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
      }
      return (rows || []).map((d: any): Drop => ({
        ...d,
        username: pmap[d.user_id]?.username || d.author_username || "utilizador",
        avatar_url: pmap[d.user_id]?.avatar_url ?? null,
        is_liked: (d.drop_interactions || []).some((i: any) => i.interaction_type === "like" && i.user_id === userId),
        is_reposted: (d.drop_interactions || []).some((i: any) => i.interaction_type === "repost" && i.user_id === userId),
      }));
    },
    getNextPageParam: (last: Drop[], pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
    staleTime: 30_000,
  });

  const drops = data?.pages.flat() ?? [];

  // Atualização automática em tempo real
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("drops-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "drops" },
        () => qc.invalidateQueries({ queryKey: ["drops-feed"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "drop_interactions" },
        () => qc.invalidateQueries({ queryKey: ["drops-feed"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  // Limpar drops expirados periodicamente
  useEffect(() => {
    if (!userId) return;
    const run = () => { (supabase as any).rpc("cleanup_expired_drops"); };
    run();
    const id = setInterval(run, 5 * 60_000);
    return () => clearInterval(id);
  }, [userId]);

  // Scroll infinito
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { threshold: 0.1 });
    if (sentinel.current) obs.observe(sentinel.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-24 lg:pb-8">
        <div className="max-w-xl mx-auto px-3 sm:px-4">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between py-4 mb-2"
            style={{ background: "var(--s1)" }}>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK})`, boxShadow: "0 4px 14px rgba(91,63,207,.4)" }}>
                <Droplet className="w-[18px] h-[18px] text-white fill-white" />
              </span>
              <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Drops</h1>
              <span className="flex items-center gap-1.5 ml-1 text-[11px] font-extrabold" style={{ color: TEAL }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: TEAL }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: TEAL }} />
                </span>
                {t("drops.live", "AO VIVO")}
              </span>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-bold text-white transition active:scale-95"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK})` }}>
              <Plus className="w-4 h-4" /> {t("drops.create", "Criar")}
            </button>
          </div>

          {/* Feed */}
          <div className="space-y-4">
            {isLoading ? (
              [0, 1, 2].map((i) => <DropSkeleton key={i} />)
            ) : drops.length === 0 ? (
              <EmptyState />
            ) : (
              drops.map((d) => <DropCard key={d.id} drop={d} userId={userId} />)
            )}
          </div>

          <div ref={sentinel} className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {isFetchingNextPage ? t("drops.loading", "A carregar…") : ""}
          </div>
        </div>
        <BottomNav />
      </PageWrapper>

      {showCreate && userId && (
        <DropsCreator onClose={() => setShowCreate(false)} onPublish={(videoUrl, thumbnail, musicUrl, duration) => {
          // Publicar drop na BD
          publishDrop(videoUrl, thumbnail, musicUrl, duration);
        }} />
          onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["drops-feed"] }); }} />
      )}
    </>
  );
}

function DropCard({ drop, userId }: { drop: Drop; userId: string | null }) {
  const [liked, setLiked] = useState(drop.is_liked);
  const [likes, setLikes] = useState(drop.likes_count);
  const [reposted, setReposted] = useState(drop.is_reposted);
  const [reposts, setReposts] = useState(drop.reposts_count);
  const [shares, setShares] = useState(drop.shares_count);
  const [views, setViews] = useState(drop.views_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(drop.comments_count);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);

  // Registar visualização (uma vez por utilizador, ao entrar em ecrã)
  useEffect(() => {
    if (!userId || viewedRef.current) return;
    const obs = new IntersectionObserver(async (entries) => {
      if (entries[0]?.isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        obs.disconnect();
        const { error } = await (supabase as any).from("drop_interactions")
          .insert({ drop_id: drop.id, user_id: userId, interaction_type: "view" });
        if (!error) setViews((v) => v + 1);
      }
    }, { threshold: 0.6 });
    if (cardRef.current) obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, [userId, drop.id]);

  const toggle = useCallback(async (type: "like" | "repost") => {
    if (!userId) return;
    const isLike = type === "like";
    const active = isLike ? liked : reposted;
    const setActive = isLike ? setLiked : setReposted;
    const setCount = isLike ? setLikes : setReposts;
    setActive(!active);
    setCount((c) => Math.max(0, c + (active ? -1 : 1)));
    if (active) {
      await (supabase as any).from("drop_interactions").delete()
        .match({ drop_id: drop.id, user_id: userId, interaction_type: type });
    } else {
      await (supabase as any).from("drop_interactions")
        .insert({ drop_id: drop.id, user_id: userId, interaction_type: type });
    }
  }, [userId, liked, reposted, drop.id]);

  const share = useCallback(async () => {
    if (!userId) return;
    const url = `${window.location.origin}/drops`;
    try {
      if (navigator.share) await navigator.share({ title: "Hooda Drops", url });
      else await navigator.clipboard.writeText(url);
    } catch { /* utilizador cancelou */ }
    const { error } = await (supabase as any).from("drop_interactions")
      .insert({ drop_id: drop.id, user_id: userId, interaction_type: "share" });
    if (!error) setShares((s) => s + 1);
  }, [userId, drop.id]);

  const initial = (drop.username?.[0] ?? "?").toUpperCase();

  return (
    <div ref={cardRef} className="rounded-3xl p-4 sm:p-5"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-card)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="shrink-0 rounded-full p-[2px]"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK}, #FFC93C)` }}>
          <div className="w-11 h-11 rounded-full overflow-hidden grid place-items-center text-white font-bold"
            style={{ background: ACCENT, border: "2px solid var(--s0)" }}>
            {drop.avatar_url
              ? <img src={drop.avatar_url} alt="" className="w-full h-full object-cover" />
              : initial}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[15px] truncate" style={{ color: "var(--text-primary)" }}>{drop.username}</p>
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            @{drop.author_username} · {timeAgo(drop.created_at)}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1.5 rounded-full shrink-0"
          style={{ color: PINK, background: "rgba(233,75,138,.10)" }}>
          <Clock className="w-3 h-3" /> {timeLeft(drop.expires_at)}
        </span>
      </div>

      {/* Conteúdo */}
      {drop.text_content && (
        <p className="text-[15px] leading-relaxed mb-3 whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
          {drop.text_content}
        </p>
      )}
      {drop.content_type === "photo" && drop.content_url && (
        <div className="rounded-2xl overflow-hidden mb-3 bg-black flex justify-center">
          <img src={drop.content_url} alt="" className="w-full object-contain"
            style={{ maxHeight: drop.aspect_ratio != null && drop.aspect_ratio < 1 ? "75vh" : "560px" }} />
        </div>
      )}
      {drop.content_type === "video" && drop.content_url && (
        <div className="rounded-2xl overflow-hidden mb-3">
          <DropVideo src={drop.content_url} aspect={drop.aspect_ratio} />
        </div>
      )}
      {drop.content_type === "music" && drop.music_url && (
        <div className="flex items-center gap-3 rounded-2xl p-3.5 mb-3"
          style={{ background: `linear-gradient(135deg, ${ACCENT}18, ${PINK}18)` }}>
          <span className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK})` }}>
            <Music className="w-5 h-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
              {drop.music_title || t("drops.audio", "Áudio original")}
            </p>
            <audio src={drop.music_url} controls className="w-full mt-1.5 h-8" />
          </div>
        </div>
      )}

      {/* Views */}
      <p className="text-xs mb-2.5 px-0.5" style={{ color: "var(--text-muted)" }}>
        {views.toLocaleString("pt-PT")} {t("drops.views", "visualizações")}
      </p>

      {/* Ações */}
      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
        <ActionBtn active={liked} activeColor={PINK} onClick={() => toggle("like")}
          icon={<Heart className={`w-[19px] h-[19px] ${liked ? "fill-current" : ""}`} />} label={likes} />
        <ActionBtn onClick={() => setShowComments(true)}
          icon={<MessageCircle className="w-[19px] h-[19px]" />} label={comments} />
        <ActionBtn active={reposted} activeColor={TEAL} onClick={() => toggle("repost")}
          icon={<Repeat2 className="w-[19px] h-[19px]" />} label={reposts} />
        <ActionBtn onClick={share}
          icon={<Share2 className="w-[19px] h-[19px]" />} label={shares} />
        <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
          <Eye className="w-[19px] h-[19px]" /> {views > 999 ? `${(views / 1000).toFixed(1)}k` : views}
        </span>
      </div>

      {showComments && userId && (
        <DropCommentsModal dropId={drop.id} userId={userId}
          onClose={() => setShowComments(false)}
          onCountChange={setComments} />
      )}
    </div>
  );
}

/* Player estilo feed: deteta short (retrato) e limita a altura, como no Home/Studio */
function DropVideo({ src, aspect }: { src: string; aspect: number | null }) {
  const [isShort, setIsShort] = useState<boolean | null>(aspect != null ? aspect < 1 : null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  function toggle() {
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }

  return (
    <div className="w-full bg-black relative cursor-pointer"
      style={{ aspectRatio: isShort === true ? "9/16" : "16/9", maxHeight: isShort === true ? "75vh" : "560px" }}
      onClick={toggle}>
      <video ref={ref} src={src} playsInline preload="metadata"
        onLoadedMetadata={() => { const v = ref.current; if (v) setIsShort(v.videoHeight > v.videoWidth); }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="w-full h-full block"
        style={{ display: "block", pointerEvents: "none", objectFit: "contain" }}
        onContextMenu={(e) => e.preventDefault()} />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <svg className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
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

function ActionBtn({ icon, label, active, activeColor, onClick }: {
  icon: React.ReactNode; label: number; active?: boolean; activeColor?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-[13px] font-semibold transition active:scale-90"
      style={{ color: active ? activeColor : "var(--text-secondary)" }}>
      {icon}
      {label > 0 && <span>{label > 999 ? `${(label / 1000).toFixed(1)}k` : label}</span>}
    </button>
  );
}

function DropCommentsModal({ dropId, userId, onClose, onCountChange }: {
  dropId: string; userId: string; onClose: () => void; onCountChange: (n: number) => void;
}) {
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("username, avatar_url").eq("id", userId).maybeSingle();
      setMe(prof as any);
      const { data } = await (supabase as any).from("drop_comments")
        .select("*").eq("drop_id", dropId).order("created_at", { ascending: true });
      const rows = data || [];
      const ids = [...new Set(rows.map((r: any) => r.user_id))];
      const pmap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids as string[]);
        (profs || []).forEach((p: any) => { pmap[p.id] = p; });
      }
      setList(rows.map((r: any) => ({ ...r, profiles: pmap[r.user_id] })));
      setLoading(false);
    })();
  }, [dropId, userId]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setText("");
    const { data } = await (supabase as any).from("drop_comments")
      .insert({ drop_id: dropId, user_id: userId, content }).select("*").single();
    if (data) {
      setList((l) => { const next = [...l, { ...data, profiles: me }]; onCountChange(next.length); return next; });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "var(--s0)", maxHeight: "85vh", height: "70vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="font-extrabold" style={{ color: "var(--text-primary)" }}>{t("drops.comments", "Comentários")}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              {t("drops.no_comments", "Sê o primeiro a comentar")}
            </p>
          ) : list.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden grid place-items-center text-white text-xs font-bold shrink-0"
                style={{ background: ACCENT }}>
                {c.profiles?.avatar_url
                  ? <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (c.profiles?.username?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                  {c.profiles?.username || "utilizador"} <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>{timeAgo(c.created_at)}</span>
                </p>
                <p className="text-sm break-words" style={{ color: "var(--text-secondary)" }}>{c.content}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={t("drops.write_comment", "Escreve um comentário…")}
            className="flex-1 px-4 h-11 rounded-full text-sm outline-none"
            style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
          <button onClick={send} disabled={!text.trim()}
            className="w-11 h-11 rounded-full grid place-items-center text-white shrink-0 disabled:opacity-40"
            style={{ background: ACCENT }}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
  const [type, setType] = useState<ContentType>("text");
  const [text, setText] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [aspect, setAspect] = useState<number | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setAspect(null);
    const url = f ? URL.createObjectURL(f) : null;
    setPreview(url);
    if (!f || !url) return;
    // Lê as dimensões naturais para preservar o tamanho/aspeto (shorts incluídos)
    if (f.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => { if (img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight); };
      img.src = url;
    } else if (f.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { if (v.videoHeight) setAspect(v.videoWidth / v.videoHeight); };
      v.src = url;
    }
  }

  async function submit() {
    setError(null);
    if (type === "text" && !text.trim()) { setError(t("drops.err_text", "Escreve algo")); return; }
    if ((type === "photo" || type === "video") && !file) { setError(t("drops.err_media", "Escolhe um ficheiro")); return; }
    if (type === "music" && !musicUrl.trim()) { setError(t("drops.err_music", "Indica o link da música")); return; }

    setBusy(true);
    try {
      let contentUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("posts-media")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        contentUrl = supabase.storage.from("posts-media").getPublicUrl(path).data.publicUrl;
      }
      const { error: insErr } = await (supabase as any).from("drops").insert({
        user_id: userId,
        content_type: type,
        content_url: contentUrl,
        text_content: text.trim() || null,
        music_url: type === "music" ? musicUrl.trim() : null,
        music_title: type === "music" ? (musicTitle.trim() || null) : null,
        aspect_ratio: (type === "photo" || type === "video") ? aspect : null,
        duration_hours: duration,
      });
      if (insErr) throw insErr;
      onCreated();
    } catch (e: any) {
      setError(e?.message || t("drops.err_generic", "Não foi possível publicar"));
      setBusy(false);
    }
  }

  const TYPES: { type: ContentType; icon: typeof ImageIcon; label: string }[] = [
    { type: "text", icon: TypeIcon, label: t("drops.text", "Texto") },
    { type: "photo", icon: ImageIcon, label: t("drops.photo", "Foto") },
    { type: "video", icon: Video, label: t("drops.video", "Vídeo") },
    { type: "music", icon: Music, label: t("drops.music", "Música") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: "var(--s0)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{t("drops.create_drop", "Criar Drop")}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-5">
          {TYPES.map(({ type: ty, icon: Icon, label }) => (
            <button key={ty} onClick={() => { setType(ty); setFile(null); setPreview(null); }}
              className="py-3 rounded-2xl flex flex-col items-center gap-1.5 text-xs font-semibold transition"
              style={{
                background: type === ty ? `${ACCENT}18` : "var(--s2)",
                color: type === ty ? ACCENT : "var(--text-secondary)",
                border: type === ty ? `1.5px solid ${ACCENT}` : "1.5px solid transparent",
              }}>
              <Icon className="w-5 h-5" /> {label}
            </button>
          ))}
        </div>

        {(type === "text" || type === "photo" || type === "video") && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={type === "text" ? 4 : 2}
            placeholder={t("drops.text_placeholder", "Escreve algo…")}
            className="w-full px-4 py-3 rounded-2xl mb-4 resize-none outline-none text-sm"
            style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
        )}

        {(type === "photo" || type === "video") && (
          <div className="mb-4">
            <input ref={fileRef} type="file" hidden accept={type === "photo" ? "image/*" : "video/*"}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            {preview ? (
              <div className="relative rounded-2xl overflow-hidden flex justify-center" style={{ background: "var(--s2)" }}>
                {type === "photo"
                  ? <img src={preview} alt="" className="w-full max-h-72 object-contain" />
                  : <video src={preview} controls playsInline className="w-full max-h-72 object-contain bg-black" />}
                <button onClick={() => pickFile(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center" style={{ background: "rgba(0,0,0,.6)" }}>
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 text-sm"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                {type === "photo" ? <ImageIcon className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                {t("drops.pick_file", "Escolher ficheiro")}
              </button>
            )}
          </div>
        )}

        {type === "music" && (
          <div className="space-y-3 mb-4">
            <input value={musicTitle} onChange={(e) => setMusicTitle(e.target.value)}
              placeholder={t("drops.music_title", "Título (opcional)")}
              className="w-full px-4 h-11 rounded-2xl outline-none text-sm"
              style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
            <input value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)}
              placeholder={t("drops.music_url", "Link do áudio (mp3…)")}
              className="w-full px-4 h-11 rounded-2xl outline-none text-sm"
              style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
          </div>
        )}

        {/* Duração */}
        <p className="text-sm font-bold mb-2" style={{ color: "var(--text-primary)" }}>{t("drops.duration", "Duração")}</p>
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[6, 12, 24, 48].map((h) => (
            <button key={h} onClick={() => setDuration(h)}
              className="py-2.5 rounded-xl text-sm font-bold transition"
              style={{
                background: duration === h ? ACCENT : "var(--s2)",
                color: duration === h ? "#fff" : "var(--text-secondary)",
              }}>
              {h}h
            </button>
          ))}
        </div>

        {error && <p className="text-sm mb-3" style={{ color: "#ef4444" }}>{error}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full py-3.5 rounded-2xl font-bold text-white transition active:scale-[.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK})` }}>
          {busy ? t("drops.publishing", "A publicar…") : t("drops.publish", "Publicar Drop")}
        </button>
      </div>
    </div>
  );
}

function DropSkeleton() {
  return (
    <div className="rounded-3xl p-5 animate-pulse" style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-full" style={{ background: "var(--s2)" }} />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded" style={{ background: "var(--s2)" }} />
          <div className="h-2.5 w-20 rounded" style={{ background: "var(--s2)" }} />
        </div>
      </div>
      <div className="h-40 rounded-2xl mb-4" style={{ background: "var(--s2)" }} />
      <div className="h-3 w-24 rounded" style={{ background: "var(--s2)" }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-6">
      <span className="w-16 h-16 mx-auto mb-4 rounded-full grid place-items-center"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PINK})` }}>
        <Droplet className="w-7 h-7 text-white fill-white" />
      </span>
      <p className="font-extrabold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
        {t("drops.empty_title", "Ainda não há Drops")}
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {t("drops.empty_sub", "Segue mais pessoas ou cria o teu primeiro Drop 💧")}
      </p>
    </div>
  );
}
