import React, { useState } from "react";
import { EyeOff, ShieldAlert, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSensitivityMode } from "@/lib/moderationPrefs";

const db = supabase as any;

/**
 * Mensagens de aviso por categoria de moderação. Mantidas neutras e
 * curtas — o objetivo é avisar, não sensacionalizar.
 */
const CATEGORY_LABEL: Record<string, string> = {
  sensitive:  "Este conteúdo pode conter material sensível.",
  nudity:     "Este conteúdo pode conter nudez ou conteúdo sexual.",
  violence:   "Este conteúdo pode conter violência gráfica.",
  harassment: "Este conteúdo foi sinalizado como potencialmente ofensivo.",
};

export type SensitiveOverlayProps = {
  /** Categoria de moderação devolvida pela IA: sensitive/nudity/violence/harassment. */
  category: string;
  /** O conteúdo real (imagem, vídeo, texto) a esconder atrás do blur. */
  children: React.ReactNode;
  /** Altura mínima do placeholder antes de revelar (evita saltos de layout). */
  minHeight?: number | string;
  className?: string;
};

/**
 * Envolve qualquer media/conteúdo com um blur + aviso. O utilizador escolhe
 * "Ver conteúdo" (revela só desta vez) ou "Ocultar conteúdos semelhantes"
 * (a IA deixa de mostrar essa categoria a este utilizador — ver
 * hide_similar_content() no backend).
 */
export function SensitiveContentOverlay({ category, children, minHeight = 220, className }: SensitiveOverlayProps) {
  const [revealed, setRevealed] = useState(false);
  const [hiding, setHiding] = useState(false);
  const { mode } = useSensitivityMode();

  const message = CATEGORY_LABEL[category] || CATEGORY_LABEL.sensitive;

  async function handleHideSimilar() {
    setHiding(true);
    try {
      const { error } = await db.rpc("hide_similar_content", { p_category: category });
      if (error) throw error;
      toast.success("Vais ver menos conteúdo deste tipo a partir de agora.");
    } catch (err) {
      console.error("Erro ao ocultar categoria:", err);
      toast.error("Não foi possível guardar a preferência.");
    } finally {
      setHiding(false);
    }
  }

  // "Mostrar automaticamente" — nas definições do utilizador, sem blur nem aviso.
  if (mode === "auto" || revealed) {
    return <div className={className}>{children}</div>;
  }

  // "Ocultar completamente" — não mostra a media de todo. Ainda deixamos um
  // link discreto para o caso de o utilizador querer ver este item em
  // concreto, mas sem pré-visualização (nem sequer o blur revela forma/cor).
  if (mode === "hide") {
    return (
      <div
        className={className}
        style={{
          minHeight: 64, borderRadius: 12, background: "rgba(120,120,130,0.08)",
          border: "1px dashed rgba(120,120,130,0.35)", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "12px 16px",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #737373)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Conteúdo sensível oculto pelas tuas definições
        </span>
        <button
          onClick={() => setRevealed(true)}
          style={{ fontSize: 12, fontWeight: 700, color: "var(--accent, #2F6FED)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
        >
          <Eye className="h-3.5 w-3.5" /> Ver mesmo assim
        </button>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        minHeight,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "absolute", inset: 0, filter: "blur(24px) saturate(60%)", transform: "scale(1.1)", pointerEvents: "none" }}>
        {children}
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,15,0.55)" }} />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 20, maxWidth: 320 }}>
        <ShieldAlert className="h-7 w-7 mx-auto mb-2" style={{ color: "#fff" }} />
        <p style={{ color: "#fff", fontSize: 13.5, fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setRevealed(true)}
            style={{
              background: "#fff", color: "#111", border: "none", borderRadius: 999,
              padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Ver conteúdo
          </button>
          <button
            onClick={handleHideSimilar}
            disabled={hiding}
            style={{
              background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600,
              cursor: hiding ? "default" : "pointer", opacity: hiding ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Ocultar semelhantes
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Versão compacta para conteúdo textual (comentários) — sem blur (não faz
 * sentido desfocar texto), só uma linha discreta com aviso + "Ver". Respeita
 * o mesmo modo de sensibilidade global (auto/warn/hide) que os posts.
 */
export function SensitiveCommentText({ category, children }: { category: string; children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const { mode } = useSensitivityMode();

  if (mode === "auto" || revealed) return <>{children}</>;

  const label = mode === "hide" ? "Comentário oculto (conteúdo sensível)" : "Comentário sinalizado como conteúdo sensível";

  return (
    <span
      onClick={() => setRevealed(true)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
        color: "#9a3412", background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.25)",
        borderRadius: 8, padding: "4px 10px", fontSize: 12.5, fontWeight: 600,
      }}
      title="Clica para ver o conteúdo"
    >
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      {label} · <span style={{ textDecoration: "underline" }}>Ver</span>
    </span>
  );
}
