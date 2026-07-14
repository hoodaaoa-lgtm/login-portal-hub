import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X, Plus, Loader2 } from "lucide-react";
import { fetchMinhasRedes } from "@/lib/redes";

const COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A", "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

/**
 * Já não é possível publicar direto do perfil — publicar é sempre dentro
 * de uma Rede. Este modal substitui o antigo composer directo:
 *  - 0 Redes  → manda logo para criar a primeira Rede.
 *  - 1 Rede   → entra logo nela (onde já existe o ComposeBox).
 *  - 2+ Redes → mostra a lista para escolher em qual publicar.
 */
export function RedePickerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: redes, isLoading } = useQuery({
    queryKey: ["minhas-redes-picker"],
    queryFn: fetchMinhasRedes,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isLoading) return;
    if (!redes || redes.length === 0) {
      navigate({ to: "/redes/nova" });
      onClose();
    } else if (redes.length === 1) {
      navigate({ to: "/redes/$username", params: { username: redes[0].username } });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, redes]);

  // Só chega a mostrar UI quando há 2+ Redes para escolher.
  if (isLoading || !redes || redes.length <= 1) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div
        className="w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl max-h-[70vh] overflow-y-auto"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b" style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
          <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Publicar em qual Rede?</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)]" style={{ color: "var(--text-secondary)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          {redes.map((r) => (
            <button
              key={r.id}
              onClick={() => { navigate({ to: "/redes/$username", params: { username: r.username } }); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--s2)] transition"
            >
              <div className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-sm shrink-0"
                style={{ background: colorFor(r.nome) }}>
                {r.avatar_url
                  ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : (r.nome?.[0] ?? "?").toUpperCase()}
              </div>
              <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.nome}</span>
            </button>
          ))}
          <button
            onClick={() => { navigate({ to: "/redes/nova" }); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--s2)] transition"
          >
            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Criar nova Rede</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
