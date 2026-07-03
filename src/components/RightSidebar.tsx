import React, { useEffect, useState } from "react";
import { RefreshCw, Users, TrendingUp, Radio, Zap, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

const ACCENT = "#5B3FCF";
const PINK = "#E94B8A";

function colorFor(s: string) {
  const colors = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547"];
  return colors[(s?.charCodeAt(0) ?? 0) % colors.length];
}

const TRENDS = [
  { tag: "CriadoresHooda", posts: "12.4k publicações" },
  { tag: "HoodaDrops",     posts: "8.1k publicações"  },
  { tag: "MúsicaAngola",   posts: "5.7k publicações"  },
  { tag: "TalentoAO",      posts: "4.2k publicações"  },
  { tag: "HoodaStudio",    posts: "3.9k publicações"  },
];

const LIVE_EVENTS = [
  { name: "Dj Mauro Live Set",   viewers: "1.2k", color: PINK    },
  { name: "Sessão Q&A — Tech AO", viewers: "834",  color: ACCENT  },
];

export function RightSidebar() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<{ id: string; username: string; full_name: string; avatar_url?: string }[]>([]);
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
    <aside className="hidden xl:flex flex-col h-screen sticky top-0 overflow-y-auto pt-4 pb-6 gap-3" style={{ scrollbarWidth: "none" }}>

      {/* Tendências */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <TrendingUp className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <p className="font-extrabold text-xs tracking-wide uppercase" style={{ color: "var(--text-primary)" }}>Em Destaque</p>
        </div>
        {TRENDS.map((tr, i) => (
          <button key={i} onClick={() => navigate({ to: "/explorar", search: { q: tr.tag } })}
            className="w-full flex items-start gap-2 px-4 py-2 hover:bg-[var(--s2)] transition text-left">
            <Hash className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: ACCENT, opacity: 0.6 }} />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{tr.tag}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tr.posts}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Ao Vivo */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <Radio className="h-3.5 w-3.5" style={{ color: PINK }} />
          <p className="font-extrabold text-xs tracking-wide uppercase" style={{ color: "var(--text-primary)" }}>Ao Vivo Agora</p>
        </div>
        {LIVE_EVENTS.map((ev, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: ev.color + "22" }}>
              <Radio className="h-4 w-4" style={{ color: ev.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{ev.name}</p>
              <div className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: PINK }} />
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ev.viewers} a ver</span>
              </div>
            </div>
            <button className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: PINK }}>Ver</button>
          </div>
        ))}
      </div>

      {/* Sugestões */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" style={{ color: ACCENT }} />
            <p className="font-extrabold text-xs tracking-wide uppercase" style={{ color: "var(--text-primary)" }}>Sugestões para ti</p>
          </div>
          <button onClick={load} className="p-1 rounded-full hover:bg-[var(--s2)] transition">
            <RefreshCw className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {loading ? (
          <div className="px-4 pb-3 space-y-2.5">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="h-8 w-8 rounded-full shrink-0" style={{ background: "var(--s2)" }} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 rounded-full w-20" style={{ background: "var(--s2)" }} />
                  <div className="h-2 rounded-full w-14" style={{ background: "var(--s2)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="px-4 pb-3 text-xs" style={{ color: "var(--text-muted)" }}>Sem sugestões de momento.</p>
        ) : (
          <>
            {suggestions.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 px-4 py-2">
                <button onClick={() => navigate({ to: "/u/$username", params: { username: u.username } })}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <div className="h-8 w-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: u.avatar_url ? "transparent" : colorFor(u.username) }}>
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.username?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{u.full_name || u.username}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>@{u.username}</p>
                  </div>
                </button>
                <button onClick={() => follow(u.id)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition active:scale-90"
                  style={{ background: ACCENT }}>
                  Seguir
                </button>
              </div>
            ))}
            <button onClick={load} className="w-full text-left px-4 py-2.5 text-xs font-semibold border-t"
              style={{ color: ACCENT, borderColor: "var(--border-subtle)" }}>
              Ver mais sugestões
            </button>
          </>
        )}
      </div>

      {/* Creator Pro */}
      <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#E94B8A 100%)" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <Zap className="h-4 w-4 text-white" />
          <p className="text-sm font-extrabold text-white">Creator Pro</p>
        </div>
        <p className="text-xs text-white/80 mb-3">Ferramentas avançadas para criadores. Analytics, monetização e muito mais.</p>
        <button className="w-full py-1.5 rounded-xl text-xs font-bold text-[#5B3FCF] bg-white transition hover:opacity-90 active:scale-95">
          Explorar planos
        </button>
      </div>

      <p className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>© 2025 Hooda · Privacidade · Termos</p>
    </aside>
  );
}
