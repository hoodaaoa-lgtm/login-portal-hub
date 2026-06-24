/**
 * MediaEditor — full-screen media editor (image & video)
 * Features: filters, adjustments, text layers, stickers, video controls, preview modes
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Check, ArrowLeft, Bold, Italic,
  Volume2, VolumeX, Play, Pause, Trash2, Plus,
  Type, Smile, Video as VideoIcon, Sliders, Layers,
  AlignLeft, AlignCenter, AlignRight, Eye, Crop,
} from "lucide-react";

/* ─── Types ─── */
export type TextLayer = {
  id: string; text: string; fontCss: string; sizePx: number;
  color: string; bold: boolean; italic: boolean; shadow: boolean; outline: boolean;
  align: "left" | "center" | "right";
  x: number; y: number; // % of preview container
};

export type StickerLayer = {
  id: string; emoji: string; sizePx: number;
  x: number; y: number; rotation: number;
};

export type CropRatio = "original" | "1:1" | "4:5" | "9:16" | "16:9";

export type MediaEditState = {
  filterIdx: number;
  brightness: number; contrast: number; saturation: number;
  temperature: number; vignette: number; exposure: number;
  cropRatio: CropRatio;
  texts: TextLayer[];
  stickers: StickerLayer[];
  videoMuted: boolean;
  videoSpeed: number;
  videoVolume: number;
};

export const DEFAULT_EDIT: MediaEditState = {
  filterIdx: 0,
  brightness: 100, contrast: 100, saturation: 100,
  temperature: 0, vignette: 0, exposure: 0,
  cropRatio: "original",
  texts: [], stickers: [],
  videoMuted: false, videoSpeed: 1, videoVolume: 1,
};

/* ─── Constants ─── */
const ACCENT = "#5B3FCF";

export const EDITOR_FILTERS = [
  { id: "none",     label: "Original",  css: "none" },
  { id: "bw",       label: "P&B",       css: "grayscale(1)" },
  { id: "vintage",  label: "Vintage",   css: "sepia(0.55) contrast(0.88) brightness(0.92) saturate(0.8)" },
  { id: "cinema",   label: "Cinema",    css: "contrast(1.2) brightness(0.85) saturate(0.65) hue-rotate(-5deg)" },
  { id: "vivid",    label: "Vibrante",  css: "saturate(1.8) contrast(1.06) brightness(1.05)" },
  { id: "portrait", label: "Retrato",   css: "contrast(1.08) brightness(1.06) saturate(0.88)" },
  { id: "cool",     label: "Frio",      css: "hue-rotate(22deg) saturate(0.82) brightness(0.97)" },
  { id: "warm",     label: "Quente",    css: "sepia(0.28) saturate(1.35) brightness(1.05)" },
  { id: "hdr",      label: "HDR",       css: "contrast(1.38) saturate(1.45) brightness(0.88)" },
  { id: "fade",     label: "Desbotado", css: "brightness(1.12) saturate(0.65) contrast(0.88)" },
];

const EDITOR_FONTS = [
  { label: "Sans",    css: "system-ui, sans-serif" },
  { label: "Serif",   css: "Georgia, serif" },
  { label: "Bold",    css: "'Arial Black', sans-serif" },
  { label: "Mono",    css: "monospace" },
  { label: "Script",  css: "cursive" },
];

const TEXT_SIZES = [
  { label: "S", px: 14 },
  { label: "M", px: 20 },
  { label: "L", px: 28 },
  { label: "XL", px: 42 },
];

const TEXT_COLORS = ["#ffffff", "#111111", "#FFC93C", "#E94B8A", "#5B3FCF", "#10b981", "#F26B3A", "#3B82F6"];

const STICKERS = [
  "🥳","🤯","🥺","😤","🤩","🤑","🥹","😎","❤️","🔥","⭐","🌈","💎","🏆","🎉","🎊",
  "👑","🌟","💫","✨","💯","🚀","🎸","🎵","📚","✍️","💡","🌺","🐶","🐱","🦁","🦋",
  "🌊","⚡","❄️","☀️","🌙","🍕","🎂","☕","🎮","📱","💻","🏄","🎯","💪","🙏","✌️",
  "👏","🫂","😂","😍","🤔","👀","🫡","💀","👻","🤖","👾","🎭","🃏","🎪","🌻","🍀",
];

