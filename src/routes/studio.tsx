import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCloudinary, uploadImageToCloudinary } from "@/lib/cloudinary";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Image as ImageIcon, Video as VideoIcon, BarChart3,
  Upload, X, Calendar, Send, Save, Loader2, Hash, Globe, ArrowLeft,
  Search, Filter, Trash2, Edit2, Clock, LayoutGrid, PlusCircle, Users,
  Heart, MessageCircle, Share2, Eye, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FollowListSection } from "@/components/FollowList";
import { UniversalPostCard, normalizePost } from "@/components/UniversalPostCard";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ title: "Hooda Studio" }] }),
  component: StudioPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";
const MAX_VIDEO_DURATION = 480; // 8 min

type Tab = "criar" | "conteudo" | "comunidade";
type Kind = "text" | "image" | "video" | "poll";
type Visibility = "public" | "private" | "unlisted";
type Filt = "all" | "published" | "draft" | "scheduled" | "video" | "image" | "text";

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

function StudioPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("conteudo");

  const navItems: { k: Tab; label: string; icon: any }[] = [
    { k: "conteudo", label: "Conteúdo", icon: LayoutGrid },
    { k: "criar", label: "Criar", icon: PlusCircle },
    { k: "comunidade", label: "Comunidade", icon: Users },
  ];

  return (
    <div className="min-h-screen lg:flex" style={{ background: "var(--s1)" }}>
      {/* Navegação lateral — tablets grandes e PC */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto border-r px-4 py-6"
        style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>
        <button onClick={() => navigate({ to: "/home" as any })}
          className="flex items-center gap-2 mb-8 px-2 py-1.5 -ml-2 rounded-xl transition self-start hover:bg-[var(--s2)]"
          style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-semibold">Voltar</span>
        </button>
        <span className="px-2 mb-8 font-black text-xl tracking-tight" style={{ color: "var(--text-primary)" }}>
          Hooda <span style={{ color: P }}>Studio</span>
        </span>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ k, label, icon: Icon }) => {
            const active = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition text-left active:scale-[0.98]"
                style={{ background: active ? GRAD : "transparent", color: active ? "#fff" : "var(--text-secondary)" }}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="px-2 pt-4 mt-4 border-t text-[11px] leading-relaxed" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          Cria, agenda e acompanha o desempenho do teu conteúdo num só sítio.
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Cabeçalho — telemóvel e tablet estreito */}
        <header className="h-14 sticky top-0 z-40 flex items-center px-3 sm:px-4 gap-2 border-b lg:hidden"
          style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>
          <button onClick={() => navigate({ to: "/home" as any })}
            className="p-2 -ml-1 rounded-full hover:bg-[var(--s2)] transition"
            aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="font-bold text-base shrink-0" style={{ color: "var(--text-primary)" }}>
            Hooda <span style={{ color: P }}>Studio</span>
          </span>
          <div className="flex-1" />
          <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--s2)" }}>
            {navItems.map(({ k, label }) => (
              <button key={k} onClick={() => setTab(k)}
                className="px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition"
                style={{ background: tab === k ? P : "transparent", color: tab === k ? "#fff" : "var(--text-secondary)" }}>
                {label}
              </button>
            ))}
          </div>
        </header>

        {tab === "criar" ? <CriarTab onDone={() => setTab("conteudo")} /> : tab === "comunidade" ? <ComunidadeTab /> : <ConteudoTab onCriar={() => setTab("criar")} />}
      </div>
    </div>
  );
}

/* ══════════════════════════ CRIAR ══════════════════════════ */

