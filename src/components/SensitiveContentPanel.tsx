import { ShieldAlert, Check, Eye, EyeOff, Blend } from "lucide-react";
import { SettingsSubPanel } from "@/routes/perfil";
import { useSensitivityMode, SENSITIVITY_LABELS, type SensitivityMode } from "@/lib/moderationPrefs";
import { toast } from "sonner";
import { useState } from "react";

const ACCENT = "#5B3FCF";

const OPTION_ICON: Record<SensitivityMode, React.ReactNode> = {
  auto: <Eye className="h-5 w-5" />,
  warn: <ShieldAlert className="h-5 w-5" />,
  hide: <EyeOff className="h-5 w-5" />,
};

/**
 * Painel de definições — "Conteúdo Sensível". Deixa o utilizador escolher
 * entre os 3 níveis globais (auto/warn/hide) que a SensitiveContentOverlay
 * e a SensitiveCommentText respeitam em todo o site (feed, perfil, pesquisa,
 * comentários). Não afeta a página de mensagens.
 */
export function SensitiveContentPanel({ onBack }: { onBack: () => void }) {
  const { mode, isLoading, setMode } = useSensitivityMode();
  const [saving, setSaving] = useState<SensitivityMode | null>(null);

  async function handleSelect(next: SensitivityMode) {
    if (next === mode || saving) return;
    setSaving(next);
    try {
      await setMode(next);
      toast.success("Preferência guardada.");
    } catch {
      toast.error("Não foi possível guardar. Tenta novamente.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <SettingsSubPanel title="Conteúdo Sensível" onBack={onBack}>
      <p className="px-5 pt-1 pb-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Aplica-se a imagens, vídeos e comentários sinalizados como sensíveis (violência,
        acidentes, nudez, automutilação ou conteúdo perturbador) em todo o feed, pesquisa,
        perfis e comentários. Não afeta as tuas mensagens privadas.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="px-4 space-y-2.5 pb-6">
          {(Object.keys(SENSITIVITY_LABELS) as SensitivityMode[]).map((key) => {
            const selected = mode === key;
            const info = SENSITIVITY_LABELS[key];
            return (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                disabled={!!saving}
                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl text-left transition active:scale-[0.99] disabled:opacity-70"
                style={{
                  background: selected ? `${ACCENT}12` : "var(--s0)",
                  border: `1.5px solid ${selected ? ACCENT : "var(--border-subtle)"}`,
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: selected ? `${ACCENT}22` : "var(--s2)", color: selected ? ACCENT : "var(--text-secondary)" }}>
                  {saving === key
                    ? <div className="h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                    : OPTION_ICON[key]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{info.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{info.description}</p>
                </div>
                {selected && <Check className="h-4 w-4 shrink-0 mt-1" style={{ color: ACCENT }} />}
              </button>
            );
          })}

          <div className="flex items-start gap-2.5 mt-4 px-4 py-3 rounded-xl" style={{ background: "var(--s2)" }}>
            <Blend className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Toda a análise corre automaticamente e em segundo plano quando alguém publica.
              Podes ainda tocar em "Ocultar semelhantes" num aviso específico para deixares de
              ver essa categoria em concreto, além desta preferência geral.
            </p>
          </div>
        </div>
      )}
    </SettingsSubPanel>
  );
}
