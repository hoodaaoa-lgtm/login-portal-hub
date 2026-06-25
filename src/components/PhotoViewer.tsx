import { useEffect } from "react";
import { X, Download } from "lucide-react";

interface PhotoViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function PhotoViewer({ src, alt = "Foto", onClose }: PhotoViewerProps) {
  /* Fechar com ESC */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Bloquear scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = src;
    a.download = alt + ".jpg";
    a.target = "_blank";
    a.click();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Botão fechar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition hover:bg-white/10"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Botão download */}
      <button
        onClick={handleDownload}
        className="absolute top-4 right-16 w-10 h-10 rounded-full flex items-center justify-center transition hover:bg-white/10"
        style={{ background: "rgba(255,255,255,0.08)" }}
        title="Guardar foto"
      >
        <Download className="w-4.5 h-4.5 text-white" />
      </button>

      {/* Foto */}
      <img
        src={src}
        alt={alt}
        className="max-w-[92vw] max-h-[92vh] rounded-2xl object-contain shadow-2xl"
        style={{ animation: "photoZoomIn 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      <style>{`
        @keyframes photoZoomIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
