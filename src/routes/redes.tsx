import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Users } from "lucide-react";
import { BottomNav, SideNav, PageWrapper, FeedLayout, PageHeader } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { fetchRedesPublicas, fetchMinhasRedes } from "@/lib/redes";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/redes")({
  head: () => ({ meta: [{ title: "Redes · Baya" }] }),
  component: RedesPage,
});

const COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A", "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

function RedeRow({ nome, username, avatar_url, membros_count, verificada, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--s2)] transition">
      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white" style={{ background: colorFor(nome) }}>
        {avatar_url ? <img src={avatar_url} alt="" className="w-full h-full object-cover" /> : (nome?.[0] ?? "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold inline-flex items-center gap-1 truncate" style={{ color: "var(--text-primary)" }}>
          {nome}{verificada && <VerifiedBadge size={12} />}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{username} · {membros_count} membro{membros_count === 1 ? "" : "s"}</p>
      </div>
    </button>
  );
}

function RedesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [termo, setTermo] = useState("");

  const { data: minhasRedes } = useQuery({
    queryKey: ["minhas-redes", user?.id],
    queryFn: fetchMinhasRedes,
    enabled: !!user?.id,
  });

  const { data: publicas, isLoading } = useQuery({
    queryKey: ["redes-publicas", termo],
    queryFn: () => fetchRedesPublicas({ termo: termo.trim() || undefined }),
  });

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
        <FeedLayout
          feed={
            <>
              <PageHeader
                title="Redes"
                onBack={() => navigate({ to: "/home" })}
                actions={
                  <button onClick={() => navigate({ to: "/redes/nova" })}
                    className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white" style={{ background: "#5B3FCF" }}>
                    <Plus className="h-3.5 w-3.5" /> Criar
                  </button>
                }
              />

              <div className="px-3 pt-3">
                <div className="flex items-center gap-2 h-10 rounded-full px-3" style={{ background: "var(--s2)" }}>
                  <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  <input
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    placeholder="Procurar Redes por nome ou @username"
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>
              </div>

              {minhasRedes && minhasRedes.length > 0 && (
                <div className="mt-4">
                  <p className="px-4 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>As minhas Redes</p>
                  <div className="mt-1">
                    {minhasRedes.map((r) => (
                      <RedeRow key={r.id} {...r} membros_count={undefined} onClick={() => navigate({ to: "/redes/$username", params: { username: r.username } })} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <p className="px-4 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Descobrir</p>
                {isLoading && <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>A carregar…</p>}
                {!isLoading && (publicas?.length ?? 0) === 0 && (
                  <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
                    <Users className="h-8 w-8" style={{ color: "var(--text-muted)" }} />
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Nenhuma Rede encontrada</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sê o primeiro a criar uma Rede sobre este tema.</p>
                  </div>
                )}
                <div className="mt-1 pb-8">
                  {publicas?.map((r) => (
                    <RedeRow key={r.id} {...r} onClick={() => navigate({ to: "/redes/$username", params: { username: r.username } })} />
                  ))}
                </div>
              </div>
            </>
          }
          sidebar={<RightSidebar />}
        />
      </PageWrapper>
      <BottomNav />
    </div>
  );
}
