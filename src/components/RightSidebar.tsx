import React, { useState } from "react";
import { Search, Bell } from "lucide-react";

export function RightSidebar() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <aside className="hidden xl:flex flex-col w-72 pl-4 pr-4 h-screen sticky top-0 overflow-y-auto"
      style={{ background: "var(--surface-0)" }}>
      
      {/* Search Bar + Notifications - em cima */}
      <div className="pt-4 pb-4 sticky top-0 z-20 space-y-3" style={{ background: "var(--surface-0)" }}>
        {/* Notifications Bell */}
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-[var(--s2)] rounded-full transition"
            style={{ color: "var(--text-secondary)" }}>
            <Bell className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" 
            style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full h-10 pl-9 pr-4 rounded-full text-sm outline-none"
            style={{
              background: "var(--s2)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      </div>

      {/* Espaço vazio para conteúdo futuro */}
      <div className="flex-1 flex items-center justify-center text-center py-12">
        <p style={{ color: "var(--text-muted)" }} className="text-sm">
          Conteúdo em breve
        </p>
      </div>
    </aside>
  );
}
