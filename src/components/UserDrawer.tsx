import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, Star, Users, BookOpen, Tv, Settings, LogOut, ChevronRight, MessageCircle, Bell, Shield, HelpCircle, Info, BarChart2, User, Moon, Sun } from "lucide-react";
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

export function UserDrawer({ userId: _userId, onClose }: UserDrawerProps) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(_userId);
  const [myRating, setMyRating] = useState(0);
  const [savingRating, setSavingRating] = useState(false);
  useScrollLock();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const resolvedUid = _userId || session.user.id;
      setUid(resolvedUid);

      const [profRes, followersRes, followingRes, postsRes, ratingsRes, myRatingRes] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,avatar_url,bio").eq("id", resolvedUid).maybeSingle(),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", resolvedUid),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", resolvedUid),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", resolvedUid),
        supabase.from("user_ratings").select("stars").eq("rated_user_id", resolvedUid),
        supabase.from("user_ratings").select("stars").eq("rated_user_id", resolvedUid).eq("rater_user_id", session.user.id).maybeSingle(),
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      const allRatings = (ratingsRes.data ?? []) as { stars: number }[];
      const avg = allRatings.length > 0
        ? allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length : 0;
      setStats({
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
        posts: postsRes.count ?? 0,
        rating: avg,
        ratingCount: allRatings.length,
      });
      if ((myRatingRes.data as any)?.stars) setMyRating((myRatingRes.data as any).stars);
      setLoading(false);
    })();
  }, [_userId]);

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

  const initial = (profile?.full_name?.[0] ?? profile?.username?.[0] ?? "?").toUpperCase();

  const MENU_SECTIONS = [
    {
      title: "O teu espaço",
      items: [
        { icon: User, label: "O meu perfil", color: "#5B3FCF", action: () => { onClose(); navigate({ to: "/perfil" }); } },
        { icon: BookOpen, label: "Livros", color: "#E94B8A", action: () => { onClose(); navigate({ to: "/livros" }); } },
        { icon: Tv, label: "HoodaTV", color: "#1FAFA6", action: () => { onClose(); navigate({ to: "/hoodatv" }); } },
        { icon: BarChart2, label: "Hooda Studio", color: "#F26B3A", action: () => { onClose(); navigate({ to: "/studio" }); } },
      ],
    },
    {
      title: "Definições",
      items: [
        { icon: Settings, label: "Definições da conta", color: "#6b7280", action: () => { onClose(); navigate({ to: "/perfil" }); } },
        { icon: Shield, label: "Privacidade", color: "#6b7280", action: () => { onClose(); navigate({ to: "/perfil" }); } },
        { icon: Bell, label: "Notificações", color: "#6b7280", action: () => { onClose(); navigate({ to: "/perfil" }); } },
        { icon: MessageCircle, label: "Mensagens", color: "#6b7280", action: () => { onClose(); navigate({ to: "/mensagens" }); } },
      ],
    },
    {
      title: "Ajuda & Info",
      items: [
        { icon: HelpCircle, label: "Ajuda & Suporte", color: "#6b7280", action: () => {} },
        { icon: Info, label: "Sobre a hooda", color: "#6b7280", action: () => {} },
      ],
    },
  ];

  const filteredSections = MENU_SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase())),
  })).filter(s => !search || s.items.length > 0);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-end"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      {/* Modal panel — estilo Facebook, lado direito no desktop, full no mobile */}
      <div className="relative flex flex-col h-full w-full sm:w-[380px] overflow-hidden"
        style={{
          background: "var(--surface-0)",
          borderLeft: "1px solid var(--border-subtle)",
          animation: "slideInRight 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}>

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
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                {stats.rating.toFixed(1)} ({stats.ratingCount})
              </span>
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
          {/* Toggle dark mode */}
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
          {/* Logout */}
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
      </div>
    </div>,
    document.body
  );
}
