import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, Star, BookOpen, Settings, LogOut, ChevronRight, ChevronLeft,
  MessageCircle, Bell, Shield, HelpCircle, Info, BarChart2, User, Moon, Sun,
  Users as UsersIcon, Eye, Heart, Film,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "@/contexts/ThemeContext";
import { useScrollLock } from "@/hooks/useScrollLock";

interface UserDrawerProps {
  userId: string;
  onClose: () => void;
}

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
}

interface Stats {
  followers: number;
  following: number;
  posts: number;
  rating: number;
  ratingCount: number;
}

interface MiniUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface VideoStat {
  id: string;
  text: string;
  kind: string;
  thumb: string | null;
  views: number;
  likes: number;
  createdAt: string;
}

interface RatingRow {
  stars: number;
  rater: MiniUser | null;
}

type View = "menu" | "stats" | "followers" | "following" | "ratings";

function Avatar({ user, size = 38 }: { user: { full_name?: string | null; username?: string | null; avatar_url?: string | null }; size?: number }) {
  const initial = (user.full_name?.[0] ?? user.username?.[0] ?? "?").toUpperCase();
  return (
    <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: user.avatar_url ? "transparent" : "#5B3FCF", fontSize: size * 0.42 }}>
      {user.avatar_url
        ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        : initial}
    </div>
  );
}

