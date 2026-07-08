import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { useScrollLock } from "@/hooks/useScrollLock";
import { STATIC_QUERY_OPTIONS } from "@/lib/queryClient";
import { t } from "@/lib/useT";

const ACCENT = "#5B3FCF";

export type FollowListUser = { id: string; username: string; fullName: string; avatarUrl: string | null; color: string };
export type FollowMode = "followers" | "following";

/* ── Hook partilhado: busca a lista de seguidores ou de quem se segue ── */
export function useFollowListQuery(mode: FollowMode, targetUsername: string, targetUserId: string) {
  return useQuery({
    queryKey: ["followList", mode, mode === "followers" ? targetUsername : targetUserId],
    queryFn: async (): Promise<FollowListUser[]> => {
      if (mode === "followers") {
        const { data: rows, error } = await supabase.from("follows")
          .select("follower_id").eq("target_username", targetUsername);
        if (error) throw error;
        const ids = [...new Set((rows ?? []).map((r: any) => r.follower_id))];
        if (ids.length === 0) return [];
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id,username,full_name,avatar_url").in("id", ids);
        if (profErr) throw profErr;
        return (profs ?? []).map((p: any) => ({
          id: p.id, username: p.username ?? "?", fullName: p.full_name ?? p.username ?? "?",
          avatarUrl: p.avatar_url ?? null, color: ACCENT,
        }));
      } else {
        const { data: rows, error } = await supabase.from("follows")
          .select("target_username").eq("follower_id", targetUserId);
        if (error) throw error;
        const usernames = [...new Set((rows ?? []).map((r: any) => r.target_username).filter(Boolean))];
        if (usernames.length === 0) return [];
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id,username,full_name,avatar_url").in("username", usernames);
        if (profErr) throw profErr;
        return (profs ?? []).map((p: any) => ({
          id: p.id, username: p.username ?? "?", fullName: p.full_name ?? p.username ?? "?",
          avatarUrl: p.avatar_url ?? null, color: ACCENT,
        }));
      }
    },
    enabled: mode === "followers" ? !!targetUsername : !!targetUserId,
    ...STATIC_QUERY_OPTIONS,
  });
}

/* ── Linhas da lista (usadas tanto no modal como na secção inline) ── */
export function FollowListRows({ users, loading, error, emptyMessage }: {
  users: FollowListUser[]; loading: boolean; error: string; emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-500 text-center py-10 px-5">{error}</p>;
  if (users.length === 0) return <p className="text-sm text-[var(--text-muted)] text-center py-10">{emptyMessage}</p>;

  return (
    <div className="divide-y divide-neutral-50">
      {users.map(u => (
        <div key={u.id} className="flex items-center gap-3 px-5 py-3">
          <ProfileAvatarLink userId={u.id} username={u.username}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0"
              style={{ background: u.color }}>
              {u.avatarUrl
                ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : (u.username?.[0] ?? "?").toUpperCase()}
            </div>
          </ProfileAvatarLink>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-black truncate">{u.fullName}</p>
            <p className="text-xs text-[var(--text-muted)]">@{u.username}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Modal (usado no perfil público) ── */
export function FollowListModal({ mode, targetUsername, targetUserId, onClose }: {
  mode: FollowMode;
  targetUsername: string;
  targetUserId: string;
  onClose: () => void;
}) {
  useScrollLock();
  const { data: users = [], isLoading: loading, error: queryError } = useFollowListQuery(mode, targetUsername, targetUserId);
  const err = queryError ? (queryError instanceof Error ? queryError.message : "Erro ao carregar lista") : "";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-sm rounded-2xl hooda-modal-sheet overflow-hidden flex flex-col" style={{ maxHeight: "75vh" }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] shrink-0">
          <p className="font-extrabold text-base text-black">{mode === "followers" ? t("profile.followers") : t("profile.following")}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)]">
            <X className="h-5 w-5 text-[var(--text-muted)]" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <FollowListRows users={users} loading={loading} error={err}
            emptyMessage={mode === "followers" ? "Ainda sem seguidores" : "Ainda não segue ninguém"} />
        </div>
      </div>
    </div>
  );
}

/* ── Secção inline (sem modal/popup) — usada no Studio ── */
export function FollowListSection({ mode, targetUsername, targetUserId, title, count }: {
  mode: FollowMode;
  targetUsername: string;
  targetUserId: string;
  title: string;
  count?: number;
}) {
  const { data: users = [], isLoading: loading, error: queryError } = useFollowListQuery(mode, targetUsername, targetUserId);
  const err = queryError ? (queryError instanceof Error ? queryError.message : "Erro ao carregar lista") : "";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <p className="font-extrabold text-sm" style={{ color: "var(--text-primary)" }}>{title}</p>
        {typeof count === "number" && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#5B3FCF15", color: ACCENT }}>
            {count.toLocaleString("pt-PT")}
          </span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <FollowListRows users={users} loading={loading} error={err}
          emptyMessage={mode === "followers" ? "Ainda sem seguidores" : "Ainda não segue ninguém"} />
      </div>
    </div>
  );
}
