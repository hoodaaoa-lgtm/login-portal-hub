import React, { useState, useEffect } from "react";
import { X, Star, Users, Eye, Heart, MessageSquare, Settings, LogOut, MoreVertical, Flag, UserX, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type Tab = "profile" | "followers" | "following" | "settings";

interface UserDrawerProps {
  userId: string;
  onClose: () => void;
}

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  is_private: boolean;
}

interface UserStats {
  followers: number;
  following: number;
  posts: number;
  views: number;
  rating: number;
  ratingCount: number;
}

export function UserDrawer({ userId: _userId, onClose }: UserDrawerProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [resolvedUserId, setResolvedUserId] = useState(_userId);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUserId(session.user.id);
        // Se userId não foi passado, usa o do utilizador autenticado
        const uid = _userId || session.user.id;
        setResolvedUserId(uid);

        // Carregar perfil
        const { data: prof } = await supabase
          .from("profiles").select("*").eq("id", uid).maybeSingle();
        if (prof) setProfile(prof as UserProfile);

        // Carregar estatísticas
        const { data: followers } = await supabase
          .from("follows").select("id").eq("following_id", uid);
        const { data: following } = await supabase
          .from("follows").select("id").eq("follower_id", uid);
        const { data: posts } = await supabase
          .from("posts").select("id").eq("author_id", uid);
        const { data: ratings } = await supabase
          .from("user_ratings").select("stars").eq("rated_user_id", uid);

      const avgRating = ratings && ratings.length > 0
        ? (ratings.reduce((sum: number, r: any) => sum + r.stars, 0) / ratings.length).toFixed(1)
        : 0;

      setStats({
        followers: followers?.length ?? 0,
        following: following?.length ?? 0,
        posts: posts?.length ?? 0,
        views: 0, // TODO: calcular de post_views
        rating: parseFloat(avgRating as string),
        ratingCount: ratings?.length ?? 0,
      });

      setLoading(false);
      }
    })();
  }, [_userId]);

  const isOwnProfile = currentUserId === resolvedUserId;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-80 bg-white dark:bg-[#111118] flex flex-col overflow-hidden"
        style={{ maxHeight: "100dvh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h2 className="font-bold text-lg">Perfil</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <button onClick={() => setTab("profile")}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              tab === "profile"
                ? "border-b-2 border-[#5B3FCF] text-[#5B3FCF]"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
            }`}>
            Perfil
          </button>
          <button onClick={() => setTab("followers")}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              tab === "followers"
                ? "border-b-2 border-[#5B3FCF] text-[#5B3FCF]"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
            }`}>
            👥
          </button>
          <button onClick={() => setTab("following")}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              tab === "following"
                ? "border-b-2 border-[#5B3FCF] text-[#5B3FCF]"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
            }`}>
            ➜
          </button>
          {isOwnProfile && (
            <button onClick={() => setTab("settings")}
              className={`flex-1 py-2 text-sm font-semibold transition ${
                tab === "settings"
                  ? "border-b-2 border-[#5B3FCF] text-[#5B3FCF]"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
              }`}>
              ⚙️
            </button>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {tab === "profile" && (
            <ProfileTab profile={profile} stats={stats} loading={loading} isOwn={isOwnProfile} />
          )}
          {tab === "followers" && (
            <FollowersTab userId={resolvedUserId} />
          )}
          {tab === "following" && (
            <FollowingTab userId={resolvedUserId} />
          )}
          {tab === "settings" && isOwnProfile && (
            <SettingsTab onLogout={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Perfil ─── */
function ProfileTab({ profile, stats, loading, isOwn }: any) {
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  if (loading || !profile || !stats) {
    return <div className="p-4 text-center text-sm text-neutral-500">A carregar...</div>;
  }

  async function rateUser(stars: number) {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    await supabase.from("user_ratings").upsert({
      rated_user_id: profile.id,
      rater_user_id: session.user.id,
      stars,
    }, { onConflict: "rated_user_id,rater_user_id" });

    setRating(stars);
    setSaving(false);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Avatar + Info */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden flex items-center justify-center text-white font-bold text-2xl"
          style={{ background: profile.avatar_url ? "transparent" : "#5B3FCF" }}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
            : (profile.full_name?.[0] ?? "?").toUpperCase()}
        </div>
        <p className="font-bold text-lg">{profile.full_name}</p>
        <p className="text-sm text-neutral-500">@{profile.username}</p>
      </div>

      {/* Rating */}
      <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 text-center">
        <div className="flex items-center justify-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map(i => (
            <button key={i} onClick={() => !isOwn && rateUser(i)} disabled={isOwn || saving}
              className="text-xl transition hover:scale-125 disabled:opacity-50"
              style={{ opacity: i <= stats.rating ? 1 : 0.3 }}>
              ⭐
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold">{stats.rating.toFixed(1)} ({stats.ratingCount} avaliações)</p>
      </div>

      {/* Bio */}
      {profile.bio && <p className="text-sm">{profile.bio}</p>}
      {profile.location && <p className="text-xs text-neutral-500">📍 {profile.location}</p>}
      {profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer"
        className="text-xs font-semibold text-[#5B3FCF] hover:underline">🔗 {profile.website}</a>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2">
          <p className="text-lg font-bold">{stats.followers}</p>
          <p className="text-[10px] text-neutral-500">Seguidores</p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2">
          <p className="text-lg font-bold">{stats.following}</p>
          <p className="text-[10px] text-neutral-500">Seguindo</p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2">
          <p className="text-lg font-bold">{stats.posts}</p>
          <p className="text-[10px] text-neutral-500">Posts</p>
        </div>
      </div>

      {/* Ações */}
      {!isOwn && (
        <div className="flex gap-2">
          <button className="flex-1 h-9 rounded-lg font-semibold text-sm bg-[#5B3FCF] text-white hover:opacity-90 transition">
            Seguir
          </button>
          <button className="flex-1 h-9 rounded-lg font-semibold text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition">
            Mensagem
          </button>
          <button className="h-9 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Seguidores ─── */
function FollowersTab({ userId }: any) {
  const [followers, setFollowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("follows").select("follower_id, profiles!inner(*)")
        .eq("following_id", resolvedUserId)
        .limit(20);
      setFollowers(data as any);
      setLoading(false);
    })();
  }, [resolvedUserId]);

  if (loading) return <div className="p-4 text-center text-sm text-neutral-500">A carregar...</div>;
  if (followers.length === 0) return <div className="p-4 text-center text-sm text-neutral-500">Sem seguidores</div>;

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {followers.map((f: any) => (
        <div key={f.follower_id} className="p-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900">
          <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-bold"
              style={{ background: f.profiles?.avatar_url ? "transparent" : "#5B3FCF" }}>
              {f.profiles?.avatar_url
                ? <img src={f.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                : (f.profiles?.full_name?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{f.profiles?.full_name}</p>
              <p className="text-xs text-neutral-500 truncate">@{f.profiles?.username}</p>
            </div>
          </div>
          <button className="text-xs font-semibold px-3 py-1 rounded-full bg-[#5B3FCF] text-white hover:opacity-90 transition shrink-0">
            Seguir
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: Seguindo ─── */
function FollowingTab({ userId }: any) {
  const [following, setFollowing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("follows").select("following_id, profiles!inner(*)")
        .eq("follower_id", resolvedUserId)
        .limit(20);
      setFollowing(data as any);
      setLoading(false);
    })();
  }, [resolvedUserId]);

  if (loading) return <div className="p-4 text-center text-sm text-neutral-500">A carregar...</div>;
  if (following.length === 0) return <div className="p-4 text-center text-sm text-neutral-500">Não segue ninguém</div>;

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {following.map((f: any) => (
        <div key={f.following_id} className="p-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900">
          <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-bold"
              style={{ background: f.profiles?.avatar_url ? "transparent" : "#5B3FCF" }}>
              {f.profiles?.avatar_url
                ? <img src={f.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                : (f.profiles?.full_name?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{f.profiles?.full_name}</p>
              <p className="text-xs text-neutral-500 truncate">@{f.profiles?.username}</p>
            </div>
          </div>
          <button className="text-xs font-semibold px-3 py-1 rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shrink-0">
            Deixar
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: Definições ─── */
function SettingsTab({ onLogout }: any) {
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
    onLogout();
  }

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition text-left">
        <Settings className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        <span className="font-semibold text-sm">Definições de Conta</span>
      </button>
      <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition text-left">
        <MessageSquare className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        <span className="font-semibold text-sm">Privacidade & Mensagens</span>
      </button>
      <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition text-left">
        <Eye className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        <span className="font-semibold text-sm">Notificações</span>
      </button>
      <button onClick={logout} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-left text-red-600">
        <LogOut className="h-5 w-5" />
        <span className="font-semibold text-sm">Logout</span>
      </button>
    </div>
  );
}
