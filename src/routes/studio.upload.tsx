import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, Video as VideoIcon, X, Image as ImageIcon,
  Globe, Lock, Link as LinkIcon, Calendar,
  CheckCircle, Info,
} from "lucide-react";
import { toast } from "sonner";
import { uploadToCloudinary } from "@/lib/cloudinary";

export const Route = createFileRoute("/studio/upload")({
  head: () => ({ meta: [{ title: "Enviar vídeo — Hooda Studio" }] }),
  component: UploadPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";
const ACCEPT_VIDEO = ["video/mp4","video/quicktime","video/webm","video/x-matroska"];
const ACCEPT_IMG   = ["image/jpeg","image/png","image/webp","image/gif"];
const MAX_VIDEO      = 500 * 1024 * 1024;  // 500 MB — limite Cloudinary free
const MAX_IMG        = 5   * 1024 * 1024;

type Step       = "drop" | "details" | "uploading" | "done";
type Visibility = "public" | "private" | "unlisted" | "scheduled";

/* ── Extrai duração via HTMLVideoElement ─────────────────── */
function getVideoDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const vid  = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(vid.duration) || null); };
    vid.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    vid.src = url;
  });
}


function UploadPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { data: channel } = useQuery(myChannelQuery());

  const [step,         setStep]         = useState<Step>("drop");
  const [videoFile,    setVideoFile]    = useState<File | null>(null);
  const [thumbFile,    setThumbFile]    = useState<File | null>(null);
  const [thumbPrev,    setThumbPrev]    = useState<string>("");
  const [title,        setTitle]        = useState("");
  const [description,  setDescription]  = useState("");
  const [visibility,   setVisibility]   = useState<Visibility>("private");
  const [scheduledAt,  setScheduledAt]  = useState<string>("");
  const [tags,         setTags]         = useState<string[]>([]);
  const [tagInput,     setTagInput]     = useState("");
  const [progress,     setProgress]     = useState(0);
  const [progLabel,    setProgLabel]    = useState("");
  const [dragging,     setDragging]     = useState(false);
  const [detectedDur,  setDetectedDur]  = useState<number | null>(null);

  const videoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const inputCls = `w-full rounded-xl px-4 py-3 text-sm outline-none transition-all
    border focus:shadow-[0_0_0_3px_rgba(91,63,207,0.12)]
    bg-[var(--s3)] border-[var(--border-default)] focus:border-[#5B3FCF] text-[var(--text-primary)]`;

  /* Sem canal */
  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <VideoIcon className="w-12 h-12 mb-4" style={{ color: "var(--text-muted)" }} />
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Precisas de um canal</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Cria o teu canal antes de enviares vídeos.</p>
        <a href="/studio/onboarding"
          className="px-6 py-2.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: GRAD }}>
          Criar Canal
        </a>
      </div>
    );
  }

  /* Selecciona vídeo */
  const pickVideo = useCallback(async (f: File | null) => {
    if (!f) return;
    if (!ACCEPT_VIDEO.includes(f.type)) { toast.error("Formato não suportado. Usa MP4, MOV, WEBM ou MKV."); return; }
    if (f.size > MAX_VIDEO) { toast.error("O vídeo não pode ter mais de 500 MB."); return; }
    setVideoFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    /* Detecta duração em background */
    getVideoDuration(f).then(dur => setDetectedDur(dur));
    setStep("details");
  }, [title]);

  /* Selecciona thumbnail */
  function pickThumb(f: File | null) {
    if (!f) return;
    if (!ACCEPT_IMG.includes(f.type)) { toast.error("Usa JPG, PNG ou WebP para a miniatura."); return; }
    if (f.size > MAX_IMG) { toast.error("A miniatura não pode ter mais de 5 MB."); return; }
    setThumbFile(f);
    const reader = new FileReader();
    reader.onload = e => setThumbPrev(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  /* Tags */
  function addTag(val: string) {
    const t = val.trim().replace(/^#/, "").toLowerCase();
    if (t && tags.length < 15 && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput("");
  }
  function removeTag(t: string) { setTags(p => p.filter(x => x !== t)); }

  /* UPLOAD */
  async function handleUpload() {
    if (!videoFile || !channel || !title.trim()) {
      toast.error("Preenche o título antes de publicar."); return;
    }
    if (visibility === "scheduled" && !scheduledAt) {
      toast.error("Escolhe a data e hora de publicação."); return;
    }
    setStep("uploading");
    try {
      const { data: ud } = await supabase.auth.getUser();
      const uid     = ud.user!.id;
      const videoId = crypto.randomUUID();

      /* 1 — Duração */
      const duration = detectedDur ?? await getVideoDuration(videoFile);

      /* 2 — Upload para Cloudinary */
      setProgress(5);
      setProgLabel("A enviar para Cloudinary…");
      const cloudResult = await uploadToCloudinary(
        videoFile,
        { title: title.trim(), channelId: channel.id, userId: uid },
        pct => setProgress(5 + Math.round(pct * 0.75)),
      );
      setProgress(80); setProgLabel("A processar o vídeo…");

      /* 3 — Thumbnail */
      let thumbnailUrl: string = cloudResult.thumbnailUrl;
      if (thumbFile) {
        setProgLabel("A enviar miniatura…");
        const tExt  = thumbFile.name.split(".").pop() ?? "jpg";
        const tPath = `${uid}/${videoId}-thumb.${tExt}`;
        const { error: tErr } = await supabase.storage
          .from("thumbnails")
          .upload(tPath, thumbFile, { cacheControl: "3600", upsert: false, contentType: thumbFile.type });
        if (!tErr) {
          const { data: tUrl } = supabase.storage.from("thumbnails").getPublicUrl(tPath);
          thumbnailUrl = tUrl.publicUrl;
        }
      }
      setProgress(88); setProgLabel("A guardar informações…");

      /* 4 — Inserir na DB */
      const isScheduled = visibility === "scheduled";
      const publishedAt = isScheduled
        ? (scheduledAt ? new Date(scheduledAt).toISOString() : null)
        : (visibility === "public" ? new Date().toISOString() : null);

      const { error: iErr } = await (supabase as any).from("videos").insert({
        id:               videoId,
        channel_id:       channel.id,
        owner_id:         uid,
        title:            title.trim(),
        description:      description.trim() || null,
        video_path:       cloudResult.publicId,
        cf_stream_uid:    null,
        cf_stream_url:    cloudResult.playbackUrl,
        cf_embed_url:     null,
        thumbnail_url:    thumbnailUrl,
        duration_seconds: cloudResult.duration ?? detectedDur,
        tags:             tags.length ? tags : null,
        status:           isScheduled ? "processing" : "published",
        visibility:       isScheduled ? "private" : visibility as any,
        published_at:     publishedAt,
        views_count:      0,
        likes_count:      0,
      });

      if (iErr) throw iErr;

      setProgress(100); setProgLabel("Concluído!");
      qc.invalidateQueries({ queryKey: ["my-videos"] });
      qc.invalidateQueries({ queryKey: ["channel-stats"] });
      qc.invalidateQueries({ queryKey: ["htv-videos"] });

      setTimeout(() => {
        setStep("done");
        toast.success(isScheduled ? "Vídeo agendado!" : "Vídeo publicado com sucesso!");
      }, 600);

    } catch (e: any) {
      console.error("[Upload] Erro:", e);
      const msg = e?.message ?? e?.error_description ?? JSON.stringify(e) ?? "Falha no upload.";
      toast.error(msg, { duration: 8000 });
      setStep("details");
      setProgress(0);
    }
  }

  /* ══ STEP: DROP ══ */
  if (step === "drop") return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Enviar vídeo</h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        O teu vídeo vai aparecer no canal <span style={{ color: P, fontWeight: 600 }}>{channel.name}</span> na HoodaTV.
      </p>
      <div
        className="rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center py-20 px-8 cursor-pointer transition-all"
        style={{ borderColor: dragging ? P : "var(--border-default)", background: dragging ? `${P}08` : "var(--s2)" }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); pickVideo(e.dataTransfer.files[0]); }}
        onClick={() => videoRef.current?.click()}
      >
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: dragging ? GRAD : `${P}15` }}>
          <Upload className="w-9 h-9" style={{ color: dragging ? "#fff" : P }} />
        </div>
        <h2 className="text-lg font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Arrasta o teu vídeo aqui</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Os vídeos ficam privados até publicares.</p>
        <button
          className="px-8 py-3 rounded-2xl text-white font-bold text-sm transition-all hover:-translate-y-0.5 active:scale-95"
          style={{ background: GRAD, boxShadow: "0 4px 16px rgba(91,63,207,0.3)" }}
          onClick={e => { e.stopPropagation(); videoRef.current?.click(); }}>
          Selecionar ficheiro
        </button>
        <p className="text-xs mt-5" style={{ color: "var(--text-muted)" }}>
          MP4 · MOV · WEBM · MKV &nbsp;·&nbsp; Até 500 MB via Cloudinary
        </p>
        <input ref={videoRef} type="file" accept={ACCEPT_VIDEO.join(",")} className="hidden"
          onChange={e => pickVideo(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );

  /* ══ STEP: UPLOADING ══ */
  if (step === "uploading") return (
    <div className="max-w-lg mx-auto px-5 py-16 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: GRAD }}>
        <Upload className="w-9 h-9 text-white animate-bounce" />
      </div>
      <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>A enviar o vídeo…</h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>{progLabel}</p>
      <div className="w-full rounded-full overflow-hidden h-3 mb-2" style={{ background: "var(--s3)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: GRAD }} />
      </div>
      <p className="text-sm font-bold" style={{ color: P }}>{progress}%</p>
      {detectedDur && (
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Duração detectada: {fmtDuration(detectedDur)}
        </p>
      )}
      {videoFile && videoFile.size > MAX_VIDEO && (
        <p className="text-xs mt-2 font-semibold" style={{ color: "#F97316" }}>
          Upload resumível activo — podes perder ligação e retomar.
        </p>
      )}
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Não feches esta janela.</p>
    </div>
  );

  /* ══ STEP: DONE ══ */
  if (step === "done") return (
    <div className="max-w-lg mx-auto px-5 py-16 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: "#d1fae5" }}>
        <CheckCircle className="w-10 h-10" style={{ color: "#10b981" }} />
      </div>
      <h2 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
        {visibility === "scheduled" ? "Vídeo agendado!" : "Vídeo publicado!"}
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        {visibility === "public"
          ? "O teu vídeo já está visível na HoodaTV."
          : visibility === "scheduled"
          ? `O vídeo será publicado automaticamente em ${scheduledAt ? new Date(scheduledAt).toLocaleString("pt-PT") : "breve"}.`
          : "O vídeo está guardado como privado. Podes torná-lo público a qualquer momento."}
      </p>
      <div className="flex gap-3">
        <button onClick={() => { setStep("drop"); setVideoFile(null); setThumbFile(null); setThumbPrev("");
            setTitle(""); setDescription(""); setTags([]); setVisibility("private");
            setProgress(0); setDetectedDur(null); setScheduledAt(""); }}
          className="px-6 py-2.5 rounded-2xl text-sm font-bold border transition"
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
          Enviar outro
        </button>
        <button onClick={() => navigate({ to: "/studio/content" })}
          className="px-6 py-2.5 rounded-2xl text-sm font-bold text-white transition hover:-translate-y-0.5"
          style={{ background: GRAD }}>
          Ver conteúdo
        </button>
      </div>
    </div>
  );

  /* ══ STEP: DETAILS ══ */
  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => { setStep("drop"); setVideoFile(null); }}
          className="p-2 rounded-xl transition hover:bg-[var(--s3)]"
          style={{ color: "var(--text-secondary)" }}>
          <X className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Detalhes do vídeo</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Preenche a informação para o teu vídeo aparecer bem na HoodaTV
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Campos principais ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Banner do ficheiro */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
            style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
            <VideoIcon className="w-5 h-5 shrink-0" style={{ color: P }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{videoFile?.name}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) : 0} MB
                {detectedDur && <> · {fmtDuration(detectedDur)}</>}
              </p>
            </div>
            <button onClick={() => { setStep("drop"); setVideoFile(null); setDetectedDur(null); }}
              className="p-1.5 rounded-lg transition hover:bg-[var(--s3)]"
              style={{ color: "var(--text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>




          {/* Título */}
          <div>
            <label className="block text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Título <span style={{ color: "#E94B8A" }}>*</span>
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
              placeholder="Um título que chame a atenção…" className={inputCls} />
            <p className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{title.length}/120</p>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Descrição
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              maxLength={5000} rows={5}
              placeholder="Fala sobre o teu vídeo, adiciona links relevantes, créditos…"
              className={inputCls + " resize-none"} />
            <p className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{description.length}/5000</p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Tags <span className="text-[11px] font-normal normal-case">(máx. 15)</span>
            </label>
            <div className="rounded-xl border p-3 flex flex-wrap gap-2 min-h-[52px]"
              style={{ background: "var(--s3)", borderColor: "var(--border-default)" }}>
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: `${P}15`, color: P }}>
                  #{t}
                  <button onClick={() => removeTag(t)} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {tags.length < 15 && (
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                    if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
                  }}
                  placeholder={tags.length === 0 ? "Adiciona tags e prime Enter…" : ""}
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
                  style={{ color: "var(--text-primary)" }} />
              )}
            </div>
          </div>

          {/* Visibilidade */}
          <div>
            <label className="block text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Visibilidade
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { key: "public",    icon: Globe,    label: "Público",   desc: "Visível na HoodaTV" },
                { key: "unlisted",  icon: LinkIcon, label: "Com link",  desc: "Só com o link" },
                { key: "private",   icon: Lock,     label: "Privado",   desc: "Só tu podes ver" },
                { key: "scheduled", icon: Calendar, label: "Agendado",  desc: "Publica na data" },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const sel  = visibility === opt.key;
                return (
                  <button key={opt.key} onClick={() => setVisibility(opt.key)}
                    className="flex flex-col items-center gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-center"
                    style={{ borderColor: sel ? P : "var(--border-default)", background: sel ? `${P}08` : "var(--s3)" }}>
                    <Icon className="w-5 h-5" style={{ color: sel ? P : "var(--text-muted)" }} />
                    <span className="text-xs font-bold" style={{ color: sel ? P : "var(--text-primary)" }}>{opt.label}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Date picker para agendado */}
            {visibility === "scheduled" && (
              <div className="mt-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Data e hora de publicação
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  onChange={e => setScheduledAt(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna direita: thumbnail + publish ── */}
        <div className="space-y-5">

          {/* Thumbnail */}
          <div>
            <label className="block text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Miniatura
            </label>
            <div
              className="relative aspect-video rounded-2xl overflow-hidden border-2 border-dashed cursor-pointer transition-all flex items-center justify-center"
              style={{ background: thumbPrev ? "transparent" : "var(--s3)", borderColor: thumbPrev ? P : "var(--border-default)" }}
              onClick={() => thumbRef.current?.click()}>
              {thumbPrev
                ? <img src={thumbPrev} alt="" className="w-full h-full object-cover" />
                : (
                  <div className="flex flex-col items-center gap-2 text-center p-4">
                    <ImageIcon className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
                    <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Carregar miniatura</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>JPG, PNG ou WebP · Máx 5 MB</p>
                  </div>
                )}
              {thumbPrev && (
                <button
                  onClick={e => { e.stopPropagation(); setThumbFile(null); setThumbPrev(""); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white"
                  style={{ background: "rgba(0,0,0,0.6)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input ref={thumbRef} type="file" accept={ACCEPT_IMG.join(",")} className="hidden"
              onChange={e => pickThumb(e.target.files?.[0] ?? null)} />
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>Recomendado: 1280×720 px (16:9)</p>
          </div>

          {/* Resumo */}
          <div className="rounded-2xl p-4 border space-y-3"
            style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
            <p className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Resumo</p>
            <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <div className="flex justify-between">
                <span>Canal</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{channel.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Visibilidade</span>
                <span className="font-semibold" style={{ color: visibility === "public" ? "#10b981" : visibility === "scheduled" ? "#F97316" : "var(--text-primary)" }}>
                  {visibility === "public" ? "Público" : visibility === "unlisted" ? "Com link" : visibility === "scheduled" ? "Agendado" : "Privado"}
                </span>
              </div>
              {detectedDur && (
                <div className="flex justify-between">
                  <span>Duração</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{fmtDuration(detectedDur)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tamanho</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) + " MB" : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Miniatura</span>
                <span className="font-semibold" style={{ color: thumbPrev ? "#10b981" : "var(--text-muted)" }}>
                  {thumbPrev ? "Definida ✓" : "Não definida"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tags</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {tags.length} tag{tags.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Botão publicar */}
          <button
            onClick={handleUpload}
            disabled={!title.trim() || (visibility === "scheduled" && !scheduledAt)}
            className="w-full h-12 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            style={{ background: GRAD, boxShadow: "0 4px 20px rgba(91,63,207,0.3)" }}>
            <Upload className="w-4 h-4" />
            {visibility === "public" ? "Publicar na HoodaTV"
              : visibility === "scheduled" ? "Agendar publicação"
              : "Guardar vídeo"}
          </button>

          {!title.trim() && (
            <div className="flex items-center gap-2 text-xs rounded-xl p-2.5" style={{ background: "#FEF9C3", color: "#854D0E" }}>
              <Info className="w-3.5 h-3.5 shrink-0" />
              Preenche o título para continuar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtDuration(s: number) {
  if (s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
