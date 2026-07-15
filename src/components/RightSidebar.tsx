import React from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

// Mock visual apenas — sem tabela "rooms"/"communities" no Supabase ainda
const ACTIVE_ROOMS = [
  { label: "Futebol · Geral", online: 12 },
  { label: "Gamers · Trocas", online: 5 },
] as const;
const TRENDING_COMMUNITIES = [
  { name: "Música Kizomba" },
  { name: "Bairro Talatona" },
] as const;

export function RightSidebar() {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 py-3 space-y-4 max-h-screen overflow-y-auto">

      {/* Pesquisa sticky */}
      <div className="pb-1">
        <button onClick={() => navigate({ to: "/explorar" })}
          className="w-full flex items-center gap-3 h-11 pl-11 pr-4 rounded-full text-left transition relative hover:border-[#2F6FED]"
          style={{ background: "var(--s1)", border: "1px solid transparent" }}>
          <Search className="h-4 w-4 absolute left-4" style={{ color: "var(--text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Pesquisar no Snapper</span>
        </button>
      </div>

      {/* Salas ativas agora */}
      <div className="rounded-2xl border p-3" style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}>
        <p className="text-[11px] font-bold uppercase tracking-wider px-1 pb-2" style={{ color: "var(--text-muted)" }}>Salas ativas agora</p>
        <div className="space-y-1.5">
          {ACTIVE_ROOMS.map((r) => (
            <div key={r.label} className="flex items-center gap-2 px-2 py-2 rounded-xl" style={{ background: "var(--s2)" }}>
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#22C55E" }} />
              <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.label} · {r.online} online</span>
            </div>
          ))}
        </div>
      </div>

      {/* Comunidades em alta */}
      <div className="rounded-2xl border p-3" style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}>
        <p className="text-[11px] font-bold uppercase tracking-wider px-1 pb-2" style={{ color: "var(--text-muted)" }}>Comunidades em alta</p>
        <div className="space-y-2">
          {TRENDING_COMMUNITIES.map((c) => (
            <div key={c.name} className="flex items-center gap-2.5 px-1">
              <span className="h-7 w-7 rounded-lg shrink-0" style={{ background: "#2F6FED" }} />
              <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
