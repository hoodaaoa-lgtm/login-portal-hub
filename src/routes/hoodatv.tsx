import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

/* ══════════════════════════════════
   HOODATV INTRO — Opção B (letras caem do topo + TV gradiente)
══════════════════════════════════ */
const INTRO_KEY      = "hoodatv_intro_seen";
const INTRO_DURATION = 3000;

const HOODA_LETTERS = [
  { char: "H", color: "#5B3FCF" },
  { char: "o", color: "#F26B3A" },
  { char: "o", color: "#1FAFA6" },
  { char: "d", color: "#6BA547" },
  { char: "a", color: "#E94B8A" },
];
const DOT_COLORS = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A"];

function HoodaTVIntro({ onDone }: { onDone: () => void }) {
  const [letterIn,  setLetterIn]  = useState<boolean[]>(Array(5).fill(false));
  const [tvIn,      setTvIn]      = useState(false);
  const [dotsIn,    setDotsIn]    = useState<boolean[]>(Array(5).fill(false));
  const [exiting,   setExiting]   = useState(false);

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];

    // Letras caem uma a uma do topo
    HOODA_LETTERS.forEach((_, i) => {
      t.push(setTimeout(() => {
        setLetterIn(prev => { const n = [...prev]; n[i] = true; return n; });
      }, 200 + i * 130));
    });

    // TV aparece com gradiente
    t.push(setTimeout(() => setTvIn(true), 200 + 5 * 130 + 80));

    // Dots surgem um a um
    DOT_COLORS.forEach((_, i) => {
      t.push(setTimeout(() => {
        setDotsIn(prev => { const n = [...prev]; n[i] = true; return n; });
      }, 200 + 5 * 130 + 400 + i * 80));
    });

    // Exit
    t.push(setTimeout(() => setExiting(true), INTRO_DURATION - 600));
    t.push(setTimeout(() => onDone(), INTRO_DURATION));

    return () => t.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999,
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      opacity: exiting ? 0 : 1,
      transition: exiting ? "opacity 0.6s ease-in" : "none",
      pointerEvents: exiting ? "none" : "all",
    }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>

        {/* Hooda — letras caem do topo com rotate */}
        {HOODA_LETTERS.map((l, i) => (
          <span key={i} style={{
            display: "inline-block",
            fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif',
            fontWeight: 900,
            fontSize: "clamp(3.2rem, 11vw, 6rem)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: l.color,
            opacity: letterIn[i] ? 1 : 0,
            transform: letterIn[i]
              ? "translateY(0) rotate(0deg)"
              : "translateY(-80px) rotate(-8deg)",
            transition: letterIn[i]
              ? `opacity 0.45s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)`
              : "none",
          }}>
            {l.char}
          </span>
        ))}

        {/* TV — cápsula com gradiente roxo→rosa */}
        <span style={{
          display: "inline-block",
          fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: "clamp(1.1rem, 3.5vw, 1.8rem)",
          letterSpacing: "0.18em",
          color: "#fff",
          background: "linear-gradient(135deg, #5B3FCF, #E94B8A)",
          padding: "5px 12px 7px",
          borderRadius: "8px",
          marginLeft: "10px",
          marginBottom: "clamp(6px, 1.5vw, 12px)",
          opacity: tvIn ? 1 : 0,
          transform: tvIn ? "scale(1)" : "scale(0)",
          transition: tvIn
            ? "opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)"
            : "none",
        }}>
          TV
        </span>
      </div>

      {/* Dots coloridos */}
      <div style={{ display: "flex", gap: "8px", marginTop: "22px" }}>
        {DOT_COLORS.map((color, i) => (
          <span key={i} style={{
            width: "8px", height: "8px",
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            opacity: dotsIn[i] ? 1 : 0,
            transform: dotsIn[i] ? "scale(1)" : "scale(0)",
            transition: dotsIn[i]
              ? "opacity 0.3s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"
              : "none",
          }} />
        ))}
      </div>
    </div>
  );
}
import {
  Search, Bell, Play, Eye, Clock, TrendingUp, Star, Users,
  UserPlus, X, Flame, Sparkles, Clapperboard,
  MoreVertical, ThumbsUp, BookmarkPlus,
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
        .select("id,title,thumbnail_url,duration_seconds,views_count,likes_count,created_at,published_at,channel_id,channels(name,handle,avatar_url)")
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
  return (
    <div className="animate-pulse space-y-3">
      <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
      <div className="flex gap-2.5">
        <div className="w-9 h-9 rounded-full shrink-0" style={{ background: "var(--s3)" }} />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "80%" }} />
          <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "55%" }} />
        </div>
      </div>
    </div>
  );
}

