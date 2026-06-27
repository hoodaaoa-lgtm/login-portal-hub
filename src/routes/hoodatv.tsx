import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

/* ══════════════════════════════════
   HOODATV INTRO
══════════════════════════════════ */
const INTRO_KEY      = "hoodatv_intro_seen";
const INTRO_DURATION = 3000;
let _introSeenThisSession = (() => {
  try { return !!sessionStorage.getItem(INTRO_KEY); } catch { return false; }
})();

const HOODA_LETTERS = [
  { char: "H", color: "#5B3FCF" },
  { char: "o", color: "#F26B3A" },
  { char: "o", color: "#1FAFA6" },
  { char: "d", color: "#6BA547" },
  { char: "a", color: "#E94B8A" },
];
const DOT_COLORS = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A"];

function HoodaTVIntro({ onDone }: { onDone: () => void }) {
  const [letterIn, setLetterIn] = useState<boolean[]>(Array(5).fill(false));
  const [tvIn, setTvIn]         = useState(false);
  const [dotsIn, setDotsIn]     = useState<boolean[]>(Array(5).fill(false));
  const [exiting, setExiting]   = useState(false);

  useEffect(() => {
    // Bloquear scroll do body durante o intro
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const t: ReturnType<typeof setTimeout>[] = [];
    HOODA_LETTERS.forEach((_, i) => {
      t.push(setTimeout(() => {
        setLetterIn(prev => { const n = [...prev]; n[i] = true; return n; });
      }, 200 + i * 130));
    });
    t.push(setTimeout(() => setTvIn(true), 200 + 5 * 130 + 80));
    DOT_COLORS.forEach((_, i) => {
      t.push(setTimeout(() => {
        setDotsIn(prev => { const n = [...prev]; n[i] = true; return n; });
      }, 200 + 5 * 130 + 400 + i * 80));
    });
    t.push(setTimeout(() => setExiting(true), INTRO_DURATION - 600));
    t.push(setTimeout(() => onDone(), INTRO_DURATION));
    return () => {
      t.forEach(clearTimeout);
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = "";
    };
  }, [onDone]);

  return createPortal(
    <div style={{
      position: "fixed", inset: 0,
      zIndex: 9999, background: "var(--s1)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: exiting ? 0 : 1,
      transition: exiting ? "opacity 0.6s ease-in" : "none",
      pointerEvents: exiting ? "none" : "all",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {HOODA_LETTERS.map((l, i) => (
          <span key={i} style={{
            display: "inline-block",
            fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif',
            fontWeight: 900, fontSize: "clamp(3.2rem, 11vw, 6rem)", lineHeight: 1,
            letterSpacing: "-0.02em", color: l.color,
            opacity: letterIn[i] ? 1 : 0,
            transform: letterIn[i] ? "translateY(0) rotate(0deg)" : "translateY(0) rotate(0deg)",
            transition: letterIn[i] ? `opacity 0.45s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)` : "none",
          }}>{l.char}</span>
        ))}
        <span style={{
          display: "inline-block",
          fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif',
          fontWeight: 900, fontSize: "clamp(1.1rem, 3.5vw, 1.8rem)",
          letterSpacing: "0.18em", color: "#fff",
          background: "linear-gradient(135deg, #5B3FCF, #E94B8A)",
          padding: "5px 12px 7px", borderRadius: "8px",
          marginLeft: "10px",
          alignSelf: "center",
          opacity: tvIn ? 1 : 0,
          transform: tvIn ? "scale(1)" : "scale(0)",
          transition: tvIn ? "opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)" : "none",
        }}>TV</span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        {DOT_COLORS.map((color, i) => (
          <span key={i} style={{
            width: "8px", height: "8px", borderRadius: "50%", background: color,
            display: "inline-block",
            opacity: dotsIn[i] ? 1 : 0,
            transform: dotsIn[i] ? "scale(1)" : "scale(0)",
            transition: dotsIn[i] ? "opacity 0.3s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          }} />
        ))}
      </div>
    </div>,
    document.body
  );
}

import {
  Search, Play, Star, Users,
  UserPlus, X, Sparkles, Clapperboard, CheckCircle2, Video, Heart,
  MoreVertical, Share2, Bookmark, Flag, ThumbsDown,
} from "lucide-react";

export const Route = createFileRoute("/hoodatv")({
  head: () => ({ meta: [{ title: "HoodaTV — Hooda" }] }),
  component: HoodaTVPage,
});

/* ── Tokens ── */
const P      = "#5B3FCF";
const PINK   = "#E94B8A";
const ORANGE = "#F26B3A";
const TEAL   = "#1FAFA6";
const GREEN  = "#6BA547";
const YELLOW = "#FFC93C";
const GRAD   = `linear-gradient(135deg,${P},${PINK})`;
const AVATAR_COLORS = [P, ORANGE, TEAL, GREEN, PINK];

/* ── Queries ── */
function useMe() {
  return useQuery({ queryKey: ["htv-me"], queryFn: async () => (await supabase.auth.getUser()).data.user ?? null, staleTime: 60_000 });
}
function useChannels() {
  return useQuery({
    queryKey: ["htv-channels"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("channels").select("id,name,handle,avatar_url,description,category").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    }, staleTime: 60_000,
  });
}
function useVideos(sort: "views" | "recent") {
  return useQuery({
    queryKey: ["htv-videos", sort],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select("id,title,thumbnail_url,duration_seconds,views_count,likes_count,created_at,published_at,channel_id,cf_embed_url,cf_stream_uid,cf_stream_url,channels(name,handle,avatar_url)")
        .eq("status", "published").eq("visibility", "public")
        .order(sort === "views" ? "views_count" : "created_at", { ascending: false }).limit(16);
      return (data ?? []).map((v: any) => ({ ...v, channel: v.channels }));
    }, staleTime: 120_000,
  });
}
function useFollowing(userId: string | null) {
  return useQuery({
    queryKey: ["htv-following", userId],
    queryFn: async () => {
      if (!userId) return [] as string[];
      const { data } = await (supabase as any).from("follows").select("following_id").eq("follower_id", userId).limit(50);
      return (data ?? []).map((f: any) => f.following_id as string);
    }, enabled: !!userId, staleTime: 30_000,
  });
}

/* ── Helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
};
const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff/60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const days = Math.floor(h/24); if (days < 30) return `${days}d`;
  const mo = Math.floor(days/30); if (mo < 12) return `${mo} meses`;
  return `${Math.floor(mo/12)} anos`;
};
const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

/* ── Skeleton ── */
function VSkel() {
  const { t } = useTranslation();
  return (
    <div className="animate-pulse">
      <div className="rounded-2xl" style={{ aspectRatio: "16/9", background: "var(--s3)" }} />
      <div className="flex gap-2.5 pt-3 px-0.5">
        <div className="w-9 h-9 rounded-full shrink-0" style={{ background: "var(--s3)" }} />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 rounded-full" style={{ background: "var(--s3)", width: "90%" }} />
          <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "55%" }} />
          <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "40%" }} />
        </div>
      </div>
    </div>
  );
}