function CriarTab({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();

  const [kind, setKind] = useState<Kind>("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [previewAuthor, setPreviewAuthor] = useState<{ name: string; username: string; avatarUrl: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("username,full_name,avatar_url").eq("id", uid).maybeSingle();
      if (prof) setPreviewAuthor({
        name: (prof as any).full_name || (prof as any).username || "Tu",
        username: (prof as any).username ?? "",
        avatarUrl: (prof as any).avatar_url ?? null,
      });
    })();
  }, []);

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
          title: title || "video", channelId: uid, userId: uid,
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

      if (mode !== "draft" && inserted?.id) {
        supabase.functions.invoke("moderate-content", { body: { postId: inserted.id } })
          .catch(err => console.error("Erro na moderação automática:", err));
        supabase.functions.invoke("classify-content", { body: { postId: inserted.id } })
          .catch(err => console.error("Erro na classificação automática:", err));
      }

      if (mode === "draft") toast.success("Rascunho guardado.");
      else if (mode === "schedule") toast.success("Publicação agendada!");
      else toast.success("Publicado!");

      if (mode === "publish") navigate({ to: `/post/${inserted.id}` as any });
      else onDone();
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
    <div className="max-w-3xl lg:max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8">
      <div className="mb-5 hidden sm:block">
        <h1 className="text-2xl lg:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Criar</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Publica agora, guarda um rascunho ou agenda para mais tarde.</p>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start">
        <div className="space-y-5 min-w-0">
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

        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>TÍTULO</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder="Dá um título à publicação"
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>DESCRIÇÃO</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000}
            placeholder={kind === "text" ? "O que estás a pensar?" : "Descreve a publicação…"}
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition resize-none"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>

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

        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>PÚBLICO-ALVO</label>
          <div className="mt-2 flex gap-2">
            {([{ v: "public", label: "Público", Icon: Globe }] as const).map(({ v, label, Icon }) => {
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
        </div>

        {/* Pré-visualização ao vivo — só em ecrãs grandes, onde há espaço de sobra */}
        <div className="hidden lg:block lg:sticky lg:top-6">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Sparkles className="h-3.5 w-3.5" /> Pré-visualização
          </p>
          <LivePreviewCard
            author={previewAuthor}
            kind={kind}
            title={title}
            description={description}
            hashtags={hashtags}
            imagePreviews={imagePreviews}
            videoPreview={videoPreview}
            pollQuestion={pollQuestion}
            pollOptions={pollOptions}
          />
        </div>
      </div>

      {/* Barra de ações — fixa no fundo em telemóvel/tablet para nunca ficar fora de alcance */}
      <div className="fixed lg:static bottom-0 inset-x-0 lg:mt-5 z-30 px-4 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:p-0"
        style={{ background: "var(--s1)", boxShadow: "0 -8px 24px -12px rgba(0,0,0,0.15)" }}>
        <div className="max-w-3xl lg:max-w-none mx-auto space-y-2">
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
      </div>
    </div>
  );
}

/* ── Cartão de pré-visualização ao vivo (Criar → coluna direita em ecrãs grandes) ── */
function LivePreviewCard({ author, kind, title, description, hashtags, imagePreviews, videoPreview, pollQuestion, pollOptions }: {
  author: { name: string; username: string; avatarUrl: string | null } | null;
  kind: Kind;
  title: string;
  description: string;
  hashtags: string[];
  imagePreviews: string[];
  videoPreview: string;
  pollQuestion: string;
  pollOptions: string[];
}) {
  const displayName = author?.name || "Tu";
  const initial = (displayName[0] ?? "?").toUpperCase();
  const hasContent = title.trim() || description.trim() || imagePreviews.length > 0 || videoPreview || pollQuestion.trim();

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-sm"
          style={{ background: author?.avatarUrl ? "transparent" : P }}>
          {author?.avatarUrl ? <img src={author.avatarUrl} className="w-full h-full object-cover" alt="" /> : initial}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{displayName}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>agora mesmo</p>
        </div>
      </div>

      {!hasContent ? (
        <div className="px-4 pb-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Começa a escrever para veres aqui o aspeto da tua publicação.
        </div>
      ) : (
        <div className="px-4 pb-3 space-y-2.5">
          {title.trim() && <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{title}</p>}
          {(kind === "poll" ? pollQuestion : description).trim() && (
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
              {kind === "poll" ? pollQuestion : description}
            </p>
          )}

          {kind === "image" && imagePreviews.length > 0 && (
            <div className={`grid gap-1 rounded-2xl overflow-hidden ${imagePreviews.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {imagePreviews.slice(0, 4).map((src, i) => (
                <div key={i} className="relative" style={{ aspectRatio: imagePreviews.length === 1 ? "16/10" : "1/1", background: "var(--s2)" }}>
                  <img src={src} className="w-full h-full object-cover" alt="" />
                  {i === 3 && imagePreviews.length > 4 && (
                    <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm" style={{ background: "rgba(0,0,0,0.5)" }}>
                      +{imagePreviews.length - 4}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {kind === "video" && videoPreview && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#000" }}>
              <video src={videoPreview} muted controls className="w-full max-h-56 object-contain" />
            </div>
          )}

          {kind === "poll" && pollOptions.some(o => o.trim()) && (
            <div className="space-y-1.5">
              {pollOptions.filter(o => o.trim()).map((o, i) => (
                <div key={i} className="relative rounded-xl px-3 py-2 text-xs font-semibold overflow-hidden"
                  style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
                  {o}
                </div>
              ))}
            </div>
          )}

          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {hashtags.map(h => (
                <span key={h} className="text-xs font-semibold" style={{ color: P }}>#{h}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-5 px-4 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        {[Heart, MessageCircle, Share2].map((Icon, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            <Icon className="h-4 w-4" /> 0
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════ CONTEÚDO (+ agenda) ══════════════════════════ */

function ConteudoTab({ onCriar }: { onCriar: () => void }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [author, setAuthor] = useState<{ id: string; username: string; name: string; color: string; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState<Filt>("all");
  const [view, setView] = useState<"grade" | "feed">("grade");
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data: prof } = await supabase.from("profiles").select("username,full_name,avatar_url").eq("id", uid).maybeSingle();
    if (prof) {
      setAuthor({
        id: uid,
        username: (prof as any).username ?? "",
        name: (prof as any).full_name || (prof as any).username || "Utilizador",
        color: "#5B3FCF",
        avatarUrl: (prof as any).avatar_url ?? null,
      });
    }
    const { data } = await (supabase as any).from("posts")
      .select("id,title,content,kind,scheduled_at,is_draft,thumbnail_url,photo_url,photos,video_url,created_at,views_count,likes_count,comments_count,author_id,author_username,author_name,author_color")
      .eq("author_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    setPosts(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return posts.filter(p => {
      if (q && !`${p.title ?? ""} ${p.content ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filt === "draft") return p.is_draft;
      if (filt === "scheduled") return p.scheduled_at && new Date(p.scheduled_at).getTime() > now;
      if (filt === "published") return !p.is_draft && (!p.scheduled_at || new Date(p.scheduled_at).getTime() <= now);
      if (filt === "video") return p.kind === "video" || !!p.video_url;
      if (filt === "image") return !!p.photo_url || (Array.isArray(p.photos) && p.photos.length);
      if (filt === "text") return p.kind !== "video" && !p.photo_url && !(Array.isArray(p.photos) && p.photos.length);
      return true;
    });
  }, [posts, q, filt]);

  async function del(id: string) {
    if (!confirm("Apagar publicação?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Apagada.");
    setPosts(x => x.filter(p => p.id !== id));
  }

  async function publishDraft(id: string) {
    const { error } = await (supabase as any).from("posts").update({ is_draft: false, scheduled_at: null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Publicada!");
    load();
  }

  async function reschedule(id: string) {
    if (!newDate || !newTime) { toast.error("Escolhe data e hora."); return; }
    const iso = new Date(`${newDate}T${newTime}`).toISOString();
    if (new Date(iso).getTime() <= Date.now()) { toast.error("Data tem de ser no futuro."); return; }
    const { error } = await supabase.from("posts").update({ scheduled_at: iso } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Reagendado!");
    setReschedId(null);
    load();
  }

  const chips: { k: Filt; label: string }[] = [
    { k: "all", label: "Tudo" },
    { k: "published", label: "Publicadas" },
    { k: "scheduled", label: "Agendadas" },
    { k: "draft", label: "Rascunhos" },
    { k: "video", label: "Vídeos" },
    { k: "image", label: "Imagens" },
    { k: "text", label: "Texto" },
  ];

  return (
    <div className="max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Conteúdo</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Gere tudo o que publicaste, agendaste ou guardaste.</p>
        </div>
        <button onClick={onCriar}
          className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition shrink-0 flex items-center gap-1.5"
          style={{ background: GRAD }}>
          <PlusCircle className="h-4 w-4" /> Criar
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border lg:w-72 shrink-0"
          style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar…"
            className="flex-1 bg-transparent text-sm outline-none min-w-0" style={{ color: "var(--text-primary)" }} />
        </div>

        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1 min-w-0">
            {chips.map(c => (
              <button key={c.k} onClick={() => setFilt(c.k)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition"
                style={{
                  background: filt === c.k ? P : "var(--s0)",
                  color: filt === c.k ? "#fff" : "var(--text-secondary)",
                  borderColor: filt === c.k ? P : "var(--border-subtle)",
                }}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-1 rounded-full shrink-0" style={{ background: "var(--s2)" }}>
            <button onClick={() => setView("grade")}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition"
              style={{ background: view === "grade" ? P : "transparent", color: view === "grade" ? "#fff" : "var(--text-secondary)" }}>
              Grade
            </button>
            <button onClick={() => setView("feed")}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition"
              style={{ background: view === "feed" ? P : "transparent", color: view === "feed" ? "#fff" : "var(--text-secondary)" }}>
              Feed
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl p-10 text-center"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <Filter className="h-10 w-10 mx-auto mb-3" style={{ color: P }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nada encontrado.</p>
        </div>
      ) : view === "feed" ? (
        <div className="max-w-xl mx-auto space-y-3">
          {filtered.map(p => (
            <UniversalPostCard key={p.id}
              post={normalizePost(
                { ...p, likes: p.likes_count ?? 0, comments: p.comments_count ?? 0 },
                "single",
                author ? { name: author.name, username: author.username, avatarUrl: author.avatarUrl, authorId: author.id } : undefined,
              )} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
          {filtered.map(p => {
            const thumb = p.thumbnail_url || p.photo_url || (Array.isArray(p.photos) && p.photos[0]);
            const scheduled = p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now();
            const Icon = p.kind === "video" ? VideoIcon : (thumb ? ImageIcon : FileText);
            return (
              <div key={p.id} className="rounded-2xl overflow-hidden group transition hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                <div className="aspect-square relative cursor-pointer"
                  style={{ background: "var(--s2)" }}
                  onClick={() => navigate({ to: `/post/${p.id}` as any })}>
                  {thumb
                    ? <img src={thumb} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Icon className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
                      </div>}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {p.is_draft && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(0,0,0,.7)", color: "#fff" }}>RASCUNHO</span>}
                    {scheduled && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: P }}>AGENDADA</span>}
                  </div>
                  {!p.is_draft && !scheduled && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ background: "rgba(0,0,0,.6)" }}>
                      {Number(p.views_count ?? 0).toLocaleString("pt-PT")} vistas
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold line-clamp-1" style={{ color: "var(--text-primary)" }}>
                    {p.title || p.content?.slice(0, 40) || "Sem título"}
                  </p>
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    {scheduled && <Clock className="h-3 w-3" style={{ color: P }} />}
                    {scheduled
                      ? new Date(p.scheduled_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : new Date(p.created_at).toLocaleDateString("pt-PT")}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    {p.is_draft && (
                      <button onClick={() => publishDraft(p.id)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
                        style={{ background: P }}>
                        <Send className="h-3 w-3" /> Publicar
                      </button>
                    )}
                    {scheduled && (
                      <button onClick={() => {
                        setReschedId(reschedId === p.id ? null : p.id);
                        const d = new Date(p.scheduled_at);
                        setNewDate(d.toISOString().slice(0, 10));
                        setNewTime(d.toTimeString().slice(0, 5));
                      }}
                        className="p-1.5 rounded-lg hover:bg-[var(--s2)]" style={{ color: "var(--text-muted)" }} title="Reagendar">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => del(p.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: "#EF4444" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {reschedId === p.id && (
                    <div className="mt-2 pt-2 border-t flex flex-col gap-1.5" style={{ borderColor: "var(--border-subtle)" }}>
                      <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        className="px-2 py-1.5 rounded-lg text-xs border"
                        style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                      <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                        className="px-2 py-1.5 rounded-lg text-xs border"
                        style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                      <button onClick={() => reschedule(p.id)}
                        className="py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: GRAD }}>
                        Guardar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ COMUNIDADE ══════════════════════════ */

type ComunidadeStats = { views: number; likes: number; publications: number };

function ComunidadeTab() {
  const [uid, setUid] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [stats, setStats] = useState<ComunidadeStats>({ views: 0, likes: 0, publications: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const id = sess.session?.user?.id;
      if (!id) { setLoading(false); return; }
      setUid(id);

      const { data: prof } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
      const uname = (prof as any)?.username ?? "";
      setUsername(uname);

      const [{ count: fc }, { count: foc }, { data: postsAgg }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("target_username", uname),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
        (supabase as any).from("posts").select("views_count,likes_count").eq("author_id", id),
      ]);
      setFollowerCount(fc ?? 0);
      setFollowingCount(foc ?? 0);

      const rows = (postsAgg as any[] | null) ?? [];
      setStats({
        publications: rows.length,
        views: rows.reduce((s, r) => s + (r.views_count ?? 0), 0),
        likes: rows.reduce((s, r) => s + (r.likes_count ?? 0), 0),
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} />
      </div>
    );
  }

  const statCards: { label: string; value: number; icon: any }[] = [
    { label: "Publicações", value: stats.publications, icon: FileText },
    { label: "Vistas", value: stats.views, icon: Eye },
    { label: "Curtidas", value: stats.likes, icon: Heart },
  ];

  return (
    <div className="max-w-5xl lg:max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Comunidade</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Acompanhantes, quem acompanhas, e o desempenho geral do teu conteúdo.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        {statCards.map(s => (
          <div key={s.label} className="rounded-2xl p-4 lg:p-5 flex flex-col items-center text-center gap-1"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
            <s.icon className="h-4 w-4 mb-1" style={{ color: P }} />
            <p className="text-xl sm:text-2xl font-black" style={{ color: P }}>{s.value.toLocaleString("pt-PT")}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FollowListSection mode="followers" targetUsername={username} targetUserId={uid ?? ""} title="Acompanhantes" count={followerCount} />
        <FollowListSection mode="following" targetUsername={username} targetUserId={uid ?? ""} title="Acompanhando" count={followingCount} />
      </div>
    </div>
  );
}
