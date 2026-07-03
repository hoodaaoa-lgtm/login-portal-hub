import React, { useEffect, useState } from "react";
import { Search, RefreshCw, TrendingUp, Users, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

const ACCENT = "#5B3FCF";

function colorFor(s: string) {
  const colors = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547"];
  return colors[(s?.charCodeAt(0) ?? 0) % colors.length];
}

export function RightSidebar() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; username: string; full_name: string; avatar_url?: string }[]>([]);
  const [trending, setTrending] = useState([
    { tag: "#CriadoresHooda", count: "12.4K publicações" },
    { tag: "#HoodaDrops",     count: "8.7K publicações" },
    { tag: "#CriarParaInspirar", count: "5.2K publicações" },
    { tag: "#HoodaTV",        count: "3.9K publicações" },
    { tag: "#ComunidadeHooda", count: "2.1K publicações" },
  ]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      // Buscar utilizadores que o user atual não segue
      const { data: follows } = await supabase.from("follows")
        .select("following_id").eq("follower_id", session.user.id);
      const followingIds = (follows ?? []).map((f: any) => f.following_id);
      const excludeIds = [session.user.id, ...followingIds];
      const { data } = await supabase.from("profiles")
        .select("id, username, full_name, avatar_url")
        .not("id", "in", `(${excludeIds.join(",")})`)
        .limit(4);
      setSuggestions(data ?? []);
    })();
  }, []);

  async function follow(userId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("follows").insert({ follower_id: session.user.id, following_id: userId });
    setSuggestions(p => p.filter(u => u.id !== userId));
  }

  return (
    <aside
      className="hidden xl:flex flex-col w-[300px] 2xl:w-[340px] shrink-0 h-screen sticky top-0 overflow-y-auto border-l px-4 py-4 space-y-5"
      style={{ background: "var(--s0)", borderColor: "var(--border-subtle)", scrollbarWidth: "none" }}
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Pesquisar na Hooda"
          className="w-full h-10 pl-9 pr-4 rounded-full text-sm outline-none"
          style={{ background: "var(--s2)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Em alta */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)" }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: ACCENT }} />
            <p className="font-extrabold text-sm" style={{ color: "var(--text-primary)" }}>Em alta 🔥</p>
          </div>
        </div>
        {trending.map((t, i) => (
          <button key={t.tag} className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--s2)]">
            <span className="text-xs font-bold mt-0.5" style={{ color: "var(--text-muted)", minWidth: 16 }}>{i + 1}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t.tag}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t.count}</p>
            </div>
          </button>
        ))}
        <button className="w-full text-left px-4 py-3 text-sm font-semibold border-t" style={{ color: ACCENT, borderColor: "var(--border-subtle)" }}>
          Ver mais
        </button>
      </div>

      {/* Sugestões */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)" }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: ACCENT }} />
              <p className="font-extrabold text-sm" style={{ color: "var(--text-primary)" }}>Sugestões para ti</p>
            </div>
            <button className="p-1 rounded-full hover:bg-[var(--s2)] transition">
              <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
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
          <button className="w-full text-left px-4 py-3 text-sm font-semibold border-t" style={{ color: ACCENT, borderColor: "var(--border-subtle)" }}>
            Ver mais
          </button>
        </div>
      )}

      {/* Eventos ao vivo */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s1)" }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4" style={{ color: "#E94B8A" }} />
            <p className="font-extrabold text-sm" style={{ color: "var(--text-primary)" }}>Eventos ao vivo</p>
          </div>
          <button className="text-xs font-semibold" style={{ color: ACCENT }}>Ver todos</button>
        </div>
        {[
          { label: "HoodaTalks", title: "O futuro da criação de conteúdo", viewers: "1.2K a assistir" },
          { label: "Game Night",  title: "Torneio de comunidade",           viewers: "850 a assistir"  },
          { label: "Música & Vibes", title: "Sessão de beats",             viewers: "420 a assistir"  },
        ].map(ev => (
          <button key={ev.title} className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--s2)]">
            <div className="h-12 w-16 rounded-xl shrink-0 flex items-center justify-center text-white text-xs font-bold"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, #E94B8A)` }}>
              AO VIVO
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold" style={{ color: ACCENT }}>{ev.label} · <span style={{ color: "#E94B8A" }}>AO VIVO</span></p>
              <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{ev.title}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>👥 {ev.viewers}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Creator Pro banner */}
      <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg, #5B3FCF 0%, #E94B8A 100%)" }}>
        <p className="text-2xl mb-1">⭐</p>
        <p className="text-sm font-extrabold text-white mb-1">Queres mais alcance?</p>
        <p className="text-xs text-white/80 mb-3">Torna-te um Creator Pro e desbloqueia ferramentas exclusivas.</p>
        <button className="w-full py-2 rounded-xl text-sm font-bold bg-white" style={{ color: ACCENT }}>
          Saber mais
        </button>
      </div>

      {/* Footer */}
      <p className="text-[11px] text-center pb-4" style={{ color: "var(--text-muted)" }}>
        Privacidade · Termos · Ajuda · © 2025 Hooda
      </p>
    </aside>
  );
}
