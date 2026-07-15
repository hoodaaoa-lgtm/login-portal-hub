import React from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { SnapperTipCard } from "@/components/SnapperTipCard";

export function RightSidebar() {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 py-3 space-y-4 max-h-screen overflow-y-auto">

      {/* Pesquisa sticky */}
      <div className="pb-1">
        <button onClick={() => navigate({ to: "/explorar" })}
          className="w-full flex items-center gap-3 h-11 pl-11 pr-4 rounded-full text-left transition relative hover:border-[#9231EA]"
          style={{ background: "var(--s1)", border: "1px solid transparent" }}>
          <Search className="h-4 w-4 absolute left-4" style={{ color: "var(--text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Pesquisar no Snapper</span>
        </button>
      </div>

      <SnapperTipCard variant="sidebar" />

      <div className="flex items-center justify-center flex-wrap gap-x-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <a href="/uso" target="_blank" rel="noopener noreferrer" className="hover:underline">Termos</a>
        <span>·</span>
        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="hover:underline">Privacidade</a>
        <span>·</span>
        <a href="/acessibilidade" target="_blank" rel="noopener noreferrer" className="hover:underline">Acessibilidade</a>
      </div>
      <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>© 2026 Snapper</p>
    </div>
  );
}
