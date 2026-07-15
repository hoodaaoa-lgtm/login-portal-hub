import { useState, useRef } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

const P = "#2F6FED";
const CATEGORIAS = [
  "Anime", "Filme", "Novela", "Jogos", "Música", "Humor",
  "Notícias", "Desporto", "Tecnologia", "Lifestyle", "Outro",
];

interface Channel {
  id: string;
  name: string;
  username: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  category: string;
  is_adult: boolean;
}

export function CanalEditModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: Channel;
  onClose: () => void;
  onSaved: (updated: Partial<Channel>) => void;
}) {
  const [name, setName] = useState(channel.name ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [category, setCategory] = useState(channel.category ?? "Outro");
  const [isAdult, setIsAdult] = useState(!!channel.is_adult);
  const [avatarUrl, setAvatarUrl] = useState(channel.avatar_url);
  const [coverUrl, setCoverUrl] = useState(channel.cover_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarPick(file: File | undefined) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { url } = await uploadImageToCloudinary(file, "hooda/channels/avatars");
      setAvatarUrl(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar a foto de perfil.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleCoverPick(file: File | undefined) {
    if (!file) return;
    setUploadingCover(true);
    try {
      const { url } = await uploadImageToCloudinary(file, "hooda/channels/covers");
      setCoverUrl(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar a foto de capa.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Dá um nome ao canal."); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        is_adult: isAdult,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
      };
      const { error } = await (supabase as any)
        .from("channels")
        .update(payload)
        .eq("id", channel.id);
      if (error) throw error;
      toast.success("Canal atualizado!");
      onSaved(payload);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: "var(--surface-0)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
          <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Editar canal</span>
          <button onClick={onClose} className="p-1 -mr-1">
            <X className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          </button>
        </div>

        <div className="h-28 relative" style={{ background: coverUrl ? undefined : "var(--s2)" }}>
          {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" />}
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => handleCoverPick(e.target.files?.[0])} />
          <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
            className="absolute right-2 bottom-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
            {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Capa
          </button>
        </div>

        <div className="px-4">
          <div className="-mt-9 mb-2 relative w-[72px] h-[72px]">
            <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden"
              style={{ background: P, border: "3px solid var(--surface-0)" }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-white font-bold text-lg">{name?.[0]?.toUpperCase()}</span>}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleAvatarPick(e.target.files?.[0])} />
            <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{ background: uploadingAvatar ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)" }}>
              {uploadingAvatar
                ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                : <Camera className="h-4 w-4 text-white" />}
            </button>
          </div>

          <div className="pb-5 flex flex-col gap-3.5">
            <div>
              <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Nome do canal</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do canal"
                className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                style={{ background: "var(--s2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
            </div>

            <div>
              <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Descrição</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Sobre o que é este canal" rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: "var(--s2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
            </div>

            <div>
              <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                style={{ background: "var(--s2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: "var(--s2)" }}>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Comunidade +18</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Conteúdo só para adultos</p>
              </div>
              <button onClick={() => setIsAdult(v => !v)}
                className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                style={{ background: isAdult ? P : "var(--s3)" }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  style={{ left: isAdult ? 22 : 2 }} />
              </button>
            </div>

            <button onClick={handleSave} disabled={saving || uploadingAvatar || uploadingCover}
              className="w-full h-11 rounded-full text-sm font-bold text-white flex items-center justify-center gap-2 mt-1"
              style={{ background: P, opacity: (saving || uploadingAvatar || uploadingCover) ? 0.7 : 1 }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
