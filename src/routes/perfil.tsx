import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { signOutSnapper } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { STATIC_QUERY_OPTIONS } from "@/lib/queryClient";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { SnapperLogo } from "@/components/SnapperLogo";
import {
  Settings, LogOut, MessageCircle, Flag, X, Image, Type, Plus, Repeat2, Quote,
  BookOpen, ChevronRight, Lock, Shield, TrendingUp, Bookmark,
  Info, Camera, Link, MapPin, Calendar, Bell, HelpCircle, Globe,
  Banknote, BarChart3, Star, Heart, Share2,
  MoreHorizontal, Trash2, Send, Copy, Moon, Sun, ExternalLink,
  Twitter, Instagram, Youtube, Facebook, Linkedin, Music2, Loader, Tv, Film,
  ArrowLeft, Check,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAvatar } from "@/contexts/AvatarContext";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { LanguagePanel } from "@/components/LanguageSwitcher";
import { LANGUAGES, getCurrentLang } from "@/lib/i18n";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { optimizeAvatar, optimizePostPhoto } from "@/lib/imageOptimize";
import { uploadFeedVideo } from "@/lib/cloudinaryFeedVideo";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike } from "@/lib/comments";
import { deletePostForEveryone } from "@/lib/posts";
import { UniversalPostCard, normalizePost } from "@/components/UniversalPostCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PhotoViewer } from "@/components/PhotoViewer";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { PollCard } from "@/components/PollCard";
import { UniversalSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Snapper" }] }),
  component: ProfilePage,
});

type Profile = { id?: string; username: string; full_name: string; age: number | null; bio: string | null; username_changed_at?: string | null };
type Post = {
  id: string; text: string; photo: string | null; photos?: string[] | null; bgColor: string | null; createdAt: Date;
  likes: number; likedByMe: boolean; comments: number; bookmarked: boolean;
  videoUrl?: string;
  views_count?: number;
  poll?: { question?: string; options?: (string | { text: string })[] } | null;
  pollEndsAt?: string | null;
};
type SavedPost = Post & { authorId: string; authorName: string; authorUsername: string; authorAvatar: string | null; authorIsVerified?: boolean };

const ACCENT = "#2F6FED";
const ACCENT_COLORS = ["#2F6FED", "#2F6FED", "#1FAFA6", "#6BA547", "#2F6FED"];
const BG_COLORS: { label: string; value: string | null; preview: string }[] = [
  { label: "Sem cor",  value: null,      preview: "#f0f0f0" },
  { label: "Roxo",    value: "#2F6FED", preview: "#2F6FED" },
  { label: "Laranja", value: "#2F6FED", preview: "#2F6FED" },
  { label: "Teal",    value: "#1FAFA6", preview: "#1FAFA6" },
  { label: "Verde",   value: "#6BA547", preview: "#6BA547" },
  { label: "Rosa",    value: "#2F6FED", preview: "#2F6FED" },
];

function textColorForBg(bg: string | null): string { if (!bg) return "#0f0f14"; return "#ffffff"; }
function getColor(name: string) { return ACCENT_COLORS[(name?.charCodeAt(0) ?? 0) % ACCENT_COLORS.length]; }
function timeAgo(date: Date) {
  const d = Math.floor((Date.now() - date.getTime()) / 1000);
  if (d < 60) return "agora";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}
function fmtNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
// helper global para tradução (funciona fora de hooks)
import i18n from "@/lib/i18n";
function t(key: string, opts?: Record<string, unknown>) { return i18n.t(key, opts) as string; }

/* ─── Avatar ─── */
function Avatar({ name, size = 72, src }: { name: string; size?: number; src?: string | null }) {
  const color = getColor(name);
  return (
    <div style={{
      background: color, width: size, height: size, borderRadius: "50%",
      border: "3px solid white", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.36, fontWeight: 700,
      color: "white", flexShrink: 0, overflow: "hidden",
    }}>
      {src
        ? <img loading="lazy" decoding="async" src={optimizeAvatar(src, size)} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        : (name?.[0] ?? "?").toUpperCase()
      }
    </div>
  );
}



function PostsFeed({ posts, loading, name, username, avatarUrl, onDelete, myUserId, isVerified }: {
  posts: Post[]; loading?: boolean; name: string; username: string; avatarUrl?: string | null;
  onDelete: (id: string) => void;
  myUserId?: string;
  isVerified?: boolean;
}) {
  if (loading) return (
    <div className="px-4 py-3 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "var(--s2)" }}>
          <div className="h-40" style={{ background: "var(--s3)" }} />
        </div>
      ))}
    </div>
  );
  if (posts.length === 0) return (
    <div className="px-5 py-14 flex flex-col items-center gap-3 text-center">
      <div className="w-16 h-16 rounded-full bg-[#2F6FED]/10 flex items-center justify-center">
        <BookOpen className="h-7 w-7 text-[#2F6FED]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-muted)]">Ainda não tens publicações</p>
      <p className="text-xs text-[var(--text-muted)]">Cria a tua primeira publicação acima!</p>
    </div>
  );
  return (
    <div className="pb-6 space-y-2 w-full px-3 pt-2">
      {posts.map((post) => (
        <UniversalPostCard key={post.id}
          post={normalizePost(post, "profile", { name, username, avatarUrl, authorId: myUserId, isVerified })}
          onDeleted={onDelete} />
      ))}
    </div>
  );
}

/* ─── Modal Criar Publicação ─── */
/* SimpleVideoPlayer local foi substituído por FeedVideoPlayer (moldura + controles tipo YouTube) */

