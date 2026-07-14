import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageWrapper, PageHeader, SideNav } from "@/components/AppShell";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { criarRede } from "@/lib/redes";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/redes/nova")({
  head: () => ({ meta: [{ title: "Criar Rede · Baya" }] }),
  component: NovaRedePage,
});

const CATEGORIAS = ["Música", "Tecnologia", "Futebol", "Notícias", "Educação", "Negócios", "Entretenimento", "Outra"];

function OpcaoCard({ selected, onClick, title, desc }: { selected: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3 rounded-xl border transition"
      style={{ borderColor: selected ? "#5B3FCF" : "var(--border-subtle)", background: selected ? "color-mix(in oklab, #5B3FCF 10%, transparent)" : "var(--s1)" }}>
      <p className="text-sm font-bold" style={{ color: selected ? "#5B3FCF" : "var(--text-primary)" }}>{title}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
    </button>
  );
}

function NovaRedePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0]);
  const [tipo, setTipo] = useState<"publica" | "privada" | "canal">("publica");
  const [temChat, setTemChat] = useState(true);
  const [saving, setSaving] = useState(false);

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  }

  const canSubmit = nome.trim().length >= 2 && username.trim().length >= 3 && !saving;

  async function submit() {
    if (!canSubmit || !user) return;
    setSaving(true);
    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const up = await uploadImageToCloudinary(avatarFile, "redes");
        avatarUrl = up.url;
      }
      const rede = await criarRede({
        nome: nome.trim(), username, avatarUrl, categoria, tipo, temChat,
      });
      toast.success("Rede criada!");
      navigate({ to: "/redes/$username", params: { username: rede.username } });
    } catch (e: any) {
      const msg = e?.message?.includes("duplicate") || e?.code === "23505"
        ? "Esse @username já está em uso. Escolhe outro."
        : (e?.message ?? "Não foi possível criar a Rede.");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="flex-1 min-w-0">
        <div className="max-w-[600px] mx-auto lg:border-x min-h-screen" style={{ borderColor: "var(--border-subtle)" }}>
          <PageHeader title="Criar Rede" onBack={() => navigate({ to: "/redes" })} />

          <div className="px-4 py-5 space-y-6">
            {/* Foto */}
            <div className="flex justify-center">
              <button onClick={() => fileRef.current?.click()}
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center relative"
                style={{ background: "var(--s2)", border: "2px dashed var(--border-subtle)" }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  : <Camera className="h-6 w-6" style={{ color: "var(--text-muted)" }} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            </div>

            {/* Nome */}
            <div>
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Nome da Rede</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Música Angola"
                className="w-full mt-1 h-11 rounded-xl px-3 text-sm outline-none" style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
            </div>

            {/* Username */}
            <div>
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Nome de usuário da Rede</label>
              <div className="flex items-center mt-1 h-11 rounded-xl px-3" style={{ background: "var(--s2)" }}>
                <span style={{ color: "var(--text-muted)" }}>@</span>
                <input value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                  placeholder="musica_angola"
                  className="flex-1 bg-transparent outline-none text-sm ml-1" style={{ color: "var(--text-primary)" }} />
              </div>
            </div>

            {/* Categoria */}
            <div>
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Categoria da Rede</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CATEGORIAS.map((c) => (
                  <button key={c} onClick={() => setCategoria(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: categoria === c ? "#5B3FCF" : "var(--s2)", color: categoria === c ? "#fff" : "var(--text-secondary)" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo */}
            <div>
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Tipo da Rede</label>
              <div className="flex flex-col gap-2 mt-2">
                <OpcaoCard selected={tipo === "publica"} onClick={() => setTipo("publica")} title="Pública" desc="Qualquer pessoa pode encontrar e entrar." />
                <OpcaoCard selected={tipo === "privada"} onClick={() => setTipo("privada")} title="Privada" desc="É preciso aprovação para entrar." />
                <OpcaoCard selected={tipo === "canal"} onClick={() => setTipo("canal")} title="Canal" desc="Só administradores publicam." />
              </div>
            </div>

            {/* Conversa */}
            <div>
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Conversa</label>
              <div className="flex flex-col gap-2 mt-2">
                <OpcaoCard selected={temChat} onClick={() => setTemChat(true)} title="Com chat de conversa" desc="Os membros podem conversar entre si." />
                <OpcaoCard selected={!temChat} onClick={() => setTemChat(false)} title="Sem chat de conversa" desc="Só publicações, sem conversa em grupo." />
              </div>
            </div>

            <button onClick={submit} disabled={!canSubmit}
              className="w-full h-12 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: "#5B3FCF" }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Rede
            </button>
            <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
              As restantes definições (descrição, regras, permissões…) ficam disponíveis depois, nas configurações da Rede.
            </p>
          </div>
        </div>
      </PageWrapper>
    </div>
  );
}