export function UserDrawer({ userId: _userId, onClose }: UserDrawerProps) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>("menu");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(_userId);
  const [myRating, setMyRating] = useState(0);
  const [savingRating, setSavingRating] = useState(false);

  // Sub-view data
  const [followers, setFollowers] = useState<MiniUser[] | null>(null);
  const [following, setFollowing] = useState<MiniUser[] | null>(null);
  const [videoStats, setVideoStats] = useState<VideoStat[] | null>(null);
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  useScrollLock();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const resolvedUid = _userId || session.user.id;
      setUid(resolvedUid);

      const [profRes, followersRes, followingRes, postsRes, ratingsRes, myRatingRes] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,avatar_url,bio").eq("id", resolvedUid).maybeSingle(),
        // followersRes preenchido abaixo depois de termos o username
        Promise.resolve({ count: 0 }),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", resolvedUid),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", resolvedUid),
        supabase.from("user_ratings").select("stars").eq("rated_user_id", resolvedUid),
        supabase.from("user_ratings").select("stars").eq("rated_user_id", resolvedUid).eq("rater_user_id", session.user.id).maybeSingle(),
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);

      // follows.target_username é TEXT (não há following_id) — contar seguidores
      // exige saber o username do dono do perfil primeiro.
      const myUsername = (profRes.data as any)?.username ?? "";
      const { count: realFollowersCount } = myUsername
        ? await supabase.from("follows").select("id", { count: "exact", head: true }).eq("target_username", myUsername)
        : { count: 0 };

      const allRatings = (ratingsRes.data ?? []) as { stars: number }[];
      const avg = allRatings.length > 0
        ? allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length : 0;
      setStats({
        followers: realFollowersCount ?? 0,
        following: followingRes.count ?? 0,
        posts: postsRes.count ?? 0,
        rating: avg,
        ratingCount: allRatings.length,
      });
      if ((myRatingRes.data as any)?.stars) setMyRating((myRatingRes.data as any).stars);
      setLoading(false);
    })();
  }, [_userId]);

  // Lazy-load sub-view data when entering each view
  useEffect(() => {
    if (!uid) return;
    if (view === "followers" && followers === null) loadFollowers();
    if (view === "following" && following === null) loadFollowing();
    if (view === "stats" && videoStats === null) loadVideoStats();
    if (view === "ratings" && ratings === null) loadRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, uid]);

  async function fetchProfilesByIds(ids: string[]): Promise<MiniUser[]> {
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .in("id", ids);
    const byId = new Map<string, MiniUser>();
    (data ?? []).forEach((p: any) => byId.set(p.id, p as MiniUser));
    return ids.map(id => byId.get(id)).filter(Boolean) as MiniUser[];
  }

  async function loadFollowers() {
    // follows.target_username é TEXT — precisamos do username do dono do perfil
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
    const username = (prof as any)?.username;
    if (!username) { setFollowers([]); return; }
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("target_username", username)
      .limit(200);
    const ids = [...new Set((data ?? []).map((r: any) => r.follower_id).filter(Boolean))];
    setFollowers(await fetchProfilesByIds(ids));
  }

  async function loadFollowing() {
    const { data } = await supabase
      .from("follows")
      .select("target_username")
      .eq("follower_id", uid)
      .limit(200);
    const usernames = [...new Set((data ?? []).map((r: any) => r.target_username).filter(Boolean))];
    if (usernames.length === 0) { setFollowing([]); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .in("username", usernames);
    setFollowing((profs ?? []) as MiniUser[]);
  }

  async function loadVideoStats() {
    const { data } = await supabase
      .from("posts")
      .select("id, text, kind, clip_thumb_url, views_count, likes_count, created_at")
      .eq("author_id", uid)
      .in("kind", ["video", "clip"])
      .order("created_at", { ascending: false })
      .limit(100);
    const list: VideoStat[] = (data ?? []).map((p: any) => ({
      id: p.id,
      text: p.text ?? "(sem título)",
      kind: p.kind,
      thumb: p.clip_thumb_url ?? null,
      views: p.views_count ?? 0,
      likes: p.likes_count ?? 0,
      createdAt: p.created_at,
    }));
    setVideoStats(list);
  }

  async function loadRatings() {
    const { data } = await supabase
      .from("user_ratings")
      .select("stars, rater_user_id, created_at")
      .eq("rated_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as { stars: number; rater_user_id: string }[];
    const ids = rows.map(r => r.rater_user_id).filter(Boolean);
    const profiles = await fetchProfilesByIds(ids);
    const byId = new Map(profiles.map(p => [p.id, p]));
    const list: RatingRow[] = rows.map(r => ({
      stars: r.stars,
      rater: byId.get(r.rater_user_id) ?? null,
    }));
    setRatings(list);
  }

  async function rateUser(stars: number) {
    setSavingRating(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingRating(false); return; }
    await (supabase as any).from("user_ratings").upsert({
      rated_user_id: uid, rater_user_id: session.user.id, stars,
    }, { onConflict: "rated_user_id,rater_user_id" });
    setMyRating(stars);
    setSavingRating(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    onClose();
    navigate({ to: "/" });
  }

  function goToUser(username: string) {
    if (!username) return;
    onClose();
    navigate({ to: "/u/$username", params: { username } });
  }

  const initial = (profile?.full_name?.[0] ?? profile?.username?.[0] ?? "?").toUpperCase();

  const MENU_SECTIONS = [
    {
      title: "Estatísticas",
      items: [
        { icon: BarChart2, label: "Estatísticas do perfil", color: "#5B3FCF", action: () => setView("stats") },
        { icon: UsersIcon, label: `Seguidores${stats ? ` (${stats.followers})` : ""}`, color: "#1FAFA6", action: () => setView("followers") },
        { icon: UsersIcon, label: `A seguir${stats ? ` (${stats.following})` : ""}`, color: "#6BA547", action: () => setView("following") },
        { icon: Star, label: `Rating de utilizadores${stats?.ratingCount ? ` (${stats.ratingCount})` : ""}`, color: "#FFC93C", action: () => setView("ratings") },
      ],
    },
    {
      title: "O teu espaço",
      items: [
        { icon: User, label: "O meu perfil", color: "#5B3FCF", action: () => { onClose(); navigate({ to: "/perfil" }); } },
        { icon: Bell, label: "Notificações", color: "#E94B8A", action: () => {
            onClose();
            navigate({ to: "/home" });
            setTimeout(() => window.dispatchEvent(new CustomEvent("hooda:open-notifications")), 60);
          } },
        { icon: BookOpen, label: "Livros", color: "#E94B8A", action: () => { onClose(); navigate({ to: "/livros" as any }); } },
        { icon: BarChart2, label: "Hooda Studio", color: "#F26B3A", action: () => { onClose(); navigate({ to: "/studio" as any }); } },
      ],
    },
    {
      title: "Definições",
      items: [
        { icon: Settings, label: "Definições da conta", color: "#6b7280", action: () => { onClose(); navigate({ to: "/definicoes" }); } },
        { icon: Shield, label: "Privacidade", color: "#6b7280", action: () => { onClose(); navigate({ to: "/definicoes", search: { panel: "privacy" } as any }); } },
        { icon: Bell, label: "Notificações", color: "#6b7280", action: () => { onClose(); navigate({ to: "/definicoes", search: { panel: "notifications" } as any }); } },
        { icon: MessageCircle, label: "Mensagens", color: "#6b7280", action: () => { onClose(); navigate({ to: "/mensagens" }); } },
      ],
    },
    {
      title: "Ajuda & Info",
      items: [
        { icon: HelpCircle, label: "Ajuda & Suporte", color: "#6b7280", action: () => { onClose(); navigate({ to: "/definicoes", search: { panel: "help" } as any }); } },
        { icon: Info, label: "Sobre a Hooda", color: "#6b7280", action: () => { onClose(); navigate({ to: "/definicoes", search: { panel: "about" } as any }); } },
      ],
    },
  ];

  const filteredSections = MENU_SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase())),
  })).filter(s => !search || s.items.length > 0);

  const subHeader = (title: string) => (
    <div className="shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <button onClick={() => setView("menu")}
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: "var(--surface-2)" }}>
        <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
      </button>
      <span className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{title}</span>
      <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: "var(--surface-2)" }}>
        <X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
      </button>
    </div>
  );

  const emptyState = (label: string, Icon: any) => (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
        style={{ background: "rgba(91,63,207,0.10)" }}>
        <Icon className="h-6 w-6" style={{ color: "#5B3FCF" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );

  const userRow = (u: MiniUser, extra?: React.ReactNode) => (
    <button key={u.id} onClick={() => goToUser(u.username)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left"
      style={{ color: "var(--text-primary)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
      <Avatar user={u} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{u.full_name || u.username}</p>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{u.username}</p>
      </div>
      {extra}
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
    </button>
  );

  function renderSubView() {
    if (view === "followers") {
      return (
        <>
          {subHeader(`Seguidores${followers ? ` (${followers.length})` : ""}`)}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {followers === null
              ? <div className="py-10 flex justify-center"><div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }} /></div>
              : followers.length === 0
                ? emptyState("Sem seguidores ainda", UsersIcon)
                : <div className="space-y-0.5">{followers.map(u => userRow(u))}</div>}
          </div>
        </>
      );
    }
    if (view === "following") {
      return (
        <>
          {subHeader(`A seguir${following ? ` (${following.length})` : ""}`)}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {following === null
              ? <div className="py-10 flex justify-center"><div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }} /></div>
              : following.length === 0
                ? emptyState("Ainda não segues ninguém", UsersIcon)
                : <div className="space-y-0.5">{following.map(u => userRow(u))}</div>}
          </div>
        </>
      );
    }
    if (view === "stats") {
      const totals = (videoStats ?? []).reduce(
        (acc, v) => ({ views: acc.views + v.views, likes: acc.likes + v.likes }),
        { views: 0, likes: 0 }
      );
      return (
        <>
          {subHeader("Estatísticas do perfil")}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* Resumo */}
            {stats && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                  <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Posts</p>
                  <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.posts}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                  <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Views totais</p>
                  <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{totals.views}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                  <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Likes totais</p>
                  <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{totals.likes}</p>
                </div>
              </div>
            )}
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--text-muted)" }}>Vídeos & clips</p>
            {videoStats === null
              ? <div className="py-8 flex justify-center"><div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }} /></div>
              : videoStats.length === 0
                ? emptyState("Ainda não publicaste vídeos", Film)
                : <div className="space-y-1.5">
                    {videoStats.map(v => (
                      <div key={v.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
                        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: "#000" }}>
                          {v.thumb
                            ? <img src={v.thumb} alt="" className="w-full h-full object-cover" />
                            : <Film className="h-5 w-5 text-white/60" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v.text}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                              <Eye className="h-3 w-3" /> {v.views}
                            </span>
                            <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                              <Heart className="h-3 w-3" /> {v.likes}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>}
          </div>
        </>
      );
    }
    if (view === "ratings") {
      return (
        <>
          {subHeader(`Avaliações${ratings ? ` (${ratings.length})` : ""}`)}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {stats && (
              <div className="mb-3 mx-1 p-3 rounded-xl flex items-center gap-3" style={{ background: "var(--surface-2)" }}>
                <div className="text-3xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.rating.toFixed(1)}</div>
                <div className="flex-1">
                  <div className="flex">
                    {[1,2,3,4,5].map(i => (
                      <span key={i} style={{ fontSize: 16, opacity: i <= Math.round(stats.rating) ? 1 : 0.25 }}>⭐</span>
                    ))}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{stats.ratingCount} avaliações</p>
                </div>
              </div>
            )}
            {ratings === null
              ? <div className="py-8 flex justify-center"><div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }} /></div>
              : ratings.length === 0
                ? emptyState("Ainda sem avaliações", Star)
                : <div className="space-y-0.5">
                    {ratings.map((r, idx) => r.rater
                      ? userRow(r.rater, (
                          <span className="text-xs font-bold flex items-center gap-0.5" style={{ color: "#FFC93C" }}>
                            {r.stars} <Star className="h-3 w-3 fill-current" />
                          </span>
                        ))
                      : (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="w-10 h-10 rounded-full" style={{ background: "var(--surface-2)" }} />
                          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Anónimo · {r.stars}⭐</p>
                        </div>
                      )
                    )}
                  </div>}
          </div>
        </>
      );
    }
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-end"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className="relative flex flex-col h-full w-full sm:w-[380px] overflow-hidden"
        style={{
          background: "var(--surface-0)",
          borderLeft: "1px solid var(--border-subtle)",
          animation: "slideInRight 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}>

        {view !== "menu" ? renderSubView() : (
          <>
            {/* Header com perfil */}
            <div className="shrink-0 px-4 pt-5 pb-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-start justify-between mb-4">
                <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Menu</span>
                <button onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition hover:opacity-80"
                  style={{ background: "var(--surface-2)" }}>
                  <X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                </button>
              </div>

              {/* Card de perfil */}
              {!loading && profile ? (
                <button onClick={() => { onClose(); navigate({ to: "/perfil" }); }}
                  className="w-full flex items-center gap-3 rounded-2xl p-3 transition text-left"
                  style={{ background: "var(--surface-1)" }}>
                  <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-xl"
                    style={{ background: profile.avatar_url ? "transparent" : "#5B3FCF" }}>
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate" style={{ color: "var(--text-primary)" }}>{profile.full_name}</p>
                    <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>@{profile.username}</p>
                    {stats && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          <b style={{ color: "var(--text-primary)" }}>{stats.followers}</b> seguidores
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          <b style={{ color: "var(--text-primary)" }}>{stats.posts}</b> posts
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                </button>
              ) : loading ? (
                <div className="w-full h-[76px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
              ) : null}

              {/* Rating */}
              {stats && !loading && (
                <div className="mt-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(i => (
                      <button key={i} onClick={() => rateUser(i)} disabled={savingRating}
                        className="transition-transform hover:scale-125 active:scale-95"
                        style={{ fontSize: 20, opacity: i <= (myRating || stats.rating) ? 1 : 0.25 }}>
                        ⭐
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setView("ratings")} className="text-xs font-semibold underline" style={{ color: "var(--text-muted)" }}>
                    {stats.rating.toFixed(1)} ({stats.ratingCount})
                  </button>
                </div>
              )}
            </div>

            {/* Pesquisa */}
            <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 rounded-xl px-3 h-10"
                style={{ background: "var(--surface-2)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar no menu"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-primary)" }} />
              </div>
            </div>

            {/* Secções */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredSections.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="text-xs font-bold px-2 mb-1.5 uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}>{section.title}</p>
                  <div className="space-y-0.5">
                    {section.items.map(({ icon: Icon, label, color, action }) => (
                      <button key={label} onClick={action}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: color + "18" }}>
                          <Icon className="h-5 w-5" style={{ color }} strokeWidth={1.8} />
                        </div>
                        <span className="text-sm font-medium">{label}</span>
                        <ChevronRight className="h-4 w-4 ml-auto shrink-0" style={{ color: "var(--text-muted)" }} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-3 py-3 space-y-0.5"
              style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button onClick={toggle}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(91,63,207,0.12)" }}>
                  {theme === "dark"
                    ? <Sun className="h-5 w-5" style={{ color: "#FFC93C" }} strokeWidth={1.8} />
                    : <Moon className="h-5 w-5" style={{ color: "#5B3FCF" }} strokeWidth={1.8} />}
                </div>
                <span className="text-sm font-medium">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
              </button>
              <button onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left"
                style={{ color: "#EF4444" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(239,68,68,0.10)" }}>
                  <LogOut className="h-5 w-5" style={{ color: "#EF4444" }} strokeWidth={1.8} />
                </div>
                <span className="text-sm font-medium font-semibold">Sair da conta</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
