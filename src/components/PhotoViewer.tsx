import { useEffect } from "react";
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
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
        <div className="min-w-0">
          {alt && <p className="text-white font-bold text-sm truncate">{alt}</p>}
          {subtitle && <p className="text-white/60 text-xs truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-3 transition hover:bg-white/15"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Foto — circular como YouTube/Facebook */}
      <div
        className="rounded-full overflow-hidden shadow-2xl"
        style={{
          width: "min(72vw, 320px)",
          height: "min(72vw, 320px)",
          animation: "photoZoomIn 0.22s cubic-bezier(0.34,1.4,0.64,1)",
          border: "3px solid rgba(255,255,255,0.18)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

      <style>{`
        @keyframes photoZoomIn {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