const VIDEO_SPEEDS = [0.5, 1, 1.5, 2];

const CROP_RATIOS: { id: CropRatio; label: string; desc: string; aspect: string }[] = [
  { id: "original", label: "Original",  desc: "Sem corte",  aspect: "" },
  { id: "1:1",      label: "Quadrado",  desc: "1:1",        aspect: "1/1" },
  { id: "4:5",      label: "Retrato",   desc: "4:5",        aspect: "4/5" },
  { id: "9:16",     label: "Story",     desc: "9:16",       aspect: "9/16" },
  { id: "16:9",     label: "Paisagem",  desc: "16:9",       aspect: "16/9" },
];

function getAspectStyle(cropRatio: CropRatio): React.CSSProperties {
  const r = CROP_RATIOS.find(x => x.id === cropRatio);
  if (!r || cropRatio === "original" || !r.aspect) return {};
  return { aspectRatio: r.aspect };
}

/* ─── Helpers ─── */
function buildFilter(edit: MediaEditState): string {
  const base = EDITOR_FILTERS[edit.filterIdx]?.css ?? "none";
  const parts: string[] = [];
  if (edit.brightness !== 100) parts.push(`brightness(${edit.brightness}%)`);
  if (edit.contrast !== 100) parts.push(`contrast(${edit.contrast}%)`);
  if (edit.saturation !== 100) parts.push(`saturate(${edit.saturation}%)`);
  if (edit.exposure !== 0) parts.push(`brightness(${100 + edit.exposure / 2}%)`);
  if (edit.temperature !== 0) parts.push(`hue-rotate(${edit.temperature}deg)`);
  const adj = parts.join(" ");
  if (base === "none" && !adj) return "none";
  if (base === "none") return adj;
  if (!adj) return base;
  return `${base} ${adj}`;
}

type EditorTab = "recortar" | "filtros" | "ajustes" | "texto" | "stickers" | "video";