/* ── Video Card ── */
function VideoCard({ v, rank }: { v: any; rank?: number }) {
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const ch = v.channel;
  const bg = avatarColor(ch?.name ?? "");

  return (
    <div className="group cursor-pointer">
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-2xl overflow-hidden"
        style={{ background: "var(--s3)", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `${bg}18` }}>
              <Play className="w-12 h-12" style={{ color: bg, opacity: 0.5 }} />
            </div>}

        {/* Duration */}
        {v.duration_seconds && (
          <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded-lg"
            style={{ background: "rgba(0,0,0,0.80)" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}

        {/* Rank badge */}
        {rank !== undefined && rank < 3 && (
          <div className="absolute top-2 left-2 w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white"
            style={{ background: rank === 0 ? "#FFC93C" : rank === 1 ? "#aaa" : "#cd7f32" }}>
            {rank + 1}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{ background: "rgba(0,0,0,0.28)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: "rgba(255,255,255,0.96)" }}>
            <Play className="w-6 h-6 ml-1" style={{ color: P }} />
          </div>
        </div>

        {/* Menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); setMenu(m => !m); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
            <MoreVertical className="w-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 rounded-2xl shadow-2xl z-20 overflow-hidden min-w-[160px] border"
              style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}
              onClick={e => e.stopPropagation()}>
              {[
                { icon: <BookmarkPlus className="w-4 h-4" />, label: "Guardar" },
                { icon: <ThumbsUp className="w-4 h-4" />, label: "Gosto" },
              ].map(a => (
                <button key={a.label} onClick={() => setMenu(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-[var(--s2)]"
                  style={{ color: "var(--text-primary)" }}>
                  {a.icon}{a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex gap-2.5 mt-3">
        <div className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold mt-0.5"
          style={{ background: bg }}>
          {ch?.avatar_url ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" /> : (ch?.name?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-[1.35] line-clamp-2" style={{ color: "var(--text-primary)" }}>
            {v.title}
          </p>
          <p className="text-[12px] mt-0.5 font-medium hover:underline cursor-pointer" style={{ color: "var(--text-secondary)" }}
            onClick={e => { e.stopPropagation(); if (ch?.handle) navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } }); }}>
            {ch?.name ?? "Canal"}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {fmtV(Number(v.views_count ?? 0))} visualizações · {timeAgo(v.published_at ?? v.created_at)}
          </p>
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
    <div className="group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" onClick={() => navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } })}
      style={{ background: "var(--s0)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-card)" }}>
      <div className="relative">
        <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-bold ring-2 ring-white shadow"
          style={{ background: bg }}>
          {ch.avatar_url ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" /> : (ch.name?.[0] ?? "?").toUpperCase()}
        </div>
        {isFollowing && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: GREEN, border: "2px solid var(--s0)" }}>
            <Eye className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
      <div className="text-center min-w-0 w-full">
        <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
        <p className="text-[11px]" style={{ color: P }}>@{ch.handle}</p>
        {ch.category && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{ch.category}</p>}
      </div>
      <button onClick={onFollow}
        className="w-full h-8 rounded-full text-xs font-bold transition-all active:scale-95"
        style={isFollowing
          ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
          : { background: GRAD, color: "#fff" }}>
        {isFollowing ? "A seguir ✓" : "+ Seguir"}
      </button>
    </div>
  );
}

/* ── Section header ── */
function SHead({ icon, title, sub, accent, action }: { icon: React.ReactNode; title: string; sub?: string; accent: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: accent + "18" }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="flex-1">
        <h2 className="text-base font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {sub && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Filter pills ── */
const FILTERS = [
  { key: "alta",     label: "Em Alta",    icon: <Flame className="w-3.5 h-3.5" />,    accent: PINK },
  { key: "recentes", label: "Recentes",   icon: <Clock className="w-3.5 h-3.5" />,    accent: TEAL },
  { key: "ti",       label: "Para Ti",    icon: <Sparkles className="w-3.5 h-3.5" />, accent: YELLOW },
  { key: "canais",   label: "Canais",     icon: <Star className="w-3.5 h-3.5" />,     accent: ORANGE },
  { key: "seguindo", label: "Seguindo",   icon: <Users className="w-3.5 h-3.5" />,    accent: P },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
function HoodaTVPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Se estiver numa rota filha (ex: /hoodatv/canal/xyz), renderiza só o Outlet
  if (pathname !== "/hoodatv") return <Outlet />;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("alta");

  // ── Intro: uma vez por sessão ──
  const [showIntro, setShowIntro] = useState(() => {
    try { return !sessionStorage.getItem(INTRO_KEY); } catch { return false; }
  });
  const handleIntroDone = () => {
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch {}
    setShowIntro(false);
  };

  const { data: me } = useMe();
  const { data: trending, isLoading: tL } = useVideos("views");
  const { data: recent,   isLoading: rL } = useVideos("recent");
  const { data: channels, isLoading: cL } = useChannels();
  const { data: followingIds = [] } = useFollowing(me?.id ?? null);
  const qc = useQueryClient();

  /* Realtime — novos vídeos, views/likes e novos canais aparecem ao vivo */
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

  const showVideos = filter === "alta" ? trending : recent;
  const loadingVideos = filter === "alta" ? tL : rL;

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        {showIntro && <HoodaTVIntro onDone={handleIntroDone} />}

        {/* ── HEADER ── */}
        <div className="sticky top-0 z-40 border-b"
          style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>

          {/* Top row */}
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Search */}
            <div className="flex-1 flex items-center gap-2 rounded-full px-4 h-10 border transition-all"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar vídeos, canais…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--text-primary)" }} />
              {search && <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} /></button>}
            </div>

            <button className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--s2)" }}>
              <Bell className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            </button>
          </div>

          {/* Filter pills */}
          {!search && (
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[13px] font-semibold transition-all active:scale-95"
                    style={active
                      ? { background: f.accent, color: "#fff", boxShadow: `0 4px 12px ${f.accent}44` }
                      : { background: "var(--s3)", color: "var(--text-secondary)" }}>
                    {f.icon} {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-4 py-7 space-y-12">

          {/* ══ SEARCH RESULTS ══ */}
          {search && (
            <section>
              <SHead icon={<Search className="w-4 h-4" />} title={`Resultados para "${search}"`} accent={P} />
              {!searchVideos.length
                ? <Empty msg={`Sem resultados para "${search}"`} />
                : <Grid>{searchVideos.map((v: any) => <VideoCard key={v.id} v={v} />)}</Grid>}
            </section>
          )}

          {/* ══ EM ALTA / RECENTES ══ */}
          {!search && (filter === "alta" || filter === "recentes") && (
            <section>
              <SHead
                icon={filter === "alta" ? <Flame className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                title={filter === "alta" ? "Em Alta" : "Mais Recentes"}
                sub={filter === "alta" ? "Os vídeos mais vistos agora" : "Acabados de publicar"}
                accent={filter === "alta" ? PINK : TEAL}
              />
              {loadingVideos
                ? <Grid>{Array.from({length:8}).map((_,i)=><VSkel key={i}/>)}</Grid>
                : !showVideos?.length
                  ? <Empty msg="Ainda não há vídeos publicados." />
                  : <Grid>{showVideos.map((v:any,i:number)=><VideoCard key={v.id} v={v} rank={filter==="alta"?i:undefined}/>)}</Grid>}
            </section>
          )}

          {/* ══ PARA TI ══ */}
          {!search && filter === "ti" && (
            <section>
              <SHead icon={<Sparkles className="w-4 h-4" />} title="Para Ti" sub="Baseado nos teus interesses" accent={YELLOW} />
              {rL
                ? <Grid>{Array.from({length:8}).map((_,i)=><VSkel key={i}/>)}</Grid>
                : !recent?.length
                  ? <Empty msg="Ainda sem recomendações — explora outros canais primeiro." />
                  : <Grid>{[...(recent??[])].sort(()=>Math.random()-.5).map((v:any)=><VideoCard key={v.id} v={v}/>)}</Grid>}
            </section>
          )}

          {/* ══ CANAIS ══ */}
          {!search && filter === "canais" && (
            <section>
              <SHead icon={<Star className="w-4 h-4" />} title="Canais em Destaque" sub="Descobre criadores da Hooda" accent={ORANGE} />
              {cL
                ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({length:5}).map((_,i)=>(
                      <div key={i} className="animate-pulse rounded-2xl p-5 space-y-3" style={{background:"var(--s2)"}}>
                        <div className="w-16 h-16 rounded-full mx-auto" style={{background:"var(--s3)"}}/>
                        <div className="h-3 rounded-full mx-auto" style={{background:"var(--s3)",width:"70%"}}/>
                        <div className="h-8 rounded-full" style={{background:"var(--s3)"}}/>
                      </div>
                    ))}
                  </div>
                : !channels?.length
                  ? <Empty msg="Nenhum canal disponível ainda." icon={<Clapperboard className="w-10 h-10"/>} />
                  : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {channels.map((ch:any)=>(
                        <ChannelCard key={ch.id} ch={ch}
                          isFollowing={followingIds.includes(ch.id)}
                          onFollow={()=>toggleFollow(ch.id)}/>
                      ))}
                    </div>}
            </section>
          )}

          {/* ══ SEGUINDO ══ */}
          {!search && filter === "seguindo" && (
            <section>
              <SHead icon={<Users className="w-4 h-4" />} title="Seguindo" sub="Novos vídeos dos canais que segues" accent={P} />
              {!me
                ? <Empty msg="Inicia sessão para ver os canais que segues." />
                : followingIds.length === 0
                  ? (
                    <div className="rounded-2xl p-8 text-center border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                      <UserPlus className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>Ainda não segues nenhum canal</p>
                      <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>Vai ao separador Canais e começa a seguir.</p>
                      <button onClick={() => setFilter("canais")}
                        className="px-5 py-2 rounded-full text-sm font-bold text-white"
                        style={{ background: GRAD }}>
                        Ver canais
                      </button>
                    </div>
                  )
                  : <Empty msg="Os canais que segues ainda não publicaram vídeos." />}
            </section>
          )}

        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">{children}</div>;
}

function Empty({ msg, icon }: { msg: string; icon?: React.ReactNode }) {
  return (
    <div className="py-14 text-center rounded-2xl border"
      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
      <div className="flex justify-center mb-3" style={{ color: "var(--text-muted)" }}>
        {icon ?? <Play className="w-10 h-10" />}
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{msg}</p>
    </div>
  );
}
