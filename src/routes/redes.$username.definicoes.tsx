import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SideNav, PageWrapper, PageHeader } from "@/components/AppShell";
import { fetchRedeByUsername, fetchMinhaAdesao, atualizarConfigRede } from "@/lib/redes";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/redes/$username/definicoes")({
  head: () => ({ meta: [{ title: "Configurações da Rede · Baya" }] }),
  component: DefinicoesRedePage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DefinicoesRedePage() {
  const { username } = useParams({ from: "/redes/$username/definicoes" });
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: rede, isLoading } = useQuery({ queryKey: ["rede", username], queryFn: () => fetchRedeByUsername(username) });
  const { data: adesao } = useQuery({
    queryKey: ["rede-adesao", rede?.id, user?.id],
    queryFn: () => fetchMinhaAdesao(rede!.id, user!.id),
    enabled: !!rede?.id && !!user?.id,
  });

  const [descricao, setDescricao] = useState("");
  const [regras, setRegras] = useState("");
  const [quemPublica, setQuemPublica] = useState<"todos" | "admins">("todos");
  const [quemComenta, setQuemComenta] = useState<"todos" | "membros" | "admins">("todos");
  const [temChat, setTemChat] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!rede) return;
    setDescricao(rede.descricao ?? "");
    setRegras(rede.regras ?? "");
    setQuemPublica(rede.quem_publica);
    setQuemComenta(rede.quem_comenta);
    setTemChat(rede.tem_chat);
  }, [rede]);

  if (isLoading || !rede) {
    return (
      <div className="flex"><SideNav /><PageWrapper className="flex-1 min-w-0"><div className="py-20 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div></PageWrapper></div>
    );
  }

  if (adesao && adesao.papel !== "admin") {
    return (
      <div className="flex"><SideNav /><PageWrapper className="flex-1 min-w-0">
        <PageHeader title="Configurações" onBack={() => navigate({ to: "/redes/$username", params: { username } })} />
        <p className="text-center text-sm py-16" style={{ color: "var(--text-muted)" }}>Só administradores podem configurar esta Rede.</p>
      </PageWrapper></div>
    );
  }

  async function salvar() {
    setSaving(true);
    try {
      await atualizarConfigRede(rede.id, { descricao, regras, quem_publica: quemPublica, quem_comenta: quemComenta, tem_chat: temChat });
      toast.success("Configurações guardadas.");
      navigate({ to: "/redes/$username", params: { username } });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="flex-1 min-w-0">
        <div className="max-w-[600px] mx-auto lg:border-x min-h-screen" style={{ borderColor: "var(--border-subtle)" }}>
          <PageHeader title={`Configurações · ${rede.nome}`} onBack={() => navigate({ to: "/redes/$username", params: { username } })} />
          <div className="px-4 py-5 space-y-5">
            <Field label="Descrição">
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
            </Field>
            <Field label="Regras">
              <textarea value={regras} onChange={(e) => setRegras(e.target.value)} rows={4}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{ background: "var(--s2)", color: "var(--text-primary)" }} />
            </Field>
            <Field label="Quem pode publicar">
              <div className="flex gap-2">
                {(["todos", "admins"] as const).map((v) => (
                  <button key={v} onClick={() => setQuemPublica(v)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: quemPublica === v ? "#5B3FCF" : "var(--s2)", color: quemPublica === v ? "#fff" : "var(--text-secondary)" }}>
                    {v === "todos" ? "Todos os membros" : "Só administradores"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Quem pode comentar">
              <div className="flex gap-2 flex-wrap">
                {(["todos", "membros", "admins"] as const).map((v) => (
                  <button key={v} onClick={() => setQuemComenta(v)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: quemComenta === v ? "#5B3FCF" : "var(--s2)", color: quemComenta === v ? "#fff" : "var(--text-secondary)" }}>
                    {v === "todos" ? "Todos" : v === "membros" ? "Só membros" : "Só administradores"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Conversa">
              <div className="flex gap-2">
                <button onClick={() => setTemChat(true)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: temChat ? "#5B3FCF" : "var(--s2)", color: temChat ? "#fff" : "var(--text-secondary)" }}>Ativada</button>
                <button onClick={() => setTemChat(false)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: !temChat ? "#5B3FCF" : "var(--s2)", color: !temChat ? "#fff" : "var(--text-secondary)" }}>Desativada</button>
              </div>
              {rede.tem_chat && !temChat && (
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Desativar não apaga a conversa existente, só a esconde da página da Rede.</p>
              )}
            </Field>

            <button onClick={salvar} disabled={saving}
              className="w-full h-12 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "#5B3FCF" }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      </PageWrapper>
    </div>
  );
}
