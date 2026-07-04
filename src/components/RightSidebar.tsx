import React, { useEffect, useState } from "react";
import { RefreshCw, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

const ACCENT = "#5B3FCF";

function colorFor(s: string) {
  const colors = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547"];
  return colors[(s?.charCodeAt(0) ?? 0) % colors.length];
}

export function RightSidebar() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<{ id: string; username: string; full_name: string; avatar_url?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: follows } = await supabase.from("follows")
      .select("following_id").eq("follower_id", session.user.id);
    const followingIds = (follows ?? []).map((f: any) => f.following_id);
    const excludeIds = [session.user.id, ...followingIds];
    const { data } = await supabase.from("profiles")
      .select("id, username, full_name, avatar_url")
      .not("id", "in", `(${excludeIds.join(",")})`)
      .limit(5);
    setSuggestions(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function follow(userId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("follows").insert({ follower_id: session.user.id, following_id: userId });
    setSuggestions(p => p.filter(u => u.id !== userId));
  }

  return (
    <aside className="hidden xl:flex flex-col sticky top-0 h-screen flex-1 min-w-[320px] border-l z-40 px-6 py-4 overflow-y-auto"
      style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
      <div className="w-full max-w-[360px] space-y-4">

      {/* Pesquisa */}
      <button onClick={() => navigate({ to: "/explorar" })}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-full text-left transition"
        style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Pesquisar…</span>
      </button>

      {/* Sugestões de pessoas a seguir */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: ACCENT }} />
            <p className="font-extrabold text-sm" style={{ color: "var(--text-primary)" }}>Sugestões para ti</p>
          </div>
          <button onClick={load} className="p-1 rounded-full hover:bg-[var(--s2)] transition">
            <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {loading ? (
          <div className="px-4 pb-4 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-9 w-9 rounded-full shrink-0" style={{ background: "var(--s2)" }} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded-full w-24" style={{ background: "var(--s2)" }} />
                  <div className="h-2.5 rounded-full w-16" style={{ background: "var(--s2)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="px-4 pb-4 text-sm" style={{ color: "var(--text-muted)" }}>Sem sugestões de momento.</p>
        ) : (
          <>
            {suggestions.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <button onClick={() => navigate({ to: "/u/$username", params: { username: u.username } })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="h-9 w-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: u.avatar_url ? "transparent" : colorFor(u.username) }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (u.username?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{u.full_name || u.username}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{u.username}</p>
                  </div>
                </button>
                <button onClick={() => follow(u.id)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-white transition active:scale-90"
                  style={{ background: ACCENT }}>
                  Seguir
                </button>
              </div>
            ))}
            <button onClick={load} className="w-full text-left px-4 py-3 text-sm font-semibold border-t"
              style={{ color: ACCENT, borderColor: "var(--border-subtle)" }}>
              Ver mais sugestões
            </button>
          </>
        )}
      </div>

      <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>© 2025 Hooda</p>
      </div>
    </aside>
  );
}
