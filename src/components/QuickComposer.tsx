import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image, Film, BarChart3, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary, uploadToCloudinary } from "@/lib/cloudinary";
import { useScrollLock } from "@/hooks/useScrollLock";
import { extractUrl } from "@/lib/linkPreview";
import { LinkPreview } from "@/components/LinkPreview";

const ACCENT = "#5B3FCF";

/** Avatar simples e leve — evita depender de outros ficheiros de rota. */
function MiniAvatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const colors = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, background: src ? "transparent" : color, fontSize: size * 0.4 }}>
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ── Modal de criação de publicação (texto / foto / vídeo) ── */
const MAX_POLL_OPTIONS = 4;

export function QuickPostModal({ name, username, avatarUrl, onClose, onPublished, startWithPoll = false }: {
  name: string; username: string; avatarUrl?: string | null;
  onClose: () => void;
  onPublished: () => void;
  startWithPoll?: boolean;
}) {
  const MAX_PHOTOS = 10;
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "upload" | "saving" | "moderating" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const [pollActive, setPollActive] = useState(startWithPoll);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDurationDays, setPollDurationDays] = useState<1 | 3 | 7>(3);

  function togglePoll() {
    setPollActive((prev) => {
      const next = !prev;
      if (next) {
        setPhotos([]); setPhotoFiles([]);
        setVideoFile(null); setVideoPreview(null);
      }
      return next;
    });
  }

  function updatePollOption(i: number, value: string) {
    setPollOptions((prev) => { const next = [...prev]; next[i] = value; return next; });
  }

  function addPollOption() {
    setPollOptions((prev) => (prev.length < MAX_POLL_OPTIONS ? [...prev, ""] : prev));
  }

  function removePollOption(i: number) {
    setPollOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  useScrollLock();

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = MAX_PHOTOS - photoFiles.length;
    const accepted = picked.slice(0, room);
    setVideoFile(null); setVideoPreview(null);
    setPhotoFiles((prev) => [...prev, ...accepted]);
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotos((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    // permite escolher o mesmo ficheiro outra vez depois de remover
    e.target.value = "";
  }

  function removePhotoAt(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setPhotos([]); setPhotoFiles([]);
    setVideoPreview(URL.createObjectURL(file));
  }

  const canPublish = pollActive
    ? pollQuestion.trim().length > 0 && pollOptions.filter((o) => o.trim()).length >= 2 && !publishing && stage !== "done"
    : (text.trim().length > 0 || photos.length > 0 || !!videoFile) && !publishing && stage !== "done";

  async function publish() {
    if (!canPublish) return;
    setPublishing(true);
    setErr(null);
    setProgress(0);
    setStage("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setErr("É preciso iniciar sessão para publicar."); return; }

      const { data: prof } = await supabase.from("profiles").select("username, full_name").eq("id", session.user.id).maybeSingle();

      const basePayload: Record<string, any> = {
        author_id: session.user.id,
        author_username: prof?.username ?? session.user.email?.split("@")[0] ?? "",
        author_name: prof?.full_name ?? session.user.email ?? "",
        author_color: ACCENT,
        content: text,
        kind: !pollActive && videoFile ? "video" : !pollActive && photoFiles.length > 0 ? "photo" : "post",
      };

      if (pollActive) {
        basePayload.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter((o) => o.trim()).map((o) => o.trim()),
        };
        basePayload.poll_ends_at = new Date(Date.now() + pollDurationDays * 86400000).toISOString();
        basePayload.content = text.trim() || pollQuestion.trim();
      }

      // A publicação entra na BD já — com moderation_status = 'pending' (valor
      // por omissão da coluna). Nesse estado a RLS só deixa o próprio autor
      // vê-la, por isso é seguro disparar a verificação já aqui, ao mesmo
      // tempo que os ficheiros ainda estão a ser enviados: ninguém mais
      // consegue ver o conteúdo entretanto, venha ele a demorar o que
      // demorar. Isto poupa tempo — a IA já está a analisar o texto
      // enquanto a foto/vídeo ainda sobe.
      setStage("saving");
      const { data: inserted, error } = await (supabase as any).from("posts").insert(basePayload).select("id").single();

      if (error) {
        setErr(error.message ?? "Não foi possível publicar. Tenta novamente.");
        return;
      }
      const postId = inserted.id as string;

      const hasMedia = !pollActive && (photoFiles.length > 0 || !!videoFile);
      const earlyModeration = hasMedia
        ? supabase.functions.invoke("moderate-content", { body: { postId } }).catch(err => {
            console.error("Erro na verificação inicial (texto):", err);
          })
        : null;

      let imageUrls: string[] = [];
      let videoUrl: string | null = null;
      let videoThumbUrl: string | null = null;

      if (!pollActive && photoFiles.length > 0) {
        setStage("upload");
        const total = photoFiles.length;
        for (let i = 0; i < total; i++) {
          const { url } = await uploadImageToCloudinary(
            photoFiles[i],
            `hooda/posts/${session.user.id}`,
            (pct) => setProgress(Math.round(((i + pct / 100) / total) * 100)),
          );
          imageUrls.push(url);
        }
        setProgress(100);
      }
      if (!pollActive && videoFile) {
        setStage("upload");
        const result = await uploadToCloudinary(
          videoFile,
          { title: text.trim().slice(0, 60) || "post-video", creatorId: "feed-post", userId: session.user.id },
          setProgress,
        );
        videoUrl = result.playbackUrl;
        videoThumbUrl = result.thumbnailUrl;
        setProgress(100);
      }

      if (hasMedia) {
        // Espera a verificação inicial (texto) ter, pelo menos, arrancado
        // antes de anexarmos a imagem/vídeo e voltarmos a analisar — evita
        // duas invocações a correr desalinhadas.
        await earlyModeration;
        setStage("saving");
        const { error: updErr } = await (supabase as any).from("posts").update({
          photo_url: imageUrls[0] ?? null,
          image_url: imageUrls[0] ?? null,
          photos: imageUrls.length > 0 ? imageUrls : null,
          video_url: videoUrl,
          thumbnail_url: videoThumbUrl,
          // Limpa o "carimbo" da 1ª verificação (só texto) para a IA voltar
          // a analisar, desta vez já com a imagem/miniatura do vídeo.
          moderation_checked_at: null,
        }).eq("id", postId);
        if (updErr) console.error("Erro ao anexar media à publicação:", updErr);
      }

      // Verificação final — com a imagem/vídeo já anexado (quando existir).
      // Enquanto isto não terminar a publicação continua só visível para ti.
      setStage("moderating");
      try {
        const { error: modErr } = await supabase.functions.invoke("moderate-content", { body: { postId } });
        if (modErr) throw modErr;
      } catch (modErr) {
        console.error("Erro na moderação automática:", modErr);
        // Rede em baixo / função falhou — não deixar a publicação presa em
        // "pending" (e por isso invisível) para sempre. Cai no lado seguro
        // marcando como "safe"; o painel de admin continua a poder rever.
        await (supabase as any).from("posts").update({
          moderation_status: "safe",
          moderation_checked_at: new Date().toISOString(),
        }).eq("id", postId);
      }
      supabase.functions.invoke("classify-content", { body: { postId } })
        .catch(err => console.error("Erro na classificação automática:", err));

      setStage("done");
      onPublished();
      setTimeout(onClose, 700);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao publicar.");
      setStage("idle");
    } finally {
      setPublishing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-3xl hooda-modal-sheet flex flex-col" style={{ maxHeight: "85vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Criar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] transition">
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <MiniAvatar name={name} src={avatarUrl} size={42} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{name}</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              @{username}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((p, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                  <img src={p} alt={`foto ${i + 1}`} className="w-full h-full object-cover" style={{ display: "block" }} />
                  <button onClick={() => removePhotoAt(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center rounded-xl transition active:scale-95"
                  style={{ aspectRatio: "1/1", background: "var(--s2)", border: "1.5px dashed var(--border-subtle)" }}>
                  <Plus className="h-6 w-6" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>
          )}
          {videoPreview && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <video src={videoPreview} className="w-full rounded-xl" controls />
              <button onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 z-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={pollActive ? "Adiciona um comentário (opcional)" : "O que queres publicar?"} rows={pollActive ? 2 : 4}
            className="w-full outline-none resize-none bg-transparent leading-relaxed text-[15px]"
            style={{ color: "var(--text-primary)" }} />

          {!pollActive && photos.length === 0 && !videoPreview && extractUrl(text) && (
            <LinkPreview url={extractUrl(text)!} variant="post" />
          )}

          {pollActive && (
            <div className="mt-2 mb-3 p-3 rounded-2xl" style={{ background: "var(--s2)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#F26B3A" }}>
                  <BarChart3 className="h-3.5 w-3.5" /> Enquete
                </span>
                <button onClick={togglePoll} className="p-1 rounded-full hover:bg-black/5">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} maxLength={140}
                placeholder="Escreve a tua pergunta"
                className="w-full mb-2 px-3 py-2 rounded-xl outline-none text-sm font-medium bg-transparent"
                style={{ border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
              <div className="space-y-2 mb-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={opt} onChange={(e) => updatePollOption(i, e.target.value)} maxLength={60}
                      placeholder={`Opção ${i + 1}`}
                      className="flex-1 px-3 py-2 rounded-xl outline-none text-sm bg-transparent"
                      style={{ border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
                    {pollOptions.length > 2 && (
                      <button onClick={() => removePollOption(i)} className="p-1.5 rounded-full hover:bg-black/5">
                        <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <button onClick={addPollOption}
                  className="text-xs font-semibold flex items-center gap-1 mb-3" style={{ color: "#F26B3A" }}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar opção
                </button>
              )}
              <div className="flex items-center gap-1.5">
                {([1, 3, 7] as const).map((d) => (
                  <button key={d} onClick={() => setPollDurationDays(d)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                    style={{
                      borderColor: pollDurationDays === d ? "#F26B3A" : "var(--border-subtle)",
                      background: pollDurationDays === d ? "#F26B3A18" : "transparent",
                      color: pollDurationDays === d ? "#F26B3A" : "var(--text-secondary)",
                    }}>
                    {d} {d === 1 ? "dia" : "dias"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => fileRef.current?.click()} disabled={pollActive}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition text-sm font-semibold active:scale-95 disabled:opacity-40"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Image className="h-4 w-4 text-[#6BA547]" /> Foto{photos.length > 0 ? `s (${photos.length})` : "s"}
            </button>
            <button onClick={() => videoRef.current?.click()} disabled={pollActive}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition text-sm font-semibold active:scale-95 disabled:opacity-40"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Film className="h-4 w-4 text-[#E94B8A]" /> Vídeo
            </button>
            <button onClick={togglePoll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition text-sm font-semibold active:scale-95"
              style={{ background: pollActive ? "#F26B3A18" : "var(--s2)", color: pollActive ? "#F26B3A" : "var(--text-secondary)" }}>
              <BarChart3 className="h-4 w-4" style={{ color: "#F26B3A" }} /> Enquete
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />

          {err && <p className="mb-2 text-sm text-red-500">{err}</p>}

          {publishing && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                <span>
                  {stage === "upload" && "A enviar…"}
                  {(stage === "saving" || stage === "moderating") && "A publicar…"}
                  {stage === "done" && "Publicado!"}
                </span>
                {stage === "upload" && <span style={{ color: ACCENT }}>{progress}%</span>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: stage === "saving" ? "90%" : stage === "moderating" ? "97%" : stage === "done" ? "100%" : `${progress}%`, background: `linear-gradient(90deg, ${ACCENT}, #E94B8A)` }} />
              </div>
            </div>
          )}

          <button onClick={publish} disabled={!canPublish}
            className="w-full h-12 rounded-xl font-bold text-base transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: canPublish ? ACCENT : "var(--s3)", color: canPublish ? "#fff" : "var(--text-muted)" }}>
            {stage === "done" ? "Publicado!" : publishing ? "A publicar…" : "Publicar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Caixa de composição compacta, mostrada no topo do feed ── */
export function ComposeBox({ name, username, avatarUrl, onPublished }: {
  name: string; username: string; avatarUrl?: string | null;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openWithPoll, setOpenWithPoll] = useState(false);

  const quickActions = [
    { label: "Foto", Icon: Image, color: "#6BA547", onClick: () => { setOpenWithPoll(false); setOpen(true); } },
    { label: "Vídeo", Icon: Film, color: "#E94B8A", onClick: () => { setOpenWithPoll(false); setOpen(true); } },
    { label: "Enquete", Icon: BarChart3, color: "#F26B3A", onClick: () => { setOpenWithPoll(true); setOpen(true); } },
  ];

  return (
    <>
      <div className="rounded-2xl mb-2" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]">
          <MiniAvatar name={name} src={avatarUrl} size={38} />
          <span className="flex-1 text-sm" style={{ color: "var(--text-muted)" }}>O que queres publicar?</span>
          <Plus className="h-5 w-5 shrink-0" style={{ color: ACCENT }} />
        </button>
        <div className="flex items-center gap-1.5 px-3 pb-3">
          {quickActions.map(({ label, Icon, color, onClick }) => (
            <button key={label} onClick={onClick}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Icon className="h-3.5 w-3.5" style={{ color }} /> {label}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <QuickPostModal
          name={name} username={username} avatarUrl={avatarUrl}
          onClose={() => { setOpen(false); setOpenWithPoll(false); }}
          onPublished={onPublished}
          startWithPoll={openWithPoll}
        />
      )}
    </>
  );
}
