import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCloudinary, uploadImageToCloudinary } from "@/lib/cloudinary";
import { useEffect, useRef, useState } from "react";
import {
  FileText, Image as ImageIcon, Video as VideoIcon, BarChart3,
  Upload, X, Calendar, Send, Save, Loader2, Hash, Globe,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/criar")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: CreatePage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";
const MAX_VIDEO_DURATION = 480; // 8 min

type Kind = "text" | "image" | "video" | "poll";
type Visibility = "public" | "private" | "unlisted";

function getVideoDuration(file: File): Promise<number> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); res(Math.round(v.duration) || 0); };
    v.onerror = () => { URL.revokeObjectURL(url); res(0); };
    v.src = url;
  });
}

function CreatePage() {
  const navigate = useNavigate();
  const { data: channel } = useQuery(myChannelQuery());

  const [kind, setKind] = useState<Kind>("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("public");

  const MAX_PHOTOS = 10;
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>("");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string>("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollDurationDays, setPollDurationDays] = useState<1 | 3 | 7>(3);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("kind") === "poll") setKind("poll");
  }, []);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  function addHashtag() {
    const clean = hashtagInput.replace(/^#/, "").trim();
    if (!clean || hashtags.includes(clean)) { setHashtagInput(""); return; }
    setHashtags(h => [...h, clean]);
    setHashtagInput("");
  }

  async function onImages(files: File[]) {
    const room = MAX_PHOTOS - imageFiles.length;
    const accepted: File[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`"${f.name}" é maior que 10 MB — ignorada.`); continue; }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setImageFiles(prev => [...prev, ...accepted]);
    setImagePreviews(prev => [...prev, ...accepted.map(f => URL.createObjectURL(f))]);
  }

  function removeImageAt(i: number) {
    setImageFiles(prev => prev.filter((_, idx) => idx !== i));
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
  }

  async function onVideo(f: File) {
    if (f.size > 500 * 1024 * 1024) { toast.error("Vídeo tem de ser inferior a 500 MB."); return; }
    const dur = await getVideoDuration(f);
    if (dur > MAX_VIDEO_DURATION) {
      toast.error("Duração máxima permitida: 8 minutos.");
      return;
    }
    setVideoFile(f);
    setVideoPreview(URL.createObjectURL(f));
  }

  function scheduledAtISO(): string | null {
    if (!scheduleEnabled) return null;
    if (!scheduleDate || !scheduleTime) return null;
    const dt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  async function handleSubmit(mode: "publish" | "schedule" | "draft") {
    if (busy) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { toast.error("Sessão expirou."); return; }
    const { data: prof } = await supabase.from("profiles").select("username,full_name,avatar_url").eq("id", uid).maybeSingle();
    if (!prof) { toast.error("Perfil não encontrado."); return; }

    if (kind === "text" && !description.trim() && !title.trim()) { toast.error("Escreve algo."); return; }
    if (kind === "image" && imageFiles.length === 0) { toast.error("Adiciona uma imagem."); return; }
    if (kind === "video" && !videoFile) { toast.error("Adiciona um vídeo."); return; }
    if (kind === "poll" && !pollQuestion.trim()) { toast.error("Escreve a pergunta da enquete."); return; }
    if (kind === "poll" && pollOptions.filter(o => o.trim()).length < 2) { toast.error("Adiciona pelo menos 2 opções."); return; }

    let schedISO: string | null = null;
    if (mode === "schedule") {
      schedISO = scheduledAtISO();
      if (!schedISO) { toast.error("Escolhe data e hora válidas."); return; }
      if (new Date(schedISO).getTime() <= Date.now()) { toast.error("Data tem de ser no futuro."); return; }
    }

    setBusy(true);
    setProgress(0);
    try {
      const payload: Record<string, any> = {
        author_id: uid,
        author_username: prof.username || "user",
        author_name: prof.full_name || prof.username || "Utilizador",
        author_color: "#5B3FCF",
        content: description || title || "",
        title: title.trim() || null,
        hashtags: hashtags.length ? hashtags : null,
        kind: kind === "poll" ? "post" : (kind === "video" ? "video" : "post"),
        visibility,
        is_draft: mode === "draft",
        scheduled_at: schedISO,
        channel_id: channel?.id ?? null,
        channel_handle: channel?.handle ?? null,
        channel_name: channel?.name ?? null,
        channel_avatar: channel?.avatar_url ?? null,
      };

      if (kind === "image" && imageFiles.length > 0) {
        const urls: string[] = [];
        const total = imageFiles.length;
        for (let i = 0; i < total; i++) {
          const { url } = await uploadImageToCloudinary(
            imageFiles[i],
            `hooda/posts/${uid}`,
            p => setProgress(Math.round(((i + p / 100) / total) * 100)),
          );
          urls.push(url);
        }
        payload.photo_url = urls[0];
        payload.photos = urls;
      }
      if (kind === "video" && videoFile) {
        const res = await uploadToCloudinary(videoFile, {
          title: title || "video", channelId: channel?.id ?? "", userId: uid,
        }, p => setProgress(p));
        payload.video_url = res.playbackUrl;
        payload.thumbnail_url = thumbPreview ? undefined : res.thumbnailUrl;
      }
      if (thumbFile) {
        setProgress(0);
        const { url } = await uploadImageToCloudinary(thumbFile, `hooda/thumbs/${uid}`, p => setProgress(p));
        payload.thumbnail_url = url;
      }
      if (kind === "poll") {
        payload.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()).map(o => o.trim()),
        };
        payload.poll_ends_at = new Date(Date.now() + pollDurationDays * 86400000).toISOString();
        payload.content = description || pollQuestion.trim();
      }

      const { data: inserted, error } = await supabase.from("posts").insert(payload).select("id").single();
      if (error) throw error;

      if (mode === "draft") toast.success("Rascunho guardado.");
      else if (mode === "schedule") toast.success("Publicação agendada!");
      else toast.success("Publicado!");

      if (mode === "schedule") navigate({ to: "/studio/agenda" as any });
      else if (mode === "draft") navigate({ to: "/studio/biblioteca" as any });
      else navigate({ to: `/post/${inserted.id}` as any });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Erro ao publicar.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  const kinds: { k: Kind; label: string; icon: any }[] = [
    { k: "text",  label: "Texto",   icon: FileText },
    { k: "image", label: "Imagem",  icon: ImageIcon },
    { k: "video", label: "Vídeo",   icon: VideoIcon },
    { k: "poll",  label: "Enquete", icon: BarChart3 },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Criar Publicação</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Publica no feed, guarda como rascunho ou agenda.</p>
      </div>

      {/* Kind selector */}
      <div className="grid grid-cols-4 gap-2">
        {kinds.map(({ k, label, icon: Icon }) => {
          const active = kind === k;
          return (
            <button key={k} onClick={() => setKind(k)}
              className="flex flex-col items-center gap-2 py-3 rounded-2xl text-xs font-semibold transition active:scale-95"
              style={{
                background: active ? GRAD : "var(--s0)",
                border: active ? "none" : "1px solid var(--border-subtle)",
                color: active ? "#fff" : "var(--text-secondary)",
              }}>
              <Icon className="h-5 w-5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>TÍTULO</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder="Dá um título à publicação"
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>DESCRIÇÃO</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000}
            placeholder={kind === "text" ? "O que estás a pensar?" : "Descreve a publicação…"}
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition resize-none"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>

        {/* Media area */}
        {kind === "image" && (
          <div>
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              IMAGENS {imagePreviews.length > 0 ? `(${imagePreviews.length}/${MAX_PHOTOS})` : ""}
            </label>
            <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) onImages(files); e.currentTarget.value = ""; }} />
            {imagePreviews.length > 0 ? (
              <div className="mt-1 grid grid-cols-3 gap-2">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "1/1", background: "var(--s2)" }}>
                    <img src={src} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => removeImageAt(i)}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {imagePreviews.length < MAX_PHOTOS && (
                  <button onClick={() => imgRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed transition hover:opacity-80"
                    style={{ aspectRatio: "1/1", borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                    <Upload className="h-5 w-5" />
                    <span className="text-xs font-semibold">Adicionar</span>
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => imgRef.current?.click()}
                className="mt-1 w-full py-10 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 transition hover:opacity-80"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                <Upload className="h-6 w-6" />
                <span className="text-sm font-semibold">Adicionar imagens</span>
                <span className="text-xs">Máx. 10 MB cada · até {MAX_PHOTOS} fotos</span>
              </button>
            )}
          </div>
        )}

        {kind === "video" && (
          <div>
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>VÍDEO (máx. 8 min)</label>
            <input ref={vidRef} type="file" accept="video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onVideo(f); e.currentTarget.value = ""; }} />
            {videoPreview ? (
              <div className="relative mt-1 rounded-2xl overflow-hidden" style={{ background: "#000" }}>
                <video src={videoPreview} controls className="w-full max-h-96" />
                <button onClick={() => { setVideoFile(null); setVideoPreview(""); }}
                  className="absolute top-3 right-3 h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => vidRef.current?.click()}
                className="mt-1 w-full py-10 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 transition hover:opacity-80"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                <VideoIcon className="h-6 w-6" />
                <span className="text-sm font-semibold">Adicionar vídeo</span>
                <span className="text-xs">Máx. 500 MB · 8 minutos</span>
              </button>
            )}

            {/* Thumbnail */}
            <div className="mt-3">
              <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>MINIATURA (opcional)</label>
              <input ref={thumbRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setThumbFile(f); setThumbPreview(URL.createObjectURL(f));
                  e.currentTarget.value = "";
                }} />
              <button onClick={() => thumbRef.current?.click()}
                className="mt-1 flex items-center gap-3 px-3 py-2 rounded-xl text-sm border transition"
                style={{ borderColor: "var(--border-default)", background: "var(--s2)", color: "var(--text-secondary)" }}>
                {thumbPreview
                  ? <img src={thumbPreview} className="h-10 w-16 object-cover rounded" alt="" />
                  : <ImageIcon className="h-5 w-5" />}
                {thumbPreview ? "Alterar miniatura" : "Adicionar miniatura"}
              </button>
            </div>
          </div>
        )}

        {kind === "poll" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>PERGUNTA</label>
              <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} maxLength={140}
                placeholder="Ex: Qual concerto vais?"
                className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>

            <div>
              <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>OPÇÕES DA ENQUETE</label>
              <div className="mt-2 space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={opt} onChange={e => {
                      const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next);
                    }} maxLength={80} placeholder={`Opção ${i + 1}`}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                        className="h-9 w-9 rounded-full flex items-center justify-center"
                        style={{ color: "var(--text-muted)" }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button onClick={() => setPollOptions([...pollOptions, ""])}
                    className="text-sm font-semibold" style={{ color: P }}>
                    + Adicionar opção
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>DURAÇÃO</label>
              <div className="mt-2 flex gap-2">
                {([1, 3, 7] as const).map(d => (
                  <button key={d} onClick={() => setPollDurationDays(d)}
                    className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition"
                    style={{
                      borderColor: pollDurationDays === d ? P : "var(--border-default)",
                      background: pollDurationDays === d ? P + "18" : "var(--s2)",
                      color: pollDurationDays === d ? P : "var(--text-secondary)",
                    }}>
                    {d === 1 ? "1 dia" : `${d} dias`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Hashtags */}
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>HASHTAGS</label>
          <div className="mt-1 flex flex-wrap gap-2 mb-2">
            {hashtags.map(h => (
              <button key={h} onClick={() => setHashtags(hashtags.filter(x => x !== h))}
                className="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"
                style={{ background: P + "18", color: P }}>
                #{h} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 flex-1 px-3 rounded-xl border"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
              <Hash className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              <input value={hashtagInput} onChange={e => setHashtagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addHashtag(); } }}
                placeholder="hashtag"
                className="flex-1 py-2.5 text-sm outline-none bg-transparent"
                style={{ color: "var(--text-primary)" }} />
            </div>
            <button onClick={addHashtag} className="px-4 rounded-xl text-sm font-semibold"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>Adicionar</button>
          </div>
        </div>

        {/* Visibility */}
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>PÚBLICO-ALVO</label>
          <div className="mt-2 flex gap-2">
            {([
              { v: "public",   label: "Público",       Icon: Globe },
            ] as const).map(({ v, label, Icon }) => {
              const active = visibility === v;
              return (
                <button key={v} onClick={() => setVisibility(v)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition"
                  style={{
                    background:  active ? P : "var(--s2)",
                    color:       active ? "#fff" : "var(--text-secondary)",
                    borderColor: active ? P : "var(--border-default)",
                  }}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule */}
        <div className="pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={scheduleEnabled}
              onChange={e => setScheduleEnabled(e.target.checked)}
              className="h-4 w-4 rounded" style={{ accentColor: P }} />
            <span className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Calendar className="h-4 w-4" /> Agendar publicação
            </span>
          </label>
          {scheduleEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="px-3 py-2.5 rounded-xl text-sm outline-none border"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm outline-none border"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {busy && progress > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--s2)" }}>
          <div className="h-2 transition-all" style={{ width: `${progress}%`, background: GRAD }} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button onClick={() => handleSubmit("draft")} disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition active:scale-95 disabled:opacity-50"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
          <Save className="h-4 w-4" /> Guardar rascunho
        </button>
        {scheduleEnabled ? (
          <button onClick={() => handleSubmit("schedule")} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
            style={{ background: GRAD }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            {busy ? "A agendar…" : "Agendar"}
          </button>
        ) : (
          <button onClick={() => handleSubmit("publish")} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
            style={{ background: GRAD }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "A publicar…" : "Publicar agora"}
          </button>
        )}
      </div>
    </div>
  );
}
