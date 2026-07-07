import React, { useState } from "react";
import { EyeOff, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  if (revealed) {
    return <div className={className}>{children}</div>;
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
