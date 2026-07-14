import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchMinhasRedes } from "@/lib/redes";

const COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A", "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

/** Círculos das Redes de que o utilizador é membro, com o número de
 * publicações novas desde a última visita. Ao tocar, abre a Rede. */
export function RedeStoriesBar({ userId }: { userId: string | null | undefined }) {
  const navigate = useNavigate();
  const { data: redes } = useQuery({
    queryKey: ["minhas-redes", userId],
    queryFn: fetchMinhasRedes,
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!userId) return null;
  // Ainda sem Redes — não mostra nada na Home. "Descobrir Redes" já vive
  // dentro do Explorador (aba Redes), não precisa de duplicar aqui.
  if (!redes || redes.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1 flex gap-3 overflow-x-auto no-scrollbar">
      {redes.map((r) => (
        <button
          key={r.id}
          onClick={() => navigate({ to: "/redes/$username", params: { username: r.username } })}
          className="shrink-0 flex flex-col items-center gap-1 w-16 relative"
        >
          <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-sm relative"
            style={{ background: colorFor(r.nome) }}>
            {r.avatar_url
              ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              : (r.nome?.[0] ?? "?").toUpperCase()}
            {r.novidades > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: "#ef4444" }}>
                {r.novidades > 99 ? "99+" : r.novidades}
              </span>
            )}
          </div>
          <span className="text-[10px] truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>{r.nome}</span>
        </button>
      ))}
    </div>
  );
}