/* ── Three-dot menu ── */
function VideoMenu({ v }: { v: any }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = [
    {
      icon: <Share2 className="w-4 h-4" />,
      label: t("common.share"),
      action: () => {
        const url = `${window.location.origin}/hoodatv/watch/${v.id}`;
        navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!")).catch(() => toast.error("Não foi possível copiar."));
        setOpen(false);
      },
    },
    {
      icon: <Bookmark className="w-4 h-4" />,
      label: t("common.save"),
      action: async () => {
        setOpen(false);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.error("Inicia sessão para guardar vídeos."); return; }
        const { error } = await (supabase as any).from("saved_videos").upsert({ user_id: user.id, video_id: v.id }, { onConflict: "user_id,video_id" });
        if (error) toast.error("Erro ao guardar.");
        else toast.success("Vídeo guardado!");
      },
    },
    {
      icon: <ThumbsDown className="w-4 h-4" />,
      label: t("post.no_interest"),
      action: () => {
        setOpen(false);
        toast("Vídeo ocultado.", { description: "Vais ver menos conteúdo deste tipo." });
      },
    },
    {
      icon: <Flag className="w-4 h-4" />,
      label: t("common.report"),
      action: () => {
        setOpen(false);
        toast("Denúncia enviada.", { description: "Obrigado pelo teu feedback." });
      },
    },
  ];

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/10"
        style={{ color: "var(--text-muted)" }}>
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-10 z-50 w-52 rounded-2xl overflow-hidden shadow-2xl py-1"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          {items.map(item => (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition-colors hover:bg-[var(--s2)]"
              style={{ color: "var(--text-primary)" }}>
              <span style={{ color: "var(--text-muted)" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Video Card ── */
function VideoCard({ v, rank }: { v: any; rank?: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ch = v.channel;
  const bg = avatarColor(ch?.name ?? "");

  return (
    <div
      className="group cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{ background: "transparent" }}
      onClick={() => navigate({ to: "/hoodatv/watch/$id", params: { id: v.id } })}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: "16/9", background: `linear-gradient(135deg, ${bg}33, ${bg}11)`, boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}
        onContextMenu={e => e.preventDefault()}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              onContextMenu={e => e.preventDefault()}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
          : <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Play className="w-12 h-12 opacity-30" style={{ color: bg }} />
            </div>}

        {/* Gradiente bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Duração */}
        {v.duration_seconds && (
          <span className="absolute bottom-2.5 right-2.5 text-[11px] font-bold text-white px-2 py-0.5 rounded-md z-10"
            style={{ background: "rgba(0,0,0,0.85)", letterSpacing: "0.02em" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}

        {/* Rank badge */}
        {rank !== undefined && rank < 3 && (
          <div className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-lg z-10"
            style={{ background: rank === 0 ? "#FFC93C" : rank === 1 ? "#aaa" : "#cd7f32" }}>
            {rank + 1}
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-sm"
            style={{ background: "var(--s0)", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
            <Play className="w-5 h-5 ml-0.5" style={{ color: P }} fill={P} />
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex gap-3 pt-3 px-0.5">
        {/* Avatar canal */}
        <div
          className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-sm font-bold cursor-pointer mt-0.5"
          style={{ background: bg, ['--tw-ring-color' as any]: `${bg}33` }}
          onClick={e => { e.stopPropagation(); if (ch?.handle) navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } }); }}>
          {ch?.avatar_url ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" /> : (ch?.name?.[0] ?? "?").toUpperCase()}
        </div>

        {/* Título + info */}
        <div className="flex-1 min-w-0 flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold leading-[1.35] line-clamp-2 mb-1"
              style={{ color: "var(--text-primary)" }}>
              {v.title?.replace(/\b\d{10,}\b/g, "").replace(/@\S+/g, "").trim()}
            </p>
            <p className="text-[12px] font-medium hover:underline cursor-pointer"
              style={{ color: P }}
              onClick={e => { e.stopPropagation(); if (ch?.handle) navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } }); }}>
              {ch?.name ?? "Canal"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {fmtV(Number(v.views_count ?? 0))} visualizações · {timeAgo(v.published_at ?? v.created_at)}
            </p>
          </div>
          <div className="shrink-0 -mt-1">
            <VideoMenu v={v} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Channel Card ── */
function ChannelCard({ ch, isFollowing, onFollow }: { ch: any; isFollowing: boolean; onFollow: () => void }) {
  const navigate = useNavigate();
  const bg = avatarColor(ch.name ?? "");

  return (
    <div
      className="group relative overflow-hidden rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-1"
      style={{ background: "var(--s0)", border: "1.5px solid var(--border-subtle)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
      onClick={() => navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } })}>

      {/* Banner colorido no topo */}
      <div className="h-16 w-full relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg}55)` }}>
        {/* pattern decorativo */}
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.35) 1px, transparent 1px), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35) 1px, transparent 1px)`, backgroundSize: "24px 24px" }} />
      </div>

      {/* Avatar flutuante sobre o banner */}
      <div className="flex flex-col items-center px-4 pb-4" style={{ marginTop: "-28px" }}>
        <div className="relative mb-2">
          <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-white text-lg font-extrabold ring-4 shadow-lg"
            style={{ background: bg, ['--tw-ring-color' as any]: "var(--s0)" }}>
            {ch.avatar_url ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" /> : (ch.name?.[0] ?? "?").toUpperCase()}
          </div>
          {isFollowing && (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: GREEN, border: "2px solid var(--s0)" }}>
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        <p className="text-sm font-bold truncate w-full text-center" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
        <p className="text-[11px] font-medium mb-3" style={{ color: P }}>@{ch.handle}</p>
        {ch.category && (
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full mb-3"
            style={{ background: `${bg}18`, color: bg }}>
            {ch.category}
          </span>
        )}

        <button
          onClick={e => { e.stopPropagation(); onFollow(); }}
          className="w-full h-8 rounded-full text-xs font-bold transition-all active:scale-95"
          style={isFollowing
            ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
            : { background: GRAD, color: "#fff", boxShadow: `0 4px 12px ${P}44` }}>
          {isFollowing ? "A seguir" : "Seguir"}
        </button>
      </div>
    </div>
  );
}

/* ── Filter pills ── */
const FILTERS = [
  { key: "ti",       label: "Vídeos",     icon: <Video className="w-3.5 h-3.5" />,      accent: PINK   },
  { key: "alta",     label: "Para ti",    icon: <Sparkles className="w-3.5 h-3.5" />,   accent: YELLOW },
  { key: "canais",   label: "Canais",     icon: <Star className="w-3.5 h-3.5" />,        accent: ORANGE },
  { key: "seguindo", label: "Seguindo",   icon: <Users className="w-3.5 h-3.5" />,       accent: P      },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
function HoodaTVPage() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/hoodatv") return <Outlet />;
  return <HoodaTVMain />;
}

function HoodaTVMain() {
  const { t } = useTranslation();
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<FilterKey>("ti");
  const [showIntro, setShowIntro] = useState(() => !_introSeenThisSession);

  const handleIntroDone = () => {
    _introSeenThisSession = true;
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch {}
    setShowIntro(false);
  };

  const { data: me }                        = useMe();
  const { data: trending, isLoading: tL }   = useVideos("views");
  const { data: recent,   isLoading: rL }   = useVideos("recent");
  const { data: channels, isLoading: cL }   = useChannels();
  const { data: followingIds = [] }          = useFollowing(me?.id ?? null);
  const qc = useQueryClient();

  /* Realtime */
  useEffect(() => {
    const ch = supabase
      .channel("hoodatv-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, () => {
        qc.invalidateQueries({ queryKey: ["htv-videos"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channels" }, () => {
        qc.invalidateQueries({ queryKey: ["htv-channels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, () => {
        if (me?.id) qc.invalidateQueries({ queryKey: ["htv-following", me.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, me?.id]);

  function toggleFollow(chId: string) {
    qc.setQueryData(["htv-following", me?.id], (old: string[] = []) =>
      old.includes(chId) ? old.filter(id => id !== chId) : [...old, chId]);
    if (me) {
      if (followingIds.includes(chId))
        (supabase as any).from("follows").delete().eq("follower_id", me.id).eq("following_id", chId);
      else
        (supabase as any).from("follows").insert({ follower_id: me.id, following_id: chId });
    }
  }

  const searchVideos = search
    ? (trending ?? []).filter((v: any) =>
        v.title?.toLowerCase().includes(search.toLowerCase()) ||
        v.channel?.name?.toLowerCase().includes(search.toLowerCase()))
    : [];

  const showVideos     = filter === "alta" ? trending : recent;
  const loadingVideos  = filter === "alta" || filter === "ti" ? tL : rL;

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 relative">
        {showIntro && <HoodaTVIntro onDone={handleIntroDone} />}

        {/* ── HEADER ── */}
        <div className="sticky top-0 z-40"
          style={{ background: "var(--s1)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", borderBottom: "1px solid var(--border-subtle)", opacity: 0.97 }}>

          {/* Pesquisa centrada */}
          <div className="flex justify-center px-4 pt-5 pb-4">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("tv.search")}
                className="w-full h-11 pl-11 pr-10 rounded-full text-sm outline-none transition-all"
                style={{
                  background: "var(--s2)",
                  border: `1.5px solid ${search ? P : "var(--border-default)"}`,
                  color: "var(--text-primary)",
                  boxShadow: search ? `0 0 0 4px ${P}16` : "0 1px 4px rgba(0,0,0,0.06)",
                }}
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition hover:opacity-70"
                  style={{ background: "var(--s3)" }}>
                  <X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>
          </div>

          {/* Filter pills centrados */}
          {!search && (
            <div className="flex justify-center gap-2 px-4 pb-4 overflow-x-auto no-scrollbar">
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className="shrink-0 flex items-center gap-2 px-5 h-9 rounded-full text-[13.5px] font-semibold transition-all duration-200 active:scale-95"
                    style={active
                      ? { background: f.accent, color: "#fff", boxShadow: `0 4px 16px ${f.accent}50` }
                      : { background: "var(--s0)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }}>
                    {f.icon} {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-8">

          {/* ══ SEARCH RESULTS ══ */}
          {search && (
            <section>
              <p className="text-sm font-semibold mb-6" style={{ color: "var(--text-muted)" }}>
                {searchVideos.length > 0
                  ? `${searchVideos.length} resultado${searchVideos.length !== 1 ? "s" : ""} para "${search}"`
                  : `Sem resultados para "${search}"`}
              </p>
              {searchVideos.length > 0
                ? <Grid>{searchVideos.map((v: any) => <VideoCard key={v.id} v={v} />)}</Grid>
                : <Empty msg={t("tv.try_different", "Tenta pesquisar algo diferente.")} />}
            </section>
          )}

          {/* ══ VÍDEOS / PARA TI ══ */}
          {!search && (filter === "ti" || filter === "alta") && (
            <section>
              {loadingVideos
                ? <Grid>{Array.from({length: 9}).map((_, i) => <VSkel key={i} />)}</Grid>
                : !showVideos?.length && !recent?.length
                  ? <Empty msg={t("tv.no_videos")} />
                  : <Grid>
                      {(filter === "ti"
                        ? [...(recent ?? [])].sort(() => Math.random() - .5)
                        : showVideos ?? []
                      ).map((v: any, i: number) =>
                        <VideoCard key={v.id} v={v} rank={filter === "alta" ? i : undefined} />
                      )}
                    </Grid>}
            </section>
          )}

          {/* ══ CANAIS ══ */}
          {!search && filter === "canais" && (
            <section>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>Canais</h2>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Descobre criadores da Hooda</p>
                </div>
              </div>
              {cL
                ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({length: 5}).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-3xl overflow-hidden" style={{ background: "var(--s2)" }}>
                        <div className="h-16" style={{ background: "var(--s3)" }} />
                        <div className="p-4 space-y-3 flex flex-col items-center" style={{ marginTop: "-28px" }}>
                          <div className="w-14 h-14 rounded-full" style={{ background: "var(--s3)" }} />
                          <div className="h-3 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
                          <div className="h-7 rounded-full w-full" style={{ background: "var(--s3)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                : !channels?.length
                  ? <Empty msg="Nenhum canal disponível ainda." icon={<Clapperboard className="w-10 h-10" />} />
                  : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {channels.map((ch: any) => (
                        <ChannelCard key={ch.id} ch={ch}
                          isFollowing={followingIds.includes(ch.id)}
                          onFollow={() => toggleFollow(ch.id)} />
                      ))}
                    </div>}
            </section>
          )}

          {/* ══ SEGUINDO ══ */}
          {!search && filter === "seguindo" && (
            <section>
              {!me
                ? <Empty msg={t("tv.sign_in_channels", "Inicia sessão para ver os canais que segues.")} />
                : followingIds.length === 0
                  ? (
                    <div className="rounded-3xl p-10 text-center border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                        style={{ background: `${P}15` }}>
                        <UserPlus className="w-8 h-8" style={{ color: P }} />
                      </div>
                      <p className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{t("tv.not_following_channels", "Ainda não segues nenhum canal")}</p>
                      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>{t("tv.go_to_channels", "Vai ao separador Canais e começa a seguir.")}</p>
                      <button onClick={() => setFilter("canais")}
                        className="px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-95"
                        style={{ background: GRAD, boxShadow: `0 4px 14px ${P}44` }}>
                        {t("tv.see_channels", "Ver canais")}
                      </button>
                    </div>
                  )
                  : <Empty msg={t("tv.following_no_videos", "Os canais que segues ainda não publicaram vídeos.")} />}
            </section>
          )}

        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">{children}</div>;
}

function Empty({ msg, icon }: { msg: string; icon?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="py-16 text-center rounded-3xl border"
      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
      <div className="flex justify-center mb-3" style={{ color: "var(--text-muted)" }}>
        {icon ?? <Play className="w-10 h-10" />}
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{msg}</p>
    </div>
  );
}
