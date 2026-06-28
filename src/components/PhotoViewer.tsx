import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface PhotoViewerProps {
  src: string;
  alt?: string;
  subtitle?: string;
  onClose: () => void;
}

export function PhotoViewer({ src, alt = "Foto", subtitle, onClose }: PhotoViewerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    // Bloquear scroll do fundo
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: "56px", background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="min-w-0">
          {alt && <p className="text-white font-bold text-sm truncate">{alt}</p>}
          {subtitle && <p className="text-white/60 text-xs truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-3 transition active:scale-90"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Foto centrada — ocupa tudo sem scroll */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        style={{ minHeight: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          width: "min(75vw, 300px)",
          height: "min(75vw, 300px)",
          borderRadius: "50%",
          overflow: "hidden",
          border: "3px solid rgba(255,255,255,0.22)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          animation: "pvZoom 0.2s cubic-bezier(0.34,1.5,0.64,1)",
          flexShrink: 0,
        }}>
          <img
            src={src}
            alt={alt}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            draggable={false}
          />
        </div>
      </div>

      <div className="shrink-0" style={{ height: "56px" }} />

      <style>{`
        @keyframes pvZoom {
          from { opacity: 0; transform: scale(0.75); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}
