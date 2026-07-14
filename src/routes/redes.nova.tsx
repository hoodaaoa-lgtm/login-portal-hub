import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PageWrapper, PageHeader, SideNav } from "@/components/AppShell";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { criarRede } from "@/lib/redes";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redes/nova")({
  head: () => ({ meta: [{ title: "Criar Rede · Baya" }] }),
  component: NovaRedePage,
});

const CATEGORIAS = [
  "Música", "Tecnologia", "Futebol", "Notícias", "Educação", "Negócios",
  "Entretenimento", "Animes", "Doramas", "Novelas", "Filmes e Séries",
  "Games", "Moda e Beleza", "Humor", "Religião", "Saúde", "Culinária",
  "Viagens", "+18", "Outra",
];

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
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [capaFile, setCapaFile] = useState<File | null>(null);
  const [capaPreview, setCapaPreview] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0]);
  const [tipo, setTipo] = useState<"publica" | "privada" | "canal">("publica");
  const [temChat, setTemChat] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const usernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verificar disponibilidade do @username da Rede em tempo real
  useEffect(() => {
    if (!username) { setUsernameStatus("idle"); return; }

    if (!/^[a-z0-9_.]{3,20}$/i.test(username)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
    usernameTimeout.current = setTimeout(async () => {
      const lower = username.toLowerCase();
      const { data } = await (supabase as any)
        .from("redes")
        .select("id")
        .eq("username", lower)
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "ok");
    }, 500);

    return () => { if (usernameTimeout.current) clearTimeout(usernameTimeout.current); };
  }, [username]);

  const usernameRightIcon = () => {
    if (usernameStatus === "checking") return <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />;
    if (usernameStatus === "ok") return <Check className="h-4 w-4" style={{ color: "#16a34a" }} />;
    if (usernameStatus === "taken" || usernameStatus === "invalid") return <X className="h-4 w-4" style={{ color: "#dc2626" }} />;
    return null;
  };

  const usernameHint = usernameStatus === "ok"
    ? <span style={{ color: "#16a34a" }}>@{username.toLowerCase()} está disponível ✓</span>
    : usernameStatus === "taken"
    ? <span style={{ color: "#dc2626" }}>Esse @username já está em uso.</span>
    : usernameStatus === "invalid"
    ? <span style={{ color: "#dc2626" }}>Só letras, números, "_" e "." (mín. 3 caracteres).</span>
    : null;

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  }

  function pickCapa(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCapaFile(f);
    setCapaPreview(URL.createObjectURL(f));
  }

  const canSubmit = nome.trim().length >= 2 && usernameStatus === "ok" && !saving;

  async function submit() {
    if (!canSubmit || !user) return;
    setSaving(true);
    try {
      // Checagem final para evitar corrida (outra pessoa pode ter registado
      // o mesmo @username entre a última verificação e o clique em "Criar").
      const lower = username.toLowerCase();
      const { data: finalCheck } = await (supabase as any).from("redes").select("id").eq("username", lower).maybeSingle();
      if (finalCheck) {
        setUsernameStatus("taken");
        setSaving(false);
        return;
      }

      let avatarUrl: string | null = null;
      if (avatarFile) {
        const up = await uploadImageToCloudinary(avatarFile, "redes");
        avatarUrl = up.url;
      }
      let capaUrl: string | null = null;
      if (capaFile) {
        const up = await uploadImageToCloudinary(capaFile, "redes");
        capaUrl = up.url;
      }
      const rede = await criarRede({
        nome: nome.trim(), username, avatarUrl, capaUrl, categoria, tipo, temChat,
      });
      // Garante que a página da Rede não mostra um "não existe" em cache
      // de uma tentativa anterior com o mesmo @username (ex: se o RPC
      // tinha falhado antes por outro motivo e ficou null em cache).
      qc.setQueryData(["rede", rede.username], rede);
      qc.invalidateQueries({ queryKey: ["rede", rede.username] });
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
          <PageHeader title="Criar Rede" onBack={() => navigate({ to: "/explorar", search: { tab: "redes" } })} />

          <div className="px-4 py-5 space-y-6">
            {/* Capa + Foto */}
            <div className="relative">
              <div className="h-32 rounded-xl overflow-hidden relative"
                style={capaPreview ? undefined : { background: "linear-gradient(135deg,#5B3FCF 0%,#8B5CF6 55%,#E94B8A 100%)" }}>
                {capaPreview && <img src={capaPreview} alt="" className="w-full h-full object-cover" />}
                <button onClick={() => coverRef.current?.click()}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow"
                  style={{ background: "rgba(0,0,0,0.45)" }}>
                  <Camera className="h-4 w-4 text-white" />
                </button>
                <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCapa} />
              </div>

              <div className="absolute left-4" style={{ bottom: -32 }}>
                <button onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center relative border-4"
                  style={{ background: "var(--s2)", borderColor: "var(--surface-0, #fff)" }}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                    : <Camera className="h-5 w-5" style={{ color: "var(--text-muted)" }} />}
                  <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white"
                    style={{ background: "#5B3FCF" }}>
                    <Camera className="h-3 w-3 text-white" />
                  </span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
              </div>
            </div>
            <div className="h-8" />


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
                {usernameRightIcon()}
              </div>
              {usernameHint && <p className="text-[11px] mt-1">{usernameHint}</p>}
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