function CreatePostModal({
  profile, email, onClose, onPublish,
}: {
  profile: Profile | null; email: string;
  onClose: () => void;
  onPublish: (post: Post) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = profile?.full_name || profile?.username || email?.split("@")[0] || "?";
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle"|"upload"|"saving"|"done">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setVideoFile(null); setVideoPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => { setPhoto(ev.target?.result as string); setBgColor(null); };
    reader.readAsDataURL(file);
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setPhoto(null); setPhotoFile(null); setBgColor(null);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function publish() {
    if (!text.trim() && !photoFile && !photo && !videoFile) return;
    if (publishing || done) return;
    setPublishing(true);
    setPublishErr(null);
    setUploadProgress(0);
    setUploadStage("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPublishErr("É preciso iniciar sessão para publicar."); return; }

      let imageUrl: string | null = photo;
      let videoUrl: string | null = null;

      if (photoFile) {
        setUploadStage("upload");
        const { url } = await uploadImageToCloudinary(
          photoFile,
          `hooda/posts/${session.user.id}`,
          (pct) => setUploadProgress(pct),
        );
        imageUrl = url;
        setUploadProgress(100);
      }

      if (videoFile) {
        setUploadStage("upload");
        const result = await uploadFeedVideo(
          videoFile,
          { title: text.trim().slice(0, 60) || "post-video", creatorId: "feed-post", userId: session.user.id },
          (pct) => setUploadProgress(pct),
        );
        videoUrl = result.playbackUrl;
        setUploadProgress(100);
      }

      setUploadStage("saving");
      const { data: prof } = await supabase.from("profiles").select("username, full_name").eq("id", session.user.id).maybeSingle();
      const contentJson = bgColor ? JSON.stringify({ text, bgColor }) : text;

      const { data: inserted, error } = await (supabase as any)
        .from("posts")
        .insert({
          author_id: session.user.id,
          author_username: prof?.username ?? session.user.email?.split("@")[0] ?? "",
          author_name: prof?.full_name ?? session.user.email ?? "",
          author_color: "#2F6FED",
          content: contentJson,
          kind: videoUrl ? "video" : bgColor ? "bg" : imageUrl ? "photo" : "post",
          photo_url: imageUrl,
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select("id, created_at")
        .single();

      if (error || !inserted?.id) {
        setPublishErr(error?.message ?? "Não foi possível publicar. Tenta novamente.");
        console.error("Erro ao publicar post:", error);
        return;
      }

      setUploadStage("done");
      onPublish({
        id: inserted.id, text, photo: imageUrl, bgColor,
        videoUrl: videoUrl ?? undefined,
        createdAt: new Date(inserted.created_at ?? Date.now()),
        likes: 0, likedByMe: false, comments: 0, bookmarked: false,
      });
      setDone(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      setPublishErr(err.message ?? "Erro ao publicar.");
      setUploadStage("idle");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = (text.trim().length > 0 || photo !== null || videoFile !== null) && !publishing && !done;

  useScrollLock();

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg mx-4 rounded-3xl hooda-modal-sheet flex flex-col" style={{ maxHeight: "85vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Criar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] transition">
            <X className="h-5 w-5 text-[var(--text-muted)]" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar name={name} size={42} />
          <div>
            <p className="text-sm font-bold text-black">{name}</p>
            <span className="text-[11px] bg-[var(--s2)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full font-medium">
              @{profile?.username || "utilizador"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {photo && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <img src={optimizePostPhoto(photo, 700)} alt="foto" className="w-full rounded-xl" style={{ display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <button onClick={() => { setPhoto(null); setPhotoFile(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {videoPreview && (
            <div className="relative mb-3">
              <FeedVideoPlayer src={videoPreview} rounded="rounded-xl" isShortHint={false} />
              <button onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 z-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-2xl transition-all">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t("post.placeholder")}
              rows={4}
              className="w-full outline-none resize-none bg-transparent leading-relaxed"
              style={{ color: "var(--text-primary,#111)", fontSize: 15, fontWeight: 400, textAlign: "left" }} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--text-muted)] font-medium">Adicionar à publicação</span>
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--s2)] hover:bg-[var(--s3)] transition text-sm font-semibold text-[var(--text-secondary)] active:scale-95">
                <Image className="h-4 w-4 text-[#6BA547]" /> {t("post.photo")}
              </button>
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--s2)] hover:bg-[var(--s3)] transition text-sm font-semibold text-[var(--text-secondary)] active:scale-95">
                <Film className="h-4 w-4 text-[#2F6FED]" /> {"Vídeo"}
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />
          {publishErr && <p className="mb-2 text-sm text-red-600">{publishErr}</p>}

          {/* Barra de progresso real durante upload */}
          {publishing && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                <span>
                  {uploadStage === "upload" && (photoFile ? "A enviar foto…" : "A enviar vídeo…")}
                  {uploadStage === "saving" && "A guardar publicação…"}
                  {uploadStage === "done"   && t("post.published")}
                </span>
                {uploadStage === "upload" && (
                  <span style={{ color: ACCENT }}>{uploadProgress}%</span>
                )}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: uploadStage === "saving" ? "95%" : uploadStage === "done" ? "100%" : `${uploadProgress}%`,
                    background: `#2F6FED`,
                    boxShadow: `0 0 8px ${ACCENT}80`,
                  }}
                />
              </div>
            </div>
          )}

          <button onClick={publish} disabled={!canPublish}
            className="w-full h-12 rounded-xl font-bold text-base transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: canPublish ? ACCENT : "var(--s3)", color: canPublish ? "#fff" : "var(--text-muted)" }}>
            {done
              ? t("post.published")
              : publishing
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t("post.publishing", "A publicar…")}</>
                : t("post.publish")}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}

/* ─── Modal Editar Perfil ─── */
function EditProfileModal({
  profile, email, onClose, onSave,
}: {
  profile: Profile | null; email: string;
  onClose: () => void;
  onSave: (data: Partial<Profile> & { website?: string; location?: string; whatsapp?: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile?.full_name || profile?.username || email?.split("@")[0] || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [website, setWebsite] = useState((profile as any)?.website || "");
  const [location, setLocation] = useState((profile as any)?.location || "");
  const [whatsapp, setWhatsapp] = useState((profile as any)?.whatsapp || "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false); // lápis clicado?
  const [usernameStatus, setUsernameStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calcular dias restantes para poder trocar username
  const usernameCooldownDays = React.useMemo(() => {
    if (!profile?.username_changed_at) return 0;
    const lastChange = new Date(profile.username_changed_at).getTime();
    const daysSince  = (Date.now() - lastChange) / (1000 * 60 * 60 * 24);
    const remaining  = Math.ceil(31 - daysSince);
    return remaining > 0 ? remaining : 0;
  }, [profile?.username_changed_at]);

  // Username editável apenas se: sem cooldown E lápis clicado
  const canChangeUsername = usernameCooldownDays === 0 && editingUsername;

  // Gera sugestões baseadas no nome
  function generateSuggestions(name: string): string[] {
    const parts = name.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    const first = parts[0], last = parts[parts.length - 1];
    return [...new Set([
      parts.join(""),
      parts.join("."),
      parts.join("_"),
      first.length > 1 ? `${first[0]}.${last}` : null,
      `${first}${last}${Math.floor(Math.random() * 90) + 10}`,
    ].filter((s): s is string => !!s && s.length >= 3).map(s => s.slice(0, 20)))];
  }

  // Bloquear scroll do fundo enquanto modal está aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleUsernameChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    setUsername(clean);
    setUsernameStatus("idle");
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (!clean || clean === (profile?.username || "")) { setUsernameStatus("idle"); return; }
    if (clean.length < 3 || clean.includes(".com") || clean.includes(".net") || clean.includes("@")) {
      setUsernameStatus("invalid"); return;
    }
    setUsernameStatus("checking");
    usernameTimer.current = setTimeout(async () => {
      // Case-insensitive check — ignora o próprio username actual
      const { data } = await supabase.from("profiles").select("id").ilike("username", clean).maybeSingle();
      if (data && data.id !== profile?.id) {
        setUsernameStatus("taken");
      } else {
        setUsernameStatus("available");
      }
    }, 600);
  }

  async function save() {
    if (usernameStatus === "taken" || usernameStatus === "invalid") return;
    if (usernameStatus === "checking") return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const usernameChanged = username !== (profile?.username || "");
        const updateData: Record<string, any> = {
          full_name: name,
          username,
          bio,
          website,
          location,
          whatsapp,
          updated_at: new Date().toISOString(),
        };
        // Gravar data de troca de username para cooldown de 30 dias
        if (usernameChanged) {
          updateData.username_changed_at = new Date().toISOString();
        }
        console.log("[hooda:debug] A gravar perfil:", updateData);
        const { data: updRes, error } = await (supabase as any)
          .from("profiles").update(updateData).eq("id", session.user.id).select();
        if (error) {
          console.error(
            "[hooda] ERRO ao gravar perfil (cooldown pode não funcionar):",
            "\nCódigo:", error.code, "\nMensagem:", error.message,
            "\nDetalhes:", error.details, "\nHint:", error.hint,
            error
          );
          // O trigger de cooldown de 30 dias rejeitou a troca de username no servidor
          if (usernameChanged && error.hint === "username_cooldown") {
            toast.error(error.message || "Ainda não podes trocar de nome de utilizador.");
            setSaving(false);
            return;
          }
          // Tenta sem username_changed_at apenas se o erro for especificamente sobre essa coluna
          if (usernameChanged && (error.message?.includes("username_changed_at") || error.code === "42703" || error.code === "42501")) {
            const { full_name, username: u, bio: b, website: w, location: l, whatsapp: wa, updated_at } = updateData;
            const { error: error2 } = await (supabase as any)
              .from("profiles").update({ full_name, username: u, bio: b, website: w, location: l, whatsapp: wa, updated_at }).eq("id", session.user.id);
            if (error2) console.error("[hooda] ERRO mesmo sem username_changed_at:", error2);
          } else if (usernameChanged) {
            toast.error("Não foi possível gravar as alterações. Tenta novamente.");
            setSaving(false);
            return;
          }
        } else {
          console.log("[hooda:debug] Perfil gravado com sucesso:", updRes);
        }
        // Atualizar username nos posts existentes
        if (usernameChanged) {
          await (supabase as any).from("posts").update({ author_username: username }).eq("author_id", session.user.id);
        }
      }
    } catch (err) {
      console.error("[hooda] EXCEÇÃO ao gravar perfil:", err);
    }
    onSave({ full_name: name, username, bio, website, location, whatsapp,
      ...(username !== (profile?.username || "") ? { username_changed_at: new Date().toISOString() } : {}) });
    setDone(true);
    setSaving(false);
    setTimeout(onClose, 600);
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-lg lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl"
        style={{ maxHeight: "92vh", height: "92vh", background: "var(--s1)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Drag indicator mobile */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        {/* Header fixo */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}>
          <button onClick={onClose} className="p-2 rounded-full transition"
            style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          </button>
          <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Editar perfil</span>
          <button onClick={save}
            disabled={saving || done || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"}
            className="text-sm font-bold px-5 py-2 rounded-full text-white transition active:scale-95 disabled:opacity-50"
            style={{ background: ACCENT }}>
            {done ? "✓" : saving ? "..." : "Guardar"}
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="overflow-y-auto flex-1">

          {/* Avatar + capa */}
          <div className="relative mb-12">
            <div className="h-28 w-full" style={{ background: "linear-gradient(135deg,#2F6FED,#1FAFA6,#FFC93C)" }} />
            <button className="absolute top-3 right-3 bg-black/50 rounded-full p-2">
              <Camera className="h-4 w-4 text-white" />
            </button>
            <div className="absolute left-5" style={{ bottom: -40 }}>
              <div className="relative">
                <Avatar name={name || email || "?"} size={72} />
                <button className="absolute -bottom-1 -right-1 rounded-full p-1.5 border-2"
                  style={{ background: "var(--s1)", borderColor: "var(--s1)" }}>
                  <Camera className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} />
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 space-y-4">
            {/* Nome */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="O teu nome completo"
                className="mt-1 w-full border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 transition"
                style={{ background: "var(--s2)", color: "var(--text-primary)" }}
              />
            </div>

            {/* Username */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Nome de utilizador</label>
                {usernameCooldownDays > 0 ? (
                  <span className="text-[11px] flex items-center gap-1 font-semibold" style={{ color: "#2F6FED" }}>
                    🔒 Bloqueado {usernameCooldownDays} dia{usernameCooldownDays !== 1 ? "s" : ""}
                  </span>
                ) : !editingUsername ? (
                  <button
                    onClick={() => setEditingUsername(true)}
                    className="text-[11px] flex items-center gap-1 font-semibold transition hover:opacity-70"
                    style={{ color: ACCENT }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                  </button>
                ) : (
                  <button
                    onClick={() => { setEditingUsername(false); setUsername(profile?.username || ""); setUsernameStatus("idle"); }}
                    className="text-[11px] font-semibold transition hover:opacity-70"
                    style={{ color: "var(--text-muted)" }}>
                    Cancelar
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">@</span>
                <input value={username}
                  onChange={(e) => canChangeUsername && handleUsernameChange(e.target.value)}
                  readOnly={!canChangeUsername}
                  placeholder="nomedeutilizador"
                  className="w-full rounded-xl pl-8 pr-10 py-2.5 text-sm font-medium outline-none transition"
                  style={{
                    background: canChangeUsername ? "var(--s2)" : "var(--s3)",
                    color: "var(--text-primary)",
                    cursor: canChangeUsername ? "text" : "not-allowed",
                    border: `1.5px solid ${!canChangeUsername ? "var(--border-default)" : usernameStatus === "available" ? "#6BA547" : usernameStatus === "taken" || usernameStatus === "invalid" ? "#ef4444" : "var(--border-default)"}`,
                    boxShadow: usernameStatus === "available" ? "0 0 0 3px #6BA54720" : usernameStatus === "taken" ? "0 0 0 3px #ef444420" : "none",
                  }}
                />
                {/* Ícone cadeado quando bloqueado */}
                {!canChangeUsername && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                )}
                {/* Indicador status */}
                {canChangeUsername && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />}
                    {usernameStatus === "available" && <span className="text-[#6BA547] text-lg">✓</span>}
                    {(usernameStatus === "taken" || usernameStatus === "invalid") && <span className="text-red-500 text-lg">✗</span>}
                  </div>
                )}
              </div>
              {/* Mensagem de cooldown */}
              {usernameCooldownDays > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 px-3 py-2 rounded-xl" style={{ background: "#2F6FED12" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2F6FED" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                  <p className="text-[11px] font-semibold" style={{ color: "#2F6FED" }}>
                    Podes trocar o username daqui a <strong>{usernameCooldownDays} dia{usernameCooldownDays !== 1 ? "s" : ""}</strong>
                  </p>
                </div>
              )}
              {canChangeUsername && usernameStatus === "available" && <p className="text-[11px] text-[#6BA547] mt-1">Disponível!</p>}
              {usernameStatus === "taken" && (
                <div>
                  <p className="text-[11px] text-red-500 mt-1">Este nome de utilizador já está em uso. Experimenta:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {generateSuggestions(name).map(s => (
                      <button key={s} type="button"
                        onClick={() => handleUsernameChange(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full border font-semibold transition active:scale-95"
                        style={{ borderColor: ACCENT, background: `${ACCENT}12`, color: ACCENT }}>
                        @{s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {usernameStatus === "invalid" && <p className="text-[11px] text-red-500 mt-1">Mínimo 3 caracteres. Apenas letras, números, . e _</p>}
              {/* Sugestões sempre visíveis quando campo está vazio ou idle */}
              {(usernameStatus === "idle" || !username) && name && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {generateSuggestions(name).map(s => (
                    <button key={s} type="button"
                      onClick={() => handleUsernameChange(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full border font-semibold transition active:scale-95"
                      style={{ borderColor: "var(--border-default)", background: "var(--s2)", color: "var(--text-secondary)" }}>
                      @{s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bio */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Biografia</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="Fala um pouco sobre ti..."
                rows={3}
                className="mt-1 w-full border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 transition resize-none leading-relaxed" style={{ background: "var(--s2)", color: "var(--text-primary)" }}
              />
              <p className="text-[11px] text-[var(--text-muted)] text-right mt-1">{bio.length}/160</p>
            </div>

            {/* Website */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Website</label>
              <div className="relative mt-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <input value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-[var(--border-default)] rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 transition"
                  style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">WhatsApp</label>
              <div className="relative mt-1">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+244 900 000 000"
                  inputMode="tel"
                  className="w-full border border-[var(--border-default)] rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 transition"
                  style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Com código do país, ex: +244. Aparece como link clicável no teu perfil.</p>
            </div>

            {/* Localização */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Localização</label>
              <div className="relative mt-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Lisboa, Portugal"
                  className="w-full border border-[var(--border-default)] rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 transition"
                  style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                />
              </div>
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Email</label>
              <input value={email} readOnly
                className="mt-1 w-full border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-muted)] bg-[var(--s1)] cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Painel ClickAds ─── */

function MonetizationPanel() {
  return (
    <div className="px-5 py-16 flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#2F6FED" }}>
        <TrendingUp className="h-8 w-8 text-white" />
      </div>
      <p className="text-xl font-extrabold text-black">ClickAds</p>
      <div className="flex items-center gap-2 bg-[var(--s2)] rounded-full px-5 py-2.5">
        <div className="w-2 h-2 rounded-full bg-[#2F6FED] animate-pulse" />
        <p className="text-sm font-bold text-[var(--text-secondary)]">Em breve</p>
      </div>
    </div>
  );
}

/* ─── Gaveta de Configurações ─── */
export function SettingsDrawer({
  onClose, onEditProfile, onSignOut, msgPermission, onMsgPermissionChange,
  onOpenNotifications, onOpenActivity, onOpenPrivacy, onOpenSecurity,
  onOpenHelp, onOpenAbout, onOpenLanguage, onOpenMsgPrivacy, profile,
}: {
  onClose: () => void;
  onEditProfile: () => void;
  onSignOut: () => void;
  msgPermission: string;
  onMsgPermissionChange: (v: string) => void;
  onOpenNotifications: () => void;
  onOpenActivity: () => void;
  onOpenPrivacy: () => void;
  onOpenSecurity: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  onOpenLanguage: () => void;
  onOpenMsgPrivacy: () => void;
  profile?: Profile | null;
}) {
  useScrollLock();
  const { theme, toggle } = useTheme();
  const { avatarUrl } = useAvatar();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useScrollLock();

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const sections = [
    {
      title: t("settings.account", "Conta"),
      items: [
        { icon: Settings, label: t("settings.edit_profile"), desc: t("settings.edit_profile_desc", "Nome, foto, bio e mais"), action: () => { handleClose(); setTimeout(onEditProfile, 300); }, color: ACCENT },
        { icon: Bell, label: t("settings.notifications"), desc: t("settings.notifications_desc", "Gere os teus alertas"), action: onOpenNotifications, color: "#2F6FED" },
        { icon: Calendar, label: t("settings.activity"), desc: t("settings.activity_desc", "Histórico de ações"), action: onOpenActivity, color: "#1FAFA6" },
      ],
    },
    {
      title: t("settings.privacy_security", "Privacidade & Segurança"),
      items: [
        { icon: Lock, label: t("settings.privacy"), desc: t("settings.privacy_desc", "Quem pode ver o teu perfil"), action: onOpenPrivacy, color: "#6BA547" },
        { icon: Shield, label: t("settings.security"), desc: t("settings.security_desc", "Palavra-passe e autenticação"), action: onOpenSecurity, color: "#2F6FED" },
        { icon: MessageCircle, label: t("settings.msg_privacy"), desc: t("settings.msg_privacy_desc", "Quem pode enviar-te mensagens"), action: onOpenMsgPrivacy, color: "#1FAFA6" },
      ],
    },
    {
      title: t("settings.support", "Suporte"),
      items: [
        { icon: HelpCircle, label: t("settings.help"), desc: t("settings.help_desc", "Perguntas frequentes"), action: onOpenHelp, color: "#1FAFA6" },
        { icon: Info, label: t("settings.about"), desc: t("settings.about_desc", "Versão e informações legais"), action: onOpenAbout, color: "#2F6FED" },
      ],
    },
    {
      title: t("settings.language"),
      items: [
        { icon: Globe, label: t("settings.language"), desc: (() => { const l = LANGUAGES.find(l => l.code === getCurrentLang()); return `${l?.flag ?? "🇵🇹"} ${l?.label ?? "Português"}`; })(), action: onOpenLanguage, color: "#2F6FED" },
      ],
    },
  ];

  const displayName = profile?.full_name || profile?.username || "Utilizador";
  const handle = profile?.username || "";
  const avatar = avatarUrl || (profile as any)?.avatar_url;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Painel */}
      <div
        className="relative flex flex-col shadow-2xl transition-transform duration-300 ease-out"
        style={{
          background: "var(--s1, #fff)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          width: "100%",
          maxWidth: "384px",
          height: "100dvh",
          maxHeight: "100dvh",
        }}
      >
        {/* Header gradiente com avatar */}
        <div className="shrink-0 px-5 pt-6 pb-5"
          style={{ background: `#2F6FED` }}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-white font-extrabold text-lg tracking-tight">{t("settings.title")}</span>
            <button onClick={handleClose}
              className="p-2 rounded-full transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/50 shrink-0 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              {avatar
                ? <img loading="lazy" decoding="async" src={optimizeAvatar(avatar, 56)} alt={displayName} className="w-full h-full object-cover" />
                : <span className="text-white font-bold text-xl">{displayName[0]?.toUpperCase()}</span>
              }
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">{displayName}</p>
              {handle && <p className="text-white/70 text-sm truncate">@{handle}</p>}
            </div>
          </div>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto py-2 min-h-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }}>

          {/* Tema */}
          <div className="mb-1">
            <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}>Aparência</p>
            <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm"
              style={{ background: "var(--s2, #f9f9f9)", borderColor: "var(--border-default, #eee)" }}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: theme === "dark" ? "#1e1c2e" : "#F3F0FF" }}>
                  {theme === "dark"
                    ? <Moon className="h-4 w-4" style={{ color: "#8B5CF6" }} />
                    : <Sun className="h-4 w-4" style={{ color: ACCENT }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                    {theme === "dark" ? t("settings.dark_mode") : t("settings.light_mode")}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Altera o tema da app</p>
                </div>
                <button onClick={toggle}
                  className="relative w-12 h-6 rounded-full transition-all duration-300 shrink-0"
                  style={{ background: theme === "dark" ? ACCENT : "#D1D5DB" }}>
                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-[var(--s2)] shadow transition-all duration-300"
                    style={{ left: theme === "dark" ? "calc(100% - 22px)" : "2px" }} />
                </button>
              </div>
            </div>
          </div>

          {/* Secções */}
          {sections.map((sec) => (
            <div key={sec.title} className="mb-1">
              <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}>{sec.title}</p>
              <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm"
                style={{ background: "var(--s2, #f9f9f9)", borderColor: "var(--border-default, #eee)" }}>
                {sec.items.map((item, idx) => (
                  <button key={item.label} onClick={item.action}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:scale-[0.98] ${idx > 0 ? "border-t" : ""}`}
                    style={{ borderColor: "var(--border-default, #eee)" }}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--s3, #f0f0f0)")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: item.color + "18" }}>
                      <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  </button>
                ))}
              </div>
            </div>
          ))}



          {/* Terminar sessão */}
          <div className="mx-3 mb-4">
            <button onClick={onSignOut}
              className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
              style={{ background: "#fee2e2", color: "#dc2626", border: "1.5px solid #fca5a5" }}
              onMouseOver={e => (e.currentTarget.style.background = "#fecaca")}
              onMouseOut={e => (e.currentTarget.style.background = "#fee2e2")}>
              <LogOut className="h-4 w-4" /> Terminar sessão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Painel genérico — ocupa a página inteira (estilo Instagram) ─── */
export function SettingsSubPanel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useScrollLock();

  const handleBack = () => {
    setVisible(false);
    setTimeout(onBack, 250);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col transition-transform duration-250 ease-out"
      style={{
        background: "var(--s1, #f8f8f8)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0"
        style={{ background: "var(--s0, #fff)", borderColor: "var(--border-default, #eee)" }}>
        <button onClick={handleBack}
          className="flex items-center justify-center w-9 h-9 rounded-full transition active:scale-90"
          style={{ background: "var(--s2, #f0f0f0)" }}>
          <ArrowLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
        </button>
        <span className="text-base font-extrabold flex-1" style={{ color: "var(--text-primary)" }}>{title}</span>
      </div>
      {/* Conteúdo scrollável */}
      <div className="overflow-y-auto flex-1 py-3">{children}</div>
    </div>
  );
}

function ToggleRow({ icon: Icon, color, label, desc, checked, onChange }: {
  icon: React.ElementType; color: string; label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "18" }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black leading-tight">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</p>
      </div>
      <button onClick={() => onChange(!checked)}
        className="relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0"
        style={{ background: checked ? ACCENT : "#D1D5DB" }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-[var(--s2)] shadow transition-all duration-300"
          style={{ left: checked ? "calc(100% - 22px)" : "2px" }} />
      </button>
    </div>
  );
}

/* ─── Notificações ─── */
export function NotificationsPanel({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState({ likes: true, comments: true, messages: true, mentions: true });
  const [loading, setLoading] = useState(true);
  const [savingErr, setSavingErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data, error } = await supabase.from("profiles")
        .select("notification_prefs").eq("id", session.user.id).maybeSingle();
      if (!error && (data as any)?.notification_prefs) {
        setPrefs(p => ({ ...p, ...(data as any).notification_prefs }));
      }
      setLoading(false);
    })();
  }, []);

  async function update(key: keyof typeof prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingErr("");
    setSavedOk(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingErr("Não autenticado."); return; }
    const { error } = await supabase.from("profiles")
      .update({ notification_prefs: next } as any).eq("id", session.user.id);
    if (error) setSavingErr(`Erro ao guardar: ${error.message}`);
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  const ITEMS: { key: keyof typeof prefs; icon: React.ElementType; color: string; label: string; desc: string }[] = [
    { key: "likes",    icon: Heart,         color: "#2F6FED", label: "Gostos",           desc: "Quando alguém gosta das tuas publicações" },
    { key: "comments", icon: MessageCircle, color: "#1FAFA6", label: t("post.comments"),      desc: "Quando alguém comenta as tuas publicações" },
    { key: "messages", icon: Bell,          color: "#2F6FED", label: t("nav.messages"),        desc: "Quando recebes uma nova mensagem" },
    { key: "mentions", icon: Type,          color: ACCENT,    label: "Menções",          desc: "Quando alguém te menciona numa publicação" },
  ];

  return (
    <SettingsSubPanel title={t("settings.notifications")} onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="mb-2">
          {savedOk && (
            <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Preferências guardadas
            </p>
          )}
          <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Alertas</p>
          <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            {ITEMS.map(it => (
              <ToggleRow key={it.key} icon={it.icon} color={it.color} label={it.label} desc={it.desc}
                checked={prefs[it.key]} onChange={(v) => update(it.key, v)} />
            ))}
          </div>
          {savingErr && <p className="px-5 pt-2 text-xs text-red-500">{savingErr}</p>}
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Atividade ─── */
export function ActivityPanel({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<{ id: string; type: string; text: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = session.user.id;

      const postsRes = await supabase.from("posts").select("id,created_at").eq("author_id", uid).order("created_at", { ascending: false }).limit(10);

      const list: { id: string; type: string; text: string; time: string }[] = [];

      (postsRes.data ?? []).forEach((p: any) => list.push({
        id: `p-${p.id}`, type: "post", text: "Criaste uma publicação", time: p.created_at,
      }));

      list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setItems(list.slice(0, 20));
      if (postsRes.error) setErr("Erro ao carregar publicações.");
      setLoading(false);
    })();
  }, []);

  const ICONS: Record<string, { icon: React.ElementType; color: string }> = {
    post:   { icon: Type,     color: ACCENT },
    like:   { icon: Heart,    color: "#2F6FED" },
  };

  return (
    <SettingsSubPanel title={t("settings.activity")} onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : err ? (
        <p className="px-5 text-sm text-red-500">{err}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center px-6">
          <Calendar className="h-8 w-8 text-neutral-300" />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Sem atividade ainda</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>As tuas ações vão aparecer aqui</p>
        </div>
      ) : (
        <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          {items.map(it => {
            const cfg = ICONS[it.type] ?? { icon: Calendar, color: "var(--text-muted)" };
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.color + "18" }}>
                  <cfg.icon className="h-4 w-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{it.text}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{timeAgo(new Date(it.time))}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Privacidade ─── */
export function PrivacyPanel({ onBack }: { onBack: () => void }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data, error } = await supabase.from("profiles").select("is_private").eq("id", session.user.id).maybeSingle();
      if (!error) setIsPrivate(!!(data as any)?.is_private);
      else setErr(error.message);
      setLoading(false);
    })();
  }, []);

  async function toggle(v: boolean) {
    setIsPrivate(v);
    setErr(""); setSavedOk(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setErr("Não autenticado."); return; }
    const { error } = await supabase.from("profiles").update({ is_private: v } as any).eq("id", session.user.id);
    if (error) { setErr(`Erro ao guardar: ${error.message}`); setIsPrivate(!v); }
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  return (
    <SettingsSubPanel title={t("settings.privacy")} onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="mb-2">
          {savedOk && (
            <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Guardado
            </p>
          )}
          <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Visibilidade do perfil</p>
          <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            <ToggleRow icon={Lock} color="#6BA547" label={t("settings.private_account", { defaultValue: "Conta privada" })}
              desc={t("settings.private_account_desc", { defaultValue: "Apenas acompanhantes aprovados veem as tuas publicações" })}
              checked={isPrivate} onChange={toggle} />
          </div>
          {err && <p className="px-5 pt-2 text-xs text-red-500">{err}</p>}
          <p className="px-5 pt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Com a conta privada, os novos acompanhantes precisam da tua aprovação e o teu conteúdo não aparecerá nas pesquisas públicas.
          </p>
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Segurança ─── */
export function SecurityPanel({ onBack, email }: { onBack: () => void; email: string }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function changePassword() {
    setMsg(null);
    if (pwd.length < 6) { setMsg({ type: "err", text: "A senha tem de ter pelo menos 6 caracteres." }); return; }
    if (pwd !== pwd2) { setMsg({ type: "err", text: "As senhas não coincidem." }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setMsg({ type: "ok", text: "Senha atualizada com sucesso." });
    setPwd(""); setPwd2("");
  }

  return (
    <SettingsSubPanel title={t("settings.security")} onBack={onBack}>
      <div className="mb-2">
        <p className="px-5 pb-1.5 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Conta</p>
        <div className="bg-[var(--s2)] mx-3 rounded-2xl overflow-hidden border border-[var(--border-subtle)] shadow-sm px-4 py-3.5">
          <p className="text-[11px] text-[var(--text-muted)]">Email associado</p>
          <p className="text-sm font-semibold text-black mt-0.5">{email}</p>
        </div>
      </div>

      <div className="mb-2">
        <p className="px-5 pb-1.5 pt-3 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Alterar palavra-passe</p>
        <div className="bg-[var(--s2)] mx-3 rounded-2xl overflow-hidden border border-[var(--border-subtle)] shadow-sm px-4 py-3.5 space-y-3">
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
            placeholder={t("settings.new_password")} className="w-full h-10 px-3 rounded-xl text-sm outline-none bg-[var(--s1)] border border-[var(--border-subtle)]" />
          <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)}
            placeholder={t("settings.confirm_new_password")} className="w-full h-10 px-3 rounded-xl text-sm outline-none bg-[var(--s1)] border border-[var(--border-subtle)]" />
          {msg && (
            <p className={`text-xs ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
          )}
          <button onClick={changePassword} disabled={saving || !pwd || !pwd2}
            className="w-full h-10 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition active:scale-[0.98]"
            style={{ background: ACCENT }}>
            {saving ? t("settings.saving") : t("settings.update_password")}
          </button>
        </div>
      </div>
    </SettingsSubPanel>
  );
}


/* ─── Privacidade de Mensagens ─── */
export function MsgPrivacyPanel({ onBack, msgPermission, onMsgPermissionChange }: {
  onBack: () => void; msgPermission: string; onMsgPermissionChange: (v: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  // Valores que a constraint da DB aceita: todos, aprovados
  // ("seguidores" e "mutuos" foram removidos junto com o sistema de seguir)
  const OPTIONS = [
    { value: "todos",      label: "Toda a gente",     desc: "Qualquer utilizador pode escrever-te" },
    { value: "aprovados",  label: "Apenas aprovados", desc: "Tens de aceitar cada pedido" },
  ];

  async function choose(v: string) {
    setSaving(true); setErr(""); setSavedOk(false);
    onMsgPermissionChange(v); // atualiza estado pai imediatamente
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setErr("Não autenticado."); setSaving(false); return; }
    const { error } = await supabase.from("profiles")
      .update({ msg_permission: v } as any).eq("id", session.user.id);
    setSaving(false);
    if (error) { setErr(`Erro: ${error.message}`); }
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  return (
    <SettingsSubPanel title={t("settings.msg_privacy")} onBack={onBack}>
      <div className="mb-2">
        {savedOk && (
          <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Guardado
          </p>
        )}
        <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Quem pode enviar-te mensagens?</p>
        <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          {OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => choose(opt.value)} disabled={saving}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-60"
              onMouseOver={e => (e.currentTarget.style.background = "var(--s3)")}
              onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition"
                style={{
                  borderColor: msgPermission === opt.value ? ACCENT : "var(--border-default)",
                  background:  msgPermission === opt.value ? ACCENT : "transparent",
                }}>
                {msgPermission === opt.value && <div className="w-2 h-2 rounded-full bg-[var(--s2)]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
              </div>
              {saving && msgPermission === opt.value && (
                <div className="w-4 h-4 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
              )}
            </button>
          ))}
        </div>
        {err && <p className="px-5 pt-2 text-xs text-red-500">{err}</p>}
        <p className="px-5 pt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Esta definição aplica-se a novos pedidos. Conversas existentes não são afetadas.
        </p>
      </div>
    </SettingsSubPanel>
  );
}

/* ─── Sobre ─── */
export function AboutPanel({ onBack }: { onBack: () => void }) {
  return (
    <SettingsSubPanel title={t("settings.about")} onBack={onBack}>
      <div className="px-5 py-4 space-y-4">
        <div className="rounded-2xl border p-4 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Snapper</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>A tua rede social angolana. Conecta, partilha e cresce com a comunidade Snapper.</p>
        </div>
        <div className="rounded-2xl border divide-y" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
          {[
            { label: t("common.version"), value: "1.0.0" },
            { label: "Termos de serviço", value: "→" },
            { label: "Política de privacidade", value: "→" },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.label}</span>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </SettingsSubPanel>
  );
}

/* ─── Ajuda ─── */
export function HelpPanel({ onBack }: { onBack: () => void }) {
  const faqs = [
    { q: "Como altero a minha foto de perfil?", a: "Vai ao teu perfil e clica na foto de perfil para fazer upload de uma nova imagem." },
    { q: "Como publico um vídeo?", a: "Vai ao SnapperStudio e clica em 'Novo vídeo'. Podes fazer upload e definir título, descrição e visibilidade." },
    { q: "Como acompanho um canal?", a: "Na SnapperTV, clica no canal que queres acompanhar e depois no botão 'Acompanhar'." },
    { q: "Como altero a minha palavra-passe?", a: "Vai a Configurações → Segurança → Alterar palavra-passe." },
    { q: "Como torno o meu perfil privado?", a: "Vai a Configurações → Privacidade e ativa 'Conta privada'." },
    { q: "Como envio mensagens?", a: "Usa o separador Mensagens na barra de navegação. Podes enviar mensagens a outros utilizadores." },
    { q: "Como apago uma publicação?", a: "Vai à publicação, clica no menu (⋯) e seleciona 'Eliminar'." },
    { q: "Como contacto o suporte?", a: "Envia um email para suporte@hooda.app e responderemos em até 48 horas." },
  ];
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SettingsSubPanel title={t("settings.help")} onBack={onBack}>
      <div className="px-3 space-y-2 mb-6">
        <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Perguntas frequentes</p>
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border shadow-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left transition"
              style={{ background: "transparent" }}>
              <span className="text-sm font-semibold leading-snug pr-3" style={{ color: "var(--text-primary)" }}>{faq.q}</span>
              <span className="shrink-0 text-lg font-bold" style={{ color: "var(--text-muted)" }}>{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4">
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{faq.a}</p>
              </div>
            )}
          </div>
        ))}
        <div className="mt-4 rounded-2xl p-4 border text-center" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Ainda tens dúvidas?</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>A nossa equipa responde em até 48 horas.</p>
          <a href="mailto:suporte@hooda.app"
            className="inline-block px-5 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: ACCENT }}>
            Contactar suporte
          </a>
        </div>
      </div>
    </SettingsSubPanel>
  );
}

/* ── ShareProfileModal — link real do perfil, copiar com feedback ── */
function ShareProfileModal({ username, name, onClose }: { username: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/u/${username}`;
  useScrollLock();
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
        style={{ maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Drag indicator mobile */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>Partilhar perfil</span>
          <button onClick={onClose} className="p-1.5 rounded-full transition" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>Link do perfil de <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{name}</span></p>
          {username === "utilizador" && (
            <div className="rounded-2xl px-3 py-2.5 mb-3 text-xs font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
              ⚠️ Ainda não definiste um nome de utilizador. Define um em "Editar perfil" para teres um link permanente.
            </div>
          )}
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Link do perfil</p>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-3" style={{ background: "var(--s2)" }}>
            <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>{url}</span>
            <button onClick={copy}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1"
              style={{ background: copied ? "#6BA547" : "#2F6FED", color: "#fff" }}>
              {copied ? (<><Check className="h-3.5 w-3.5" /> Copiado</>) : "Copiar"}
            </button>
          </div>

          {typeof navigator.share === "function" && (
            <button onClick={() => navigator.share({ title: name, url }).catch(() => {})}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.98] border"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
              Partilhar via...
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MyProfile({ profile: initialProfile, email, onSignOut, loading: profileLoading }: {
  profile: Profile | null; email: string; onSignOut: () => void; loading?: boolean;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(initialProfile);
  // O profile inicial pode chegar como null e ser reparado depois (auto-fix
  // do username em ProfilePage); sem isto o state interno fica preso a null.
  useEffect(() => {
    if (initialProfile) setProfile(initialProfile);
  }, [initialProfile]);
  const name = profile?.full_name || profile?.username || email?.split("@")[0] || "?";
  const [tab, setTab] = useState<"info">("info");
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [photoViewing, setPhotoViewing] = useState<string|null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMsgPrivacy, setShowMsgPrivacy] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const { setAvatarUrl: setGlobalAvatarUrl } = useAvatar();
  const [msgPermission, setMsgPermission] = useState("todos");
  const [myUserId, setMyUserId] = useState<string>("");
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [photoViewerSrc, setPhotoViewerSrc] = useState<string | null>(null);

  function pickFile(ref: React.RefObject<HTMLInputElement | null>, onDone: (url: string) => void, saveToDb?: "avatar" | "cover") {
    if (!ref.current) return;
    ref.current.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      (e.target as HTMLInputElement).value = "";
      try {
        const folder = saveToDb === "avatar" ? "hooda/avatars" : "hooda/covers";
        toast.loading(saveToDb === "avatar" ? "A carregar foto..." : "A carregar capa...", { id: "img-upload" });
        const { url } = await uploadImageToCloudinary(file, folder);
        onDone(url);
        toast.dismiss("img-upload");
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (saveToDb === "avatar") {
            await supabase.from("profiles").update({ avatar_url: url } as any).eq("id", session.user.id);
            setGlobalAvatarUrl(url);
            toast.success("Foto de perfil actualizada!");
          } else if (saveToDb === "cover") {
            await supabase.from("profiles").update({ cover_url: url } as any).eq("id", session.user.id);
            toast.success("Foto de capa actualizada!");
          }
        }
      } catch (err: any) {
        toast.dismiss("img-upload");
        toast.error(err.message ?? "Erro ao carregar imagem.");
      }
    };
    ref.current.click();
  }

  useEffect(() => { setProfile(initialProfile); }, [initialProfile]);

  /* Load user's posts + follower counts from Supabase on mount */
  useEffect(() => {
    (async () => {
      try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { return; }
      setMyUserId(session.user.id);

      // Carregar avatar_url e username do perfil
      const { data: profData } = await supabase
        .from("profiles")
        .select("avatar_url, username, msg_permission, website, location, cover_url, whatsapp")
        .eq("id", session.user.id)
        .maybeSingle();
      if ((profData as any)?.avatar_url) setAvatarUrl((profData as any).avatar_url);
      if ((profData as any)?.msg_permission) setMsgPermission((profData as any).msg_permission);
      if ((profData as any)?.website) setWebsite((profData as any).website);
      if ((profData as any)?.location) setLocation((profData as any).location);
      if ((profData as any)?.whatsapp) setWhatsapp((profData as any).whatsapp);
      if ((profData as any)?.cover_url) setCoverUrl((profData as any).cover_url);

      const { data } = await (supabase as any)
        .from("posts")
        .select("id, content, kind, created_at, photo_url, image_url, video_url, photos, clip_title, clip_thumb_url, clip_video_id, clip_start, clip_end, poll, poll_ends_at, is_draft, scheduled_at")
        .eq("author_id", session.user.id)
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        const postIds = data.map((p: any) => p.id);
        const [{ data: likesData }, { data: commentsData }, { data: savesData }] = await Promise.all([
          supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
          supabase.from("post_comments").select("post_id").in("post_id", postIds),
          supabase.from("post_saves").select("post_id").eq("user_id", session.user.id).in("post_id", postIds),
        ]);
        const likesByPost: Record<string, string[]> = {};
        (likesData ?? []).forEach((l: any) => {
          if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
          likesByPost[l.post_id].push(l.user_id);
        });
        const commentsByPost: Record<string, number> = {};
        (commentsData ?? []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] ?? 0) + 1; });
        const savedSet = new Set((savesData ?? []).map((s: any) => s.post_id));

        // Each post is identified by its real database id (UUID) — never by
        // array position — and deduplicated up front so the same post can
        // never render twice even if the query were to return it more than
        // once.
        const seenIds = new Set<string>();
        const loaded: Post[] = (data as any[])
          .filter((p: any) => {
            if (!p.id || seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          })
          .map((p: any) => {
            let text = p.content;
            let bgColor: string | null = null;
            if (p.kind === "bg") {
              try {
                const j = JSON.parse(p.content);
                text = j.text;
                bgColor = j.bgColor;
              } catch (_) {}
            }
            const photo = (p as any).photo_url || (p as any).image_url || ((p as any).photos && (p as any).photos[0]) || null;
            const photos = Array.isArray((p as any).photos) && (p as any).photos.length > 0 ? (p as any).photos : null;
            const videoUrl = (p as any).video_url || undefined;
            const clipVideoId = (p as any).clip_video_id || null;
            const clipThumb = (p as any).clip_thumb_url || null;
            const clipTitle = (p as any).clip_title || null;
            const likeIds = likesByPost[p.id] ?? [];
            return {
              id: p.id, text, photo, photos, bgColor, createdAt: new Date(p.created_at ?? Date.now()),
              likes: likeIds.length, likedByMe: likeIds.includes(session.user.id), views_count: (p as any).views_count ?? 0,
              comments: commentsByPost[p.id] ?? 0, bookmarked: savedSet.has(p.id),
              kind: (p as any).kind ?? "post",
              videoUrl: (p as any).video_url || null,
              clipVideoId: clipVideoId,
              clipThumb: clipThumb,
              clipTitle: clipTitle,
              clipStart: (p as any).clip_start ?? 0,
              clipEnd: (p as any).clip_end ?? 0,
              poll: (p as any).poll ?? null,
              pollEndsAt: (p as any).poll_ends_at ?? null,
            };
          });
        // Buscar stream URLs para clips
        const clipIds = loaded.filter((p: any) => p.clipVideoId).map((p: any) => p.clipVideoId);
        if (clipIds.length > 0) {
          const { data: vids } = await (supabase as any).from("videos")
            .select("id,cf_stream_url,cf_embed_url").in("id", [...new Set(clipIds)]);
          const streamMap: Record<string, string> = {};
          (vids ?? []).forEach((v: any) => { streamMap[v.id] = v.cf_stream_url || v.cf_embed_url || ""; });
          setPosts(loaded.map((p: any) => p.clipVideoId
            ? { ...p, videoStreamUrl: streamMap[p.clipVideoId] || null }
            : p));
        } else {
          setPosts(loaded);
        }
      }
      } finally {
        setPostsLoading(false);
        setStatsLoading(false);
      }
    })();
  }, []);

  function addPost(post: Post) {
    setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
  }

  /* Carregar respostas, reposts e quotes (tab "Respostas") sob pedido */
  useEffect(() => {
    if (tab !== "replies" || !myUserId || activitiesLoaded) return;
    (async () => {
      setActivitiesLoading(true);
      try {
        const [repliesRes, repostsRes, quotesRes] = await Promise.all([
          (supabase as any).from("post_replies")
            .select("id, post_id, content, media_url, media_type, created_at")
            .eq("author_id", myUserId)
            .order("created_at", { ascending: false }),
          (supabase as any).from("post_reposts")
            .select("id, post_id, created_at")
            .eq("user_id", myUserId)
            .order("created_at", { ascending: false }),
          (supabase as any).from("post_quotes")
            .select("id, original_post_id, content, media_url, media_type, created_at")
            .eq("author_id", myUserId)
            .order("created_at", { ascending: false }),
        ]);

        const replies = repliesRes.data ?? [];
        const reposts = repostsRes.data ?? [];
        const quotes  = quotesRes.data ?? [];

        // Recolher todos os post_id originais para buscar de uma vez
        const allOriginalIds = [
          ...replies.map((r: any) => r.post_id),
          ...reposts.map((r: any) => r.post_id),
          ...quotes.map((q: any) => q.original_post_id),
        ].filter(Boolean);

        const originalsMap: Record<string, any> = {};
        if (allOriginalIds.length > 0) {
          const { data: originals } = await (supabase as any)
            .from("posts")
            .select("id, content, kind, image_url, video_url, author_username, author_name, author_color, created_at")
            .in("id", [...new Set(allOriginalIds)]);
          (originals ?? []).forEach((o: any) => { originalsMap[o.id] = o; });
        }

        function getOriginalText(o: any) {
          if (!o) return null;
          if (o.kind === "bg") { try { return JSON.parse(o.content).text; } catch { return o.content; } }
          return o.content;
        }

        const merged = [
          ...replies.map((r: any) => ({
            id: `reply-${r.id}`, type: "reply" as const,
            content: r.content, mediaUrl: r.media_url, createdAt: r.created_at,
            original: originalsMap[r.post_id] ? {
              id: r.post_id,
              text: getOriginalText(originalsMap[r.post_id]),
              author: originalsMap[r.post_id].author_username,
              authorName: originalsMap[r.post_id].author_name,
              authorColor: originalsMap[r.post_id].author_color,
              image: originalsMap[r.post_id].image_url,
              videoUrl: originalsMap[r.post_id].video_url || null,
            } : null,
          })),
          ...reposts.map((r: any) => ({
            id: `repost-${r.id}`, type: "repost" as const,
            content: null, mediaUrl: null, createdAt: r.created_at,
            original: originalsMap[r.post_id] ? {
              id: r.post_id,
              text: getOriginalText(originalsMap[r.post_id]),
              author: originalsMap[r.post_id].author_username,
              authorName: originalsMap[r.post_id].author_name,
              authorColor: originalsMap[r.post_id].author_color,
              image: originalsMap[r.post_id].image_url,
              videoUrl: originalsMap[r.post_id].video_url || null,
            } : null,
          })),
          ...quotes.map((q: any) => ({
            id: `quote-${q.id}`, type: "quote" as const,
            content: q.content, mediaUrl: q.media_url, createdAt: q.created_at,
            original: originalsMap[q.original_post_id] ? {
              id: q.original_post_id,
              text: getOriginalText(originalsMap[q.original_post_id]),
              author: originalsMap[q.original_post_id].author_username,
              authorName: originalsMap[q.original_post_id].author_name,
              authorColor: originalsMap[q.original_post_id].author_color,
              image: originalsMap[q.original_post_id].image_url,
              videoUrl: originalsMap[q.original_post_id].video_url || null,
            } : null,
          })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setActivities(merged);
        setActivitiesLoaded(true);
      } catch (e) {
        toast.error("Não foi possível carregar as respostas.");
      } finally {
        setActivitiesLoading(false);
      }
    })();
  }, [tab, myUserId, activitiesLoaded]);

  /* Carregar publicações guardadas (tab "Guardado") sob pedido */
  useEffect(() => {
    if (tab !== "saved" || !myUserId) return;
    (async () => {
      setSavedLoading(true);
      const { data: saveRows } = await supabase.from("post_saves").select("post_id").eq("user_id", myUserId);
      const postIds = [...new Set((saveRows ?? []).map((r: any) => r.post_id))];
      if (postIds.length === 0) { setSavedPosts([]); setSavedLoading(false); return; }

      const { data: postsData } = await supabase
        .from("posts")
        .select("id, content, kind, created_at, photo_url, image_url, video_url, photos, author_id, author_username, author_name")
        .in("id", postIds);
      const rows = postsData ?? [];

      const [{ data: likesData }, { data: commentsData }] = await Promise.all([
        supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
        supabase.from("post_comments").select("post_id").in("post_id", postIds),
      ]);
      const likesByPost: Record<string, string[]> = {};
      (likesData ?? []).forEach((l: any) => {
        if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
        likesByPost[l.post_id].push(l.user_id);
      });
      const commentsByPost: Record<string, number> = {};
      (commentsData ?? []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] ?? 0) + 1; });

      const authorIds = [...new Set(rows.map((p: any) => p.author_id).filter(Boolean))];
      const { data: authorProfiles } = authorIds.length > 0
        ? await supabase.from("profiles").select("id,avatar_url,is_verified").in("id", authorIds)
        : { data: [] as any[] };
      const avatarByAuthor: Record<string, string | null> = {};
      const verifiedByAuthor: Record<string, boolean> = {};
      (authorProfiles ?? []).forEach((p: any) => { avatarByAuthor[p.id] = p.avatar_url ?? null; verifiedByAuthor[p.id] = !!p.is_verified; });

      const loaded: SavedPost[] = rows.map((p: any) => {
        let text = p.content;
        let bgColor: string | null = null;
        if (p.kind === "bg") {
          try { const j = JSON.parse(p.content); text = j.text; bgColor = j.bgColor; } catch (_) {}
        }
        const photo = (p as any).photo_url || (p as any).image_url || ((p as any).photos && (p as any).photos[0]) || null;
        const photos = Array.isArray((p as any).photos) && (p as any).photos.length > 0 ? (p as any).photos : null;
        const videoUrl = (p as any).video_url || undefined;
        const likeIds = likesByPost[p.id] ?? [];
        return {
          id: p.id, text, photo, photos, bgColor, createdAt: new Date(p.created_at ?? Date.now()),
          likes: likeIds.length, likedByMe: likeIds.includes(myUserId), views_count: (p as any).views_count ?? 0,
          comments: commentsByPost[p.id] ?? 0, bookmarked: true,
          videoUrl,
          authorId: p.author_id, authorName: p.author_name || p.author_username || "hooda",
          authorUsername: p.author_username || "utilizador",
          authorAvatar: p.author_id ? avatarByAuthor[p.author_id] ?? null : null,
          authorIsVerified: p.author_id ? !!verifiedByAuthor[p.author_id] : false,
        };
      }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setSavedPosts(loaded);
      setSavedLoading(false);
    })();
  }, [tab, myUserId]);

  async function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  async function saveProfile(data: Partial<Profile> & { website?: string; location?: string; whatsapp?: string }) {
    setProfile((p) => p ? { ...p, ...data } : p);
    if (data.website) setWebsite(data.website);
    if (data.location) setLocation(data.location);
    if (data.whatsapp !== undefined) setWhatsapp(data.whatsapp);

    // Atualizar nome e username em todos os posts do utilizador
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && (data.full_name || data.username)) {
        const updates: Record<string, string> = {};
        if (data.full_name) updates.author_name     = data.full_name;
        if (data.username)  updates.author_username = data.username;
        await (supabase as any).from("posts").update(updates).eq("author_id", session.user.id);

        // Registar data de troca de username
        if (data.username && data.username !== profile?.username) {
          await (supabase as any).from("profiles")
            .update({ username_changed_at: new Date().toISOString() })
            .eq("id", session.user.id);
          setProfile(p => p ? { ...p, username_changed_at: new Date().toISOString() } : p);
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar nome nos posts:", err);
    }
  }

  const tabs = [
    { key: "info", label: "Info", icon: Info },
  ] as const;

  /* Enquanto o perfil (nome/username) ainda não chegou do Supabase,
     mostra o skeleton universal — nunca "?" ou vazio a piscar no ecrã. */
  if (profileLoading && !profile) return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
        <UniversalSkeleton variant="profile" />
        <BottomNav />
      </PageWrapper>
    </div>
  );

  return (
    <div className="flex">
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
    <FeedLayout
      feed={
      <>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
        <div className="px-4 h-14 flex items-center gap-4">
          <SnapperLogo size="sm" className="lg:hidden" />
          <div className="hidden lg:block leading-tight">
            <p className="text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>{name}</p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {postsLoading
                ? <span className="relative overflow-hidden inline-block h-2.5 w-14 rounded align-middle" style={{ background: "var(--surface-2,#e9e9e4)" }}>
                    <span className="skeleton-shimmer absolute inset-0" />
                  </span>
                : <>{fmtNum(posts.length)} {t("profile.publications")}</>}
            </p>
          </div>
          <span aria-hidden className="w-9 lg:hidden" />
        </div>
      </header>

      {/* Inputs de ficheiro ocultos */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" />

      <main className="w-full">
        {/* Capa */}
        <div className="relative">
          <div className="h-52 relative overflow-hidden"
            style={coverUrl ? undefined : { background: "linear-gradient(135deg,#2F6FED 0%,#8B5CF6 55%,#2F6FED 100%)" }}>
            {coverUrl && <img src={optimizePostPhoto(coverUrl, 1200)} alt="capa" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            {/* Botão câmera da capa */}
            <button onClick={() => pickFile(coverInputRef, setCoverUrl, "cover")}
              className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow"
              style={{ background: "rgba(0,0,0,0.45)" }}>
              <Camera className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="absolute left-5" style={{ bottom: -66 }}>
            <div className="relative">
              <div
                onClick={() => avatarUrl && setPhotoViewerSrc(avatarUrl)}
                style={{
                  width: 132, height: 132, borderRadius: "50%",
                  border: "4px solid var(--surface-0)",
                  overflow: "hidden", background: avatarUrl ? "transparent" : getColor(name),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 40, fontWeight: 700, color: "white",
                  cursor: avatarUrl ? "pointer" : "default",
                }}>
                {avatarUrl
                  ? <img src={optimizeAvatar(avatarUrl, 264)} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : (name?.[0] ?? "?").toUpperCase()}
              </div>
              <button onClick={() => pickFile(avatarInputRef, setAvatarUrl, "avatar")}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow"
                style={{ background: ACCENT }}>
                <Camera className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Editar perfil + Partilhar */}
        <div className="flex justify-end gap-2 px-4 pt-3 pb-0">
          <button onClick={() => setShowShareModal(true)}
            title="Partilhar perfil"
            className="w-9 h-9 rounded-full flex items-center justify-center border transition hover:bg-[var(--s2)] active:scale-95"
            style={{borderColor:"var(--border-default)",color:"var(--text-muted)"}}>
            <Share2 className="h-4 w-4"/>
          </button>
          <button onClick={() => setShowEditProfile(true)}
            className="text-sm font-bold border border-neutral-300 rounded-full px-5 py-1.5 bg-[var(--s2)] hover:bg-[var(--s1)] transition active:scale-95">
            {t("settings.edit_profile")}
          </button>
        </div>

        {/* Info pessoal */}
        <div className="px-5 pt-9 pb-3">
          <div className="flex items-center gap-1">
            <p className="text-xl font-extrabold leading-tight inline-flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
              {name}{(profile as any)?.is_verified && <VerifiedBadge size={17} />}
            </p>
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-0.5">@{profile?.username || "utilizador"}</p>
          {profile?.bio && (
            <p className="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-3">
            {location && (
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <MapPin className="h-3.5 w-3.5" /> {location}
              </span>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: ACCENT }}>
                <Link className="h-3.5 w-3.5" /> {website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: "#25D366" }}>
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Calendar className="h-3.5 w-3.5" /> {"Membro desde"} {new Date((profile as any)?.created_at ?? Date.now()).getFullYear()}
            </span>
          </div>
        </div>

        {/* Tabs estilo X — texto, sublinhado fino */}
        <div className="px-1 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {tabs.map((tItem) => (
            <button key={tItem.key}
              onClick={() => setTab(tItem.key)}
              className="flex-1 min-w-0 relative py-4 px-1 text-[13px] sm:text-[14px] font-bold transition-colors hover:bg-[var(--s2)] truncate"
              style={{ color: tab === tItem.key ? "var(--text-primary)" : "var(--text-muted)" }}>
              <span className="truncate">{tItem.label}</span>
              {tab === tItem.key && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-14 rounded-full" style={{ background: ACCENT }} />
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo das tabs */}
        {tab === "info" && (
          <div className="px-5 py-4 space-y-3">
            <div className="bg-[var(--s2)] rounded-2xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
              <p className="px-5 py-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">Sobre</p>
              {[
                { label: t("profile.full_name"), value: name },
                { label: "Username", value: `@${profile?.username || "—"}` },
                { label: t("auth.email"), value: email },
                { label: t("profile.location"), value: location || "—" },
                { label: t("profile.website"), value: website || "—" },
              ].map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-[var(--border-subtle)]" : ""}`}>
                  <span className="text-xs text-[var(--text-muted)] font-medium">{row.label}</span>
                  <span className="text-sm font-semibold text-black text-right max-w-[60%] truncate">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      </>
      }
      sidebar={<RightSidebar />}
    />

      {/* Drawers & Modais */}
      {showSettings && (
        <SettingsDrawer
          onClose={() => setShowSettings(false)}
          onEditProfile={() => setShowEditProfile(true)}
          onSignOut={onSignOut}
          msgPermission={msgPermission}
          profile={profile}
          onMsgPermissionChange={async (v) => {
            setMsgPermission(v);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
          }}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenActivity={() => setShowActivity(true)}
          onOpenPrivacy={() => setShowPrivacy(true)}
          onOpenSecurity={() => setShowSecurity(true)}
          onOpenHelp={() => { setShowSettings(false); setShowHelp(true); }}
          onOpenAbout={() => { setShowSettings(false); setShowAbout(true); }}
          onOpenLanguage={() => { setShowSettings(false); setShowLanguage(true); }}
          onOpenMsgPrivacy={() => { setShowSettings(false); setShowMsgPrivacy(true); }}
        />
      )}
      {showNotifications && <NotificationsPanel onBack={() => setShowNotifications(false)} />}
      {showActivity && <ActivityPanel onBack={() => setShowActivity(false)} />}
      {showPrivacy && <PrivacyPanel onBack={() => setShowPrivacy(false)} />}
      {showSecurity && <SecurityPanel onBack={() => setShowSecurity(false)} email={email} />}
      {showHelp && <HelpPanel onBack={() => setShowHelp(false)} />}
      {photoViewing && (
        <div className="fixed inset-0 flex items-center justify-center"
          style={{background:"rgba(0,0,0,0.96)", zIndex:9999}}
          onClick={()=>setPhotoViewing(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
            style={{background:"rgba(255,255,255,0.15)"}}>
            <X className="h-5 w-5 text-white"/>
          </button>
          <img src={optimizePostPhoto(photoViewing, 1200)} alt="" className="object-contain"
            style={{maxWidth:"95vw",maxHeight:"92vh",borderRadius:8}}
            onClick={e=>e.stopPropagation()}
            onContextMenu={e=>e.preventDefault()}/>
        </div>
      )}
      {showAbout && <AboutPanel onBack={() => setShowAbout(false)} />}
      {showLanguage && <LanguagePanel onBack={() => setShowLanguage(false)} />}
      {showMsgPrivacy && <MsgPrivacyPanel onBack={() => setShowMsgPrivacy(false)} msgPermission={msgPermission} onMsgPermissionChange={async (v) => {
        setMsgPermission(v);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
      }} />}
      {showEditProfile && (
        <EditProfileModal
          profile={profile ? { ...profile, website, location, whatsapp } as any : profile}
          email={email}
          onClose={() => setShowEditProfile(false)}
          onSave={(data) => { saveProfile(data); setShowEditProfile(false); }}
        />
      )}
      {showShareModal && (
        <ShareProfileModal username={profile?.username || "utilizador"} name={name} onClose={() => setShowShareModal(false)} />
      )}
      {photoViewerSrc && (
        <PhotoViewer src={photoViewerSrc} alt={name} subtitle={profile?.username ? `@${profile.username}` : undefined} onClose={() => setPhotoViewerSrc(null)} />
      )}
    </PageWrapper>
    </div>
  );
}

/* ─── Perfil público ─── */
function PublicProfile({ profile, email }: { profile: Profile | null; email: string }) {
  const [myUserId, setMyUserId] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const navigate = useNavigate();
  const name = profile?.full_name || profile?.username || email?.split("@")[0] || "?";

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setMyUserId(session.user.id);
      setSessionChecked(true);
    })();
  }, []);

  return (
    <>
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
        <div className="px-4 lg:pl-10 h-14 flex items-center">
          <SnapperLogo size="sm" />
        </div>
      </header>
      <main className="w-full">
        <div className="h-52 relative" style={{ background: "linear-gradient(135deg,#2F6FED 0%,#8B5CF6 55%,#2F6FED 100%)" }}>
          <div className="absolute left-5" style={{ bottom: -60 }}>
            <div style={{ border: "4px solid var(--surface-0)", borderRadius: "50%" }}>
              <Avatar name={name} size={124} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 pt-3">
          <button
            onClick={() => navigate({ to: "/mensagens" })}
            className="text-sm font-semibold border border-neutral-300 rounded-full px-4 py-1.5 bg-[var(--s2)] hover:bg-[var(--s1)] flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
          >
            <MessageCircle className="h-4 w-4" style={{ color: "#2F6FED" }} /> Mensagem
          </button>
        </div>
        <div className="px-5 pt-9 pb-3">
          <p className="text-xl font-extrabold text-black">{name}</p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">@{profile?.username || "..."}</p>
          {profile?.bio && <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{profile.bio}</p>}
        </div>
        <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-[#2F6FED]/10 flex items-center justify-center">
            <BookOpen className="h-7 w-7 text-[#2F6FED]" />
          </div>
          <p className="text-sm font-semibold text-[var(--text-muted)]">Ainda não há publicações.</p>
        </div>
        <div className="px-4 pb-6">
          <button className="w-full h-11 rounded-xl border border-[var(--border-default)] text-[var(--text-muted)] text-sm flex items-center justify-center gap-2 hover:bg-[var(--s2)] shadow-sm">
            <Flag className="h-4 w-4" /> Denunciar perfil
          </button>
        </div>
      </main>
    </PageWrapper>
    </>
  );
}

/* ─── Página principal ─── */
function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [isOwner] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate({ to: "/", replace: true }); return; }
      setEmail(session.session.user.email ?? "");
      // Tenta buscar com username_changed_at; se a coluna não existir faz fallback
      let data: any = null;
      const { data: d1, error: e1 } = await supabase
        .from("profiles")
        .select("id, username, full_name, age, bio, username_changed_at, is_verified")
        .eq("id", session.session.user.id)
        .maybeSingle();
      if (e1) {
        const isMissingColumn = e1.message?.includes("username_changed_at") || e1.code === "42703";
        console.warn(
          isMissingColumn
            ? "[hooda] Coluna 'username_changed_at' não existe na tabela profiles. " +
              "O cooldown de 30 dias para trocar username NÃO vai funcionar até correres este SQL no Supabase:\n" +
              "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;"
            : "[hooda] Erro ao carregar perfil (não é a coluna username_changed_at):",
          "\nCódigo:", e1.code, "\nMensagem:", e1.message, "\nDetalhes:", e1.details, "\nHint:", e1.hint,
          e1
        );
        // Coluna pode não existir ainda — fallback sem ela
        const { data: d2 } = await supabase
          .from("profiles")
          .select("id, username, full_name, age, bio")
          .eq("id", session.session.user.id)
          .maybeSingle();
        data = d2;
      } else {
        data = d1;
      }

      // Auto-reparação: cobre dois casos —
      //  (a) o profile existe mas ficou sem username (trigger correu mas com
      //      metadata vazia, ou foi apagado por engano);
      //  (b) o profile NÃO EXISTE DE TODO (a causa real mais comum): o
      //      trigger handle_new_user que cria a linha em "profiles" ao
      //      registar não correu para esta conta (ex: migration que o
      //      define não chegou a ser aplicada no Supabase de produção, ou
      //      a conta foi criada antes dessa migration existir). Antes,
      //      este código só tratava o caso (a) — `if (data && !data.username)`
      //      — por isso quando `data` vinha `null` (sem linha nenhuma) o
      //      bloco inteiro era saltado e `profile` ficava `null` PARA
      //      SEMPRE, mostrando "@utilizador" em todos os carregamentos,
      //      sem nunca se corrigir sozinho.
      console.log("[hooda:debug] profile carregado:", data);
      if (!data || !data.username) {
        console.log("[hooda:debug] profile ausente ou sem username, a iniciar auto-reparação...");
        const meta = session.session.user.user_metadata as any;
        console.log("[hooda:debug] user_metadata:", meta);
        let recoveredUsername = (meta?.username || "").toLowerCase().trim()
          || `user${session.session.user.id.slice(0, 8)}`;
        const recoveredName = meta?.full_name || data?.full_name || "";

        let repaired: any = null;
        let repairErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          // upsert (não update): se a linha não existir, cria-a; se existir,
          // só atualiza os campos indicados — nunca falha por "0 linhas".
          const res = await supabase
            .from("profiles")
            .upsert({
              id: session.session.user.id,
              username: recoveredUsername,
              full_name: recoveredName || undefined,
              ...(data ? {} : { age: null, bio: null }),
            } as any, { onConflict: "id" })
            .select("id, username, full_name, age, bio")
            .maybeSingle();
          repaired = res.data;
          repairErr = res.error;
          if (!repairErr) break;
          console.warn(`[hooda:debug] tentativa ${attempt + 1} falhou:`, repairErr);
          // Se for conflito de username único, tenta outro
          if (repairErr.message?.includes("duplicate") || repairErr.code === "23505") {
            recoveredUsername = `user${session.session.user.id.slice(0, 8)}${attempt}`;
          } else {
            break; // erro não relacionado com duplicado — não adianta repetir
          }
        }

        if (!repairErr && repaired) {
          console.log("[hooda:debug] auto-reparação concluída com sucesso:", repaired);
          data = repaired;
        } else if (repairErr) {
          console.error(
            "[hooda] FALHA na auto-reparação do username. Motivo:", repairErr.message || repairErr,
            "\nPossíveis causas: RLS bloqueando o UPDATE/INSERT, ou a policy 'Users update own profile' / 'Users insert own profile' não existe/está errada.",
            "\nVerifica no Supabase: Authentication → Policies → tabela profiles."
          );
          // Mesmo sem conseguir gravar na BD, mostra o username recuperado
          // no ecrã já nesta sessão em vez de "utilizador" — melhor do que
          // nada, mas o aviso na consola acima explica a causa real para
          // ires corrigir a policy/trigger na BD.
          data = { ...(data ?? {}), id: session.session.user.id, username: recoveredUsername };
        }
      }

      if (data) setProfile(data as Profile);
      setProfileLoading(false);
    })();
  }, [navigate]);

  async function signOut() {
    await signOutSnapper();
    navigate({ to: "/", replace: true });
  }

  if (isOwner) return <MyProfile profile={profile} email={email} onSignOut={signOut} loading={profileLoading} />;
  return <PublicProfile profile={profile} email={email} />;
}
