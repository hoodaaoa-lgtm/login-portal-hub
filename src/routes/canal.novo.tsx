import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SideNav, BottomNav, PageWrapper } from "@/components/AppShell";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

export const Route = createFileRoute("/canal/novo")({
  head: () => ({ meta: [{ title: "Criar canal — Snapper" }] }),
  component: CriarCanalPage,
});

const P = "#2F6FED";
const CATEGORIAS = [
  "Anime", "Filme", "Novela", "Jogos", "Música", "Humor",
  "Notícias", "Desporto", "Tecnologia", "Lifestyle", "Outro",
];

function slugify(s: string) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 30);
}

function CriarCanalPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [isAdult, setIsAdult] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function handleNomeChange(v: string) {
    setNome(v);
    if (!usernameTouched) setUsername(slugify(v));
  }

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

  async function handleCriar() {
    if (!nome.trim()) { toast.error("Dá um nome ao canal."); return; }
    if (!username.trim()) { toast.error("Escolhe um username para o canal."); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Precisas de iniciar sessão."); setSaving(false); return; }

      const { data, error } = await (supabase as any).rpc("channel_criar", {
        p_username: username.trim(),
        p_name: nome.trim(),
        p_avatar_url: avatarUrl,
        p_cover_url: coverUrl,
        p_description: descricao.trim() || null,
        p_category: categoria,
        p_is_adult: isAdult,
      });
      if (error) throw error;
      toast.success("Canal criado!");
      navigate({ to: "/c/$username", params: { username: username.trim() } });
    } catch (e: any) {
      const msg = e?.message?.includes("duplicate") || e?.code === "23505"
        ? "Esse username já está a ser usado por outro canal."
        : (e?.message ?? "Não foi possível criar o canal.");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
        <div className="max-w-lg mx-auto w-full">

          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
            style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
            <button onClick={() => navigate({ to: "/home" })} className="p-1 -ml-1">
              <ChevronLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            </button>
            <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Criar canal</span>
          </div>

          <div className="rounded-2xl overflow-hidden mx-4 mt-4" style={{ border: "1px solid var(--border-subtle)" }}>
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
                  style={{ background: P, border: "3px solid var(--surface-2)" }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <Camera className="h-5 w-5 text-white" />}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleAvatarPick(e.target.files?.[0])} />
                <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full flex items-center justify-center"
                  style={{ background: uploadingAvatar ? "rgba(0,0,0,0.35)" : "transparent" }}>
                  {uploadingAvatar && <Loader2 className="h-4 w-4 text-white animate-spin" />}
                </button>
              </div>

              <div className="pb-4 flex flex-col gap-3.5">
                <div>
                  <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Nome do canal</label>
                  <input value={nome} onChange={e => handleNomeChange(e.target.value)} placeholder="Ex: Anime Angola"
                    className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                    style={{ background: "var(--s2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                </div>

                <div>
                  <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Username</label>
                  <div className="flex items-center h-10 px-3 rounded-xl gap-1"
                    style={{ background: "var(--s2)", border: "1px solid var(--border-default)" }}>
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>@</span>
                    <input value={username}
                      onChange={e => { setUsernameTouched(true); setUsername(slugify(e.target.value)); }}
                      placeholder="animeangola"
                      className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--text-primary)" }} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>snapper.app/c/{username || "..."}</p>
                </div>

                <div>
                  <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Descrição</label>
                  <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
                    placeholder="Sobre o que é este canal" rows={3}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{ background: "var(--s2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                </div>

                <div>
                  <label className="text-[12px] font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>Categoria</label>
                  <select value={categoria} onChange={e => setCategoria(e.target.value)}
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

                <button onClick={handleCriar} disabled={saving}
                  className="w-full h-11 rounded-full text-sm font-bold text-white flex items-center justify-center gap-2 mt-1"
                  style={{ background: P, opacity: saving ? 0.7 : 1 }}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar canal
                </button>
              </div>
            </div>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </div>
  );
}