/* ─── Slider ─── */
function Slider({ label, value, min, max, unit = "%", onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-white/60 text-xs font-semibold">{label}</span>
        <span className="text-white/80 text-xs font-mono tabular-nums">
          {value > 0 && unit !== "%" ? "+" : ""}{value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer"
        style={{ accentColor: ACCENT }} />
    </div>
  );
}

/* ─── Main component ─── */
interface MediaEditorProps {
  src: string;
  type: "image" | "video";
  onDone: (edit: MediaEditState) => void;
  onCancel: () => void;
  /** Quando fornecido, o editor abre já com esta edição aplicada (ex: reabrir a partir da prévia do chat). */
  initialEdit?: MediaEditState;
}

export default function MediaEditor({ src, type, onDone, onCancel, initialEdit }: MediaEditorProps) {
  const [edit, setEdit] = useState<MediaEditState>(initialEdit ?? DEFAULT_EDIT);
  const [activeTab, setActiveTab] = useState<EditorTab>("filtros");
  const [previewMode, setPreviewMode] = useState<"feed" | "story">("feed");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Text layer being added
  const [newText, setNewText] = useState("");
  const [newFontIdx, setNewFontIdx] = useState(0);
  const [newSizeIdx, setNewSizeIdx] = useState(1);
  const [newColor, setNewColor] = useState("#ffffff");
  const [newBold, setNewBold] = useState(false);
  const [newItalic, setNewItalic] = useState(false);
  const [newShadow, setNewShadow] = useState(true);
  const [newOutline, setNewOutline] = useState(false);
  const [newAlign, setNewAlign] = useState<"left" | "center" | "right">("center");

  // Video
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || type !== "video") return;
    v.muted = edit.videoMuted;
    v.volume = edit.videoVolume;
    v.playbackRate = edit.videoSpeed;
  }, [edit.videoMuted, edit.videoVolume, edit.videoSpeed, type]);

  function upd(partial: Partial<MediaEditState>) {
    setEdit((e) => ({ ...e, ...partial }));
  }

  /* ── Drag text/sticker ── */
  const dragRef = useRef<{ id: string; kind: "text" | "sticker"; startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onLayerPointerDown(e: React.PointerEvent, id: string, kind: "text" | "sticker", curX: number, curY: number) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedLayerId(id);
    dragRef.current = { id, kind, startX: e.clientX, startY: e.clientY, origX: curX, origY: curY };
  }

  function onPreviewPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = ((e.clientY - d.startY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(90, d.origX + dx));
    const newY = Math.max(0, Math.min(90, d.origY + dy));
    if (d.kind === "text") {
      upd({ texts: edit.texts.map((t) => t.id === d.id ? { ...t, x: newX, y: newY } : t) });
    } else {
      upd({ stickers: edit.stickers.map((s) => s.id === d.id ? { ...s, x: newX, y: newY } : s) });
    }
  }

  function onPreviewPointerUp() { dragRef.current = null; }

  function deleteSelected() {
    if (!selectedLayerId) return;
    upd({
      texts: edit.texts.filter((t) => t.id !== selectedLayerId),
      stickers: edit.stickers.filter((s) => s.id !== selectedLayerId),
    });
    setSelectedLayerId(null);
  }

  function addText() {
    if (!newText.trim()) return;
    const layer: TextLayer = {
      id: Date.now().toString(),
      text: newText.trim(),
      fontCss: EDITOR_FONTS[newFontIdx].css,
      sizePx: TEXT_SIZES[newSizeIdx].px,
      color: newColor, bold: newBold, italic: newItalic,
      shadow: newShadow, outline: newOutline, align: newAlign,
      x: 10, y: 40,
    };
    upd({ texts: [...edit.texts, layer] });
    setNewText("");
    setSelectedLayerId(layer.id);
  }

  function addSticker(emoji: string) {
    const layer: StickerLayer = {
      id: Date.now().toString(), emoji, sizePx: 40, x: 10, y: 30, rotation: 0,
    };
    upd({ stickers: [...edit.stickers, layer] });
    setSelectedLayerId(layer.id);
  }

  function toggleVideo() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setVideoPlaying(true); }
    else { v.pause(); setVideoPlaying(false); }
  }

  const filterCss = buildFilter(edit);

  const tabs: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
    { id: "recortar", label: "Recortar", icon: <Crop className="h-4 w-4" /> },
    { id: "filtros",  label: "Filtros",  icon: <Layers className="h-4 w-4" /> },
    { id: "ajustes",  label: "Ajustes",  icon: <Sliders className="h-4 w-4" /> },
    { id: "texto",    label: "Texto",    icon: <Type className="h-4 w-4" /> },
    { id: "stickers", label: "Stickers", icon: <Smile className="h-4 w-4" /> },
    ...(type === "video" ? [{ id: "video" as EditorTab, label: "Vídeo", icon: <VideoIcon className="h-4 w-4" /> }] : []),
  ];

  /* ── Preview aspect ratio ── */
  const cropAspect = getAspectStyle(edit.cropRatio);
  const previewStyle = edit.cropRatio !== "original"
    ? { ...cropAspect, maxWidth: "100%", margin: "0 auto" }
    : previewMode === "story"
      ? { aspectRatio: "9/16", maxWidth: "40vw", margin: "0 auto" }
      : { width: "100%", margin: "0 auto" };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#0a0a0f" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
        <button onClick={onCancel}
          className="h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.1)" }}>
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-white/40 text-xs font-semibold">Editor</span>
          {/* Feed/Story preview toggle */}
          <div className="flex items-center gap-1 px-1 py-1 rounded-full ml-2"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            {(["feed", "story"] as const).map((m) => (
              <button key={m} onClick={() => setPreviewMode(m)}
                className="px-3 py-1 rounded-full text-xs font-bold transition-all capitalize"
                style={{ background: previewMode === m ? ACCENT : "transparent", color: previewMode === m ? "#fff" : "rgba(255,255,255,0.4)" }}>
                {m === "feed" ? "Feed" : "Story"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => onDone(edit)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white"
          style={{ background: ACCENT }}>
          <Check className="h-4 w-4" /> Pronto
        </button>
      </div>

      {/* Preview area — altura limitada para toolbar caber sempre */}
      <div className="flex-none px-4 pb-2" style={{ maxHeight: "48vh" }}>
        <div ref={previewRef}
          className="relative overflow-hidden rounded-2xl bg-black select-none"
          style={{ ...previewStyle, maxHeight: "48vh" }}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onClick={() => setSelectedLayerId(null)}>

          {/* Media */}
          {type === "image" ? (
            <img src={src} alt="" className="w-full block"
              style={{
                objectFit: "contain",
                maxHeight: "48vh",
                filter: filterCss !== "none" ? filterCss : undefined,
              }} />
          ) : (
            <video ref={videoRef} src={src} playsInline loop preload="metadata"
              className="w-full h-full block"
              style={{
                objectFit: edit.cropRatio !== "original" ? "cover" : "contain",
                filter: filterCss !== "none" ? filterCss : undefined,
              }}
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
            />
          )}

          {/* Vignette */}
          {edit.vignette > 0 && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${edit.vignette / 100}) 100%)` }} />
          )}

          {/* Text layers */}
          {edit.texts.map((t) => (
            <div key={t.id}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                left: `${t.x}%`, top: `${t.y}%`,
                outline: selectedLayerId === t.id ? `2px solid ${ACCENT}` : "none",
                outlineOffset: 4, borderRadius: 6,
                userSelect: "none",
              }}
              onPointerDown={(e) => onLayerPointerDown(e, t.id, "text", t.x, t.y)}>
              <p style={{
                fontFamily: t.fontCss,
                fontSize: t.sizePx,
                color: t.color,
                fontWeight: t.bold ? "bold" : "normal",
                fontStyle: t.italic ? "italic" : "normal",
                textAlign: t.align,
                textShadow: t.shadow ? "0 2px 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)" : "none",
                WebkitTextStroke: t.outline ? "1.5px rgba(0,0,0,0.8)" : "none",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}>
                {t.text}
              </p>
            </div>
          ))}

          {/* Sticker layers */}
          {edit.stickers.map((s) => (
            <div key={s.id}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: `${s.x}%`, top: `${s.y}%`,
                fontSize: s.sizePx,
                lineHeight: 1,
                outline: selectedLayerId === s.id ? `2px solid ${ACCENT}` : "none",
                outlineOffset: 4,
                borderRadius: 8,
                transform: `rotate(${s.rotation}deg)`,
              }}
              onPointerDown={(e) => onLayerPointerDown(e, s.id, "sticker", s.x, s.y)}>
              {s.emoji}
            </div>
          ))}

          {/* Video play/pause overlay */}
          {type === "video" && !videoPlaying && (
            <button className="absolute inset-0 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); toggleVideo(); }}>
              <div className="h-14 w-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(4px)" }}>
                <Play className="h-7 w-7 text-white" />
              </div>
            </button>
          )}
          {type === "video" && videoPlaying && (
            <button className="absolute top-2 right-2 h-9 w-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.45)" }}
              onClick={(e) => { e.stopPropagation(); toggleVideo(); }}>
              <Pause className="h-4 w-4 text-white" />
            </button>
          )}

          {/* Video mute button */}
          {type === "video" && (
            <button className="absolute bottom-2 right-2 h-8 w-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.52)" }}
              onClick={(e) => { e.stopPropagation(); upd({ videoMuted: !edit.videoMuted }); }}>
              {edit.videoMuted
                ? <VolumeX className="h-4 w-4 text-white" />
                : <Volume2 className="h-4 w-4 text-white" />}
            </button>
          )}

          {/* Selected layer delete */}
          {selectedLayerId && (
            <button className="absolute top-2 left-2 h-8 w-8 rounded-full flex items-center justify-center z-20"
              style={{ background: "rgba(220,38,38,0.8)" }}
              onClick={(e) => { e.stopPropagation(); deleteSelected(); }}>
              <Trash2 className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Preview mode hint */}
        <p className="text-center text-white/25 text-[10px] mt-1.5">
          {previewMode === "story" ? "Story" : "Feed"}
          {(edit.texts.length > 0 || edit.stickers.length > 0) && " · Arrasta texto e stickers para mover"}
        </p>
      </div>

      {/* Tools panel — sempre visível, sem maxHeight */}
      <div className="shrink-0 mx-3 mb-3 rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.05)" }}>

        {/* Tabs */}
        <div className="flex border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              style={{
                color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.3)",
                borderBottom: activeTab === tab.id ? `2px solid ${ACCENT}` : "2px solid transparent",
              }}>
              {tab.icon}
              <span className="text-[9px] font-bold">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 py-3">

          {/* ── Recortar ── */}
          {activeTab === "recortar" && (
            <div className="space-y-4">
              <p className="text-white/40 text-[11px] text-center">Escolhe o formato de corte</p>
              <div className="grid grid-cols-5 gap-2">
                {CROP_RATIOS.map((r) => {
                  const sel = edit.cropRatio === r.id;
                  const boxStyle: React.CSSProperties =
                    r.id === "original" ? { width: 28, height: 28, borderRadius: 6 }
                    : r.id === "1:1"    ? { width: 28, height: 28 }
                    : r.id === "4:5"    ? { width: 22, height: 28 }
                    : r.id === "9:16"   ? { width: 15, height: 28 }
                    :                     { width: 28, height: 16 };
                  return (
                    <button key={r.id} onClick={() => upd({ cropRatio: r.id })}
                      className="flex flex-col items-center gap-2 rounded-xl p-2 transition-all"
                      style={{
                        background: sel ? `${ACCENT}40` : "rgba(255,255,255,0.06)",
                        border: sel ? `1.5px solid ${ACCENT}` : "1.5px solid transparent",
                      }}>
                      <div className="flex items-center justify-center" style={{ height: 36, width: "100%" }}>
                        <div className="bg-white/25 rounded-[3px]" style={boxStyle} />
                      </div>
                      <span className="text-[9px] font-bold w-full text-center leading-tight"
                        style={{ color: sel ? "#fff" : "rgba(255,255,255,0.5)" }}>
                        {r.label}
                      </span>
                      <span className="text-[8px] text-white/30">{r.desc}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => upd({ cropRatio: "original" })}
                className="w-full py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white/70 transition-colors">
                Repor corte
              </button>
            </div>
          )}

          {/* ── Filtros ── */}
          {activeTab === "filtros" && (
            <div className="grid grid-cols-5 gap-2">
              {EDITOR_FILTERS.map((f, i) => (
                <button key={f.id} onClick={() => upd({ filterIdx: i })}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all"
                  style={{ background: edit.filterIdx === i ? `${ACCENT}40` : "rgba(255,255,255,0.06)", border: edit.filterIdx === i ? `1.5px solid ${ACCENT}` : "1.5px solid transparent" }}>
                  <div className="h-11 w-full rounded-lg overflow-hidden bg-black/30">
                    {type === "image"
                      ? <img src={src} alt="" className="h-full w-full object-cover"
                          style={{ filter: f.css !== "none" ? f.css : undefined }} />
                      : <video src={src} className="h-full w-full object-cover" muted playsInline preload="metadata"
                          style={{ filter: f.css !== "none" ? f.css : undefined }} />}
                  </div>
                  <span className="text-[9px] font-bold truncate w-full text-center"
                    style={{ color: edit.filterIdx === i ? "#fff" : "rgba(255,255,255,0.5)" }}>
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── Ajustes ── */}
          {activeTab === "ajustes" && (
            <div className="space-y-4">
              <Slider label="Brilho" value={edit.brightness} min={50} max={150} onChange={(v) => upd({ brightness: v })} />
              <Slider label="Contraste" value={edit.contrast} min={50} max={200} onChange={(v) => upd({ contrast: v })} />
              <Slider label="Saturação" value={edit.saturation} min={0} max={200} onChange={(v) => upd({ saturation: v })} />
              <Slider label="Temperatura" value={edit.temperature} min={-50} max={50} unit="°" onChange={(v) => upd({ temperature: v })} />
              <Slider label="Exposição" value={edit.exposure} min={-100} max={100} unit="" onChange={(v) => upd({ exposure: v })} />
              <Slider label="Vinheta" value={edit.vignette} min={0} max={100} onChange={(v) => upd({ vignette: v })} />
              <button onClick={() => upd({ brightness: 100, contrast: 100, saturation: 100, temperature: 0, exposure: 0, vignette: 0 })}
                className="w-full py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white/70 transition-colors">
                Repor ajustes
              </button>
            </div>
          )}

          {/* ── Texto ── */}
          {activeTab === "texto" && (
            <div className="space-y-3">
              {/* Input */}
              <div className="flex gap-2">
                <input value={newText} onChange={(e) => setNewText(e.target.value)}
                  placeholder="Escreve o texto…"
                  onKeyDown={(e) => e.key === "Enter" && addText()}
                  className="flex-1 h-10 px-3 rounded-xl text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }} />
                <button onClick={addText}
                  disabled={!newText.trim()}
                  className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-all"
                  style={{ background: ACCENT }}>
                  <Plus className="h-4 w-4 text-white" />
                </button>
              </div>

              {/* Font */}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Fonte</p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {EDITOR_FONTS.map((f, i) => (
                    <button key={i} onClick={() => setNewFontIdx(i)}
                      className="h-10 w-14 rounded-xl flex items-center justify-center shrink-0 transition-all"
                      style={{
                        background: newFontIdx === i ? `${ACCENT}40` : "rgba(255,255,255,0.07)",
                        border: newFontIdx === i ? `1.5px solid ${ACCENT}` : "1.5px solid transparent",
                        fontFamily: f.css, color: "#fff", fontWeight: "bold", fontSize: 14,
                      }}>
                      Aa
                    </button>
                  ))}
                </div>
              </div>

              {/* Size + style + align */}
              <div className="flex gap-4 flex-wrap">
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Tamanho</p>
                  <div className="flex gap-1.5">
                    {TEXT_SIZES.map((s, i) => (
                      <button key={i} onClick={() => setNewSizeIdx(i)}
                        className="h-8 w-8 rounded-lg text-xs font-bold transition-all"
                        style={{ background: newSizeIdx === i ? ACCENT : "rgba(255,255,255,0.08)", color: "#fff" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Estilo</p>
                  <div className="flex gap-1.5">
                    <button onClick={() => setNewBold((v) => !v)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{ background: newBold ? ACCENT : "rgba(255,255,255,0.08)" }}>
                      <Bold className="h-3.5 w-3.5 text-white" />
                    </button>
                    <button onClick={() => setNewItalic((v) => !v)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{ background: newItalic ? ACCENT : "rgba(255,255,255,0.08)" }}>
                      <Italic className="h-3.5 w-3.5 text-white" />
                    </button>
                    <button onClick={() => setNewShadow((v) => !v)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-black"
                      style={{ background: newShadow ? ACCENT : "rgba(255,255,255,0.08)", color: "#fff" }}>
                      S
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Alinhar</p>
                  <div className="flex gap-1.5">
                    {(["left","center","right"] as const).map((a, i) => {
                      const Icon = [AlignLeft, AlignCenter, AlignRight][i];
                      return (
                        <button key={a} onClick={() => setNewAlign(a)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center"
                          style={{ background: newAlign === a ? ACCENT : "rgba(255,255,255,0.08)" }}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Color */}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Cor</p>
                <div className="flex gap-2">
                  {TEXT_COLORS.map((c) => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className="h-7 w-7 rounded-full transition-all"
                      style={{
                        background: c,
                        border: c === "#111111" ? "1.5px solid rgba(255,255,255,0.2)" : "none",
                        outline: newColor === c ? "3px solid #fff" : "3px solid transparent",
                        outlineOffset: 2,
                        transform: newColor === c ? "scale(1.18)" : "scale(1)",
                      }} />
                  ))}
                </div>
              </div>

              {/* Existing text layers */}
              {edit.texts.length > 0 && (
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Camadas de texto</p>
                  <div className="space-y-1.5">
                    {edit.texts.map((t) => (
                      <div key={t.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: selectedLayerId === t.id ? `${ACCENT}25` : "rgba(255,255,255,0.05)", border: selectedLayerId === t.id ? `1px solid ${ACCENT}` : "1px solid transparent" }}>
                        <button className="flex-1 text-left text-sm text-white/70 truncate"
                          onClick={() => setSelectedLayerId(t.id === selectedLayerId ? null : t.id)}>
                          {t.text}
                        </button>
                        <button onClick={() => upd({ texts: edit.texts.filter((x) => x.id !== t.id) })}
                          className="p-1 rounded-lg hover:bg-red-500/20">
                          <Trash2 className="h-3.5 w-3.5 text-white/40" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stickers ── */}
          {activeTab === "stickers" && (
            <div>
              <div className="grid grid-cols-8 gap-1">
                {STICKERS.map((s, i) => (
                  <button key={i} onClick={() => addSticker(s)}
                    className="h-10 w-10 flex items-center justify-center text-xl rounded-xl transition-all active:scale-90"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    {s}
                  </button>
                ))}
              </div>
              {/* Sticker size control for selected */}
              {selectedLayerId && edit.stickers.find((s) => s.id === selectedLayerId) && (() => {
                const sticker = edit.stickers.find((s) => s.id === selectedLayerId)!;
                return (
                  <div className="mt-3 space-y-2">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Tamanho</p>
                    <div className="flex gap-2">
                      {[{ label: "S", px: 24 }, { label: "M", px: 40 }, { label: "L", px: 56 }, { label: "XL", px: 80 }].map((sz) => (
                        <button key={sz.label} onClick={() => upd({ stickers: edit.stickers.map((s) => s.id === sticker.id ? { ...s, sizePx: sz.px } : s) })}
                          className="h-8 w-8 rounded-lg text-xs font-bold transition-all"
                          style={{ background: sticker.sizePx === sz.px ? ACCENT : "rgba(255,255,255,0.08)", color: "#fff" }}>
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Vídeo ── */}
          {activeTab === "video" && type === "video" && (
            <div className="space-y-4">
              {/* Play/Pause + Mute */}
              <div className="flex gap-3">
                <button onClick={toggleVideo}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.1)" }}>
                  {videoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {videoPlaying ? "Pausar" : "Reproduzir"}
                </button>
                <button onClick={() => upd({ videoMuted: !edit.videoMuted })}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm transition-all"
                  style={{ background: edit.videoMuted ? "rgba(255,255,255,0.1)" : `${ACCENT}40`, color: edit.videoMuted ? "rgba(255,255,255,0.5)" : "#fff" }}>
                  {edit.videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {edit.videoMuted ? "Sem som" : "Com som"}
                </button>
              </div>

              {/* Volume */}
              {!edit.videoMuted && (
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/60 text-xs font-semibold">Volume</span>
                    <span className="text-white/80 text-xs font-mono">{Math.round(edit.videoVolume * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={edit.videoVolume}
                    onChange={(e) => upd({ videoVolume: Number(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer"
                    style={{ accentColor: ACCENT }} />
                </div>
              )}

              {/* Speed */}
              <div>
                <p className="text-white/60 text-xs font-semibold mb-2">Velocidade</p>
                <div className="flex gap-2">
                  {VIDEO_SPEEDS.map((s) => (
                    <button key={s} onClick={() => upd({ videoSpeed: s })}
                      className="flex-1 h-9 rounded-xl text-sm font-bold transition-all"
                      style={{ background: edit.videoSpeed === s ? ACCENT : "rgba(255,255,255,0.08)", color: edit.videoSpeed === s ? "#fff" : "rgba(255,255,255,0.5)" }}>
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Utility: render edited media in feed ─── */
interface EditedMediaDisplayProps {
  src: string;
  type: "image" | "video";
  edit: MediaEditState;
  maxH?: number;
}

export function EditedMediaDisplay({ src, type, edit, maxH = 400 }: EditedMediaDisplayProps) {
  const filterCss = buildFilter(edit);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(edit.videoMuted);
  const progressRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showCtrl, setShowCtrl] = useState(true);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { v.play().catch(() => {}); }
      else { v.pause(); }
    }, { threshold: 0.4 });
    obs.observe(v);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = edit.videoSpeed;
  }, [edit.videoSpeed]);

  function revealCtrl() {
    setShowCtrl(true);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    fadeRef.current = setTimeout(() => setShowCtrl(false), 3000);
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
    revealCtrl();
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    revealCtrl();
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * v.duration;
    revealCtrl();
  }

  function fmt(s: number) {
    if (!isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  const ctrlVisible = showCtrl || !playing;

  if (type === "image") {
    const imgCropStyle = getAspectStyle(edit.cropRatio);
    return (
      <div className="relative overflow-hidden" style={{ ...imgCropStyle, maxHeight: maxH }}>
        <img src={src} alt="" className="w-full h-full block object-cover"
          style={{ maxHeight: maxH, filter: filterCss !== "none" ? filterCss : undefined }} />
        {edit.vignette > 0 && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${edit.vignette / 100}) 100%)` }} />
        )}
        {edit.texts.map((t) => (
          <div key={t.id} className="absolute" style={{ left: `${t.x}%`, top: `${t.y}%`, pointerEvents: "none" }}>
            <p style={{
              fontFamily: t.fontCss, fontSize: t.sizePx, color: t.color,
              fontWeight: t.bold ? "bold" : "normal", fontStyle: t.italic ? "italic" : "normal",
              textShadow: t.shadow ? "0 2px 8px rgba(0,0,0,0.9)" : "none",
              WebkitTextStroke: t.outline ? "1.5px rgba(0,0,0,0.8)" : "none",
              whiteSpace: "nowrap",
            }}>{t.text}</p>
          </div>
        ))}
        {edit.stickers.map((s) => (
          <div key={s.id} className="absolute pointer-events-none"
            style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: s.sizePx, transform: `rotate(${s.rotation}deg)` }}>
            {s.emoji}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative w-full bg-black select-none"
      style={{ maxHeight: maxH, overflow: "hidden" }}
      onClick={togglePlay}
      onMouseMove={revealCtrl}
      onTouchStart={revealCtrl}>
      <video ref={videoRef} src={src} muted={muted} playsInline loop preload="metadata"
        className="w-full block object-cover"
        style={{ maxHeight: maxH, filter: filterCss !== "none" ? filterCss : undefined }}
        onTimeUpdate={() => { const v = videoRef.current; if (!v?.duration) return; setCurrentTime(v.currentTime); setProgress((v.currentTime / v.duration) * 100); }}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)} />
      {edit.vignette > 0 && <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${edit.vignette / 100}) 100%)` }} />}
      {edit.texts.map((t) => (
        <div key={t.id} className="absolute pointer-events-none" style={{ left: `${t.x}%`, top: `${t.y}%` }}>
          <p style={{ fontFamily: t.fontCss, fontSize: t.sizePx, color: t.color, fontWeight: t.bold ? "bold" : "normal", fontStyle: t.italic ? "italic" : "normal", textShadow: t.shadow ? "0 2px 8px rgba(0,0,0,0.9)" : "none", whiteSpace: "nowrap" }}>{t.text}</p>
        </div>
      ))}
      {edit.stickers.map((s) => (
        <div key={s.id} className="absolute pointer-events-none" style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: s.sizePx, transform: `rotate(${s.rotation}deg)` }}>{s.emoji}</div>
      ))}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(4px)" }}>
            <Play className="h-8 w-8 text-white" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 transition-opacity duration-300"
        style={{ opacity: ctrlVisible ? 1 : 0, background: "linear-gradient(transparent,rgba(0,0,0,0.72))", pointerEvents: ctrlVisible ? "auto" : "none" }}>
        <div ref={progressRef} className="mx-3 mt-2 mb-1 h-1.5 rounded-full cursor-pointer"
          style={{ background: "rgba(255,255,255,0.3)" }} onClick={handleSeek}>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#fff" }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white">
              {playing ? <Play className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <span className="text-white text-xs tabular-nums" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>
          <button onClick={toggleMute} className="text-white">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {muted && playing && progress < 5 && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-semibold pointer-events-none"
          style={{ background: "rgba(0,0,0,0.55)" }}>
          <VolumeX className="h-3.5 w-3.5" /> Toca para som
        </div>
      )}
    </div>
  );
}
