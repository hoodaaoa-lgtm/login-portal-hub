import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SideNav, BottomNav, PageWrapper } from "@/components/AppShell";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { optimizeAvatar } from "@/lib/imageOptimize";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, Plus, X, Camera, Loader2, Lock, Globe, Megaphone, DoorOpen, Check,
} from "lucide-react";

export const Route = createFileRoute("/salas")({
  head: () => ({ meta: [{ title: "Salas · Snapper" }] }),
  component: SalasPage,
});

const P = "#2F6FED";

type Sala = {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  tipo: "publica" | "privada" | "anuncios";
  slug: string;
  criador_id: string;
  membros_count: number;
  created_at: string;
};

const TIPO_INFO: Record<Sala["tipo"], { label: string; Icon: typeof Globe; color: string }> = {
  publica:  { label: "Pública",  Icon: Globe,     color: "#2F6FED" },
  privada:  { label: "Privada",  Icon: Lock,      color: "#6BA547" },
  anuncios: { label: "Anúncios", Icon: Megaphone, color: "#FFC93C" },
};

function fmtN(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n ?? 0);
}

function slugify(nome: string): string {
  const base = nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "sala";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

/* ── Ícone/foto da sala ── */
function SalaIcon({ src, nome, size = 56 }: { src?: string | null; nome: string; size?: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex items-center justify-center shrink-0 font-extrabold text-white"
      style={{ width: size, height: size, background: src ? "transparent" : P, fontSize: size / 2.6 }}
    >
      {src
        ? <img src={optimizeAvatar(src, size * 2)} alt={nome} className="w-full h-full object-cover" />
        : (nome[0] ?? "S").toUpperCase()}
    </div>
  );
}

/* ── Modal: Criar Sala ── */
function CreateSalaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Sala) => void }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<Sala["tipo"]>("publica");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePickFoto = (f: File | null) => {
    setFotoFile(f);
    if (f) setFotoPreview(URL.createObjectURL(f));
  };

  const handleCreate = async () => {
    if (!nome.trim()) { toast.error("Dá um nome à sala."); return; }
    setSaving(true);
    try {
      let foto_url: string | null = null;
      if (fotoFile) {
        const up = await uploadImageToCloudinary(fotoFile, "hooda/salas");
        foto_url = up.url;
      }
      const slug = slugify(nome);
      const { data, error } = await (supabase.rpc as any)("sala_criar", {
        p_nome: nome.trim(),
        p_descricao: descricao.trim() || null,
        p_foto_url: foto_url,
        p_tipo: tipo,
        p_slug: slug,
      });
      if (error) throw error;
      toast.success("Sala criada!");
      onCreated(data as unknown as Sala);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar a sala.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Criar Sala</h2>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Foto/ícone */}
        <div className="flex justify-center mb-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ width: 84, height: 84, background: "var(--s2)", border: "1px dashed var(--border-default)" }}
          >
            {fotoPreview
              ? <img src={fotoPreview} alt="" className="w-full h-full object-cover" />
              : <Camera className="w-6 h-6" style={{ color: "var(--text-muted)" }} />}
            <div className="absolute bottom-0 inset-x-0 py-1 text-center text-[10px] font-bold text-white" style={{ background: "rgba(0,0,0,0.5)" }}>
              {fotoPreview ? "Trocar" : "Adicionar"}
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handlePickFoto(e.target.files?.[0] ?? null)} />
        </div>

        <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Nome da sala</label>
        <input
          value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60}
          placeholder="Ex: Amantes de Futebol"
          className="w-full px-3.5 h-11 rounded-xl text-sm border outline-none mb-3"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
        />

        <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Descrição</label>
        <textarea
          value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} rows={3}
          placeholder="Sobre o que é esta sala?"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none mb-3 resize-none"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
        />

        <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Tipo de sala</label>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {(Object.keys(TIPO_INFO) as Sala["tipo"][]).map((k) => {
            const info = TIPO_INFO[k];
            const active = tipo === k;
            return (
              <button key={k} onClick={() => setTipo(k)}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: active ? `${info.color}18` : "var(--s2)", color: active ? info.color : "var(--text-muted)", border: active ? `1.5px solid ${info.color}` : "1.5px solid transparent" }}>
                <info.Icon className="w-4 h-4" />
                {info.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCreate} disabled={saving}
          className="w-full h-11 rounded-full font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: P }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "A criar..." : "Criar Sala"}
        </button>
      </div>
    </div>
  );
}

function SalaCard({ sala, isMember, onJoin, onOpen, joining }: {
  sala: Sala; isMember: boolean; joining: boolean;
  onJoin: () => void; onOpen: () => void;
}) {
  const info = TIPO_INFO[sala.tipo];
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all hover:-translate-y-0.5"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}
      onClick={onOpen}>
      <SalaIcon src={sala.foto_url} nome={sala.nome} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-extrabold text-sm truncate" style={{ color: "var(--text-primary)" }}>{sala.nome}</p>
          <info.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: info.color }} />
        </div>
        {sala.descricao && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{sala.descricao}</p>
        )}
        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Users className="w-3 h-3" /> {fmtN(sala.membros_count)} membro{sala.membros_count === 1 ? "" : "s"}
        </p>
      </div>
      {!isMember && (
        <button
          onClick={(e) => { e.stopPropagation(); onJoin(); }}
          disabled={joining}
          className="shrink-0 px-3.5 h-8 rounded-full text-xs font-bold text-white flex items-center gap-1 disabled:opacity-60"
          style={{ background: P }}>
          {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
          Entrar
        </button>
      )}
    </div>
  );
}

function SalasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [salas, setSalas] = useState<Sala[]>([]);
  const [myMembership, setMyMembership] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todas" | "minhas">("todas");
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: salasData } = await supabase.from("salas" as any).select("*").order("created_at", { ascending: false });
    setSalas((salasData as unknown as Sala[]) ?? []);
    if (uid) {
      const { data: memb } = await supabase.from("sala_membros" as any).select("sala_id").eq("user_id", uid);
      const map: Record<string, boolean> = {};
      (memb as any[] ?? []).forEach((m) => { map[m.sala_id] = true; });
      setMyMembership(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  const handleJoin = async (sala: Sala) => {
    if (!uid) { toast.error("Inicia sessão para entrar numa sala."); return; }
    setJoiningId(sala.id);
    try {
      const { error } = await supabase.rpc("sala_entrar" as any, { p_sala_id: sala.id });
      if (error) throw error;
      setMyMembership((m) => ({ ...m, [sala.id]: true }));
      setSalas((prev) => prev.map((s) => s.id === sala.id ? { ...s, membros_count: s.membros_count + 1 } : s));
      navigate({ to: "/salas/$slug", params: { slug: sala.slug } });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível entrar na sala.");
    } finally {
      setJoiningId(null);
    }
  };

  const visible = tab === "minhas" ? salas.filter((s) => myMembership[s.id]) : salas;

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="sticky top-0 z-30 px-4 pt-4 pb-3"
          style={{ background: "var(--s1)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6" style={{ color: P }} />
              <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Salas</h1>
            </div>
            {uid && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 h-9 rounded-full text-white text-sm font-bold transition-all active:scale-95"
                style={{ background: P }}>
                <Plus className="w-4 h-4" /> Criar Sala
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {([["todas", "Todas"], ["minhas", "Minhas salas"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className="px-4 h-8 rounded-full text-sm font-bold transition-all"
                style={tab === key ? { background: P, color: "#fff" } : { background: "var(--s2)", color: "var(--text-muted)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-4 flex items-center gap-3 animate-pulse" style={{ background: "var(--s2)" }}>
                  <div className="rounded-2xl" style={{ width: 56, height: 56, background: "var(--s3)" }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "50%" }} />
                    <div className="h-2.5 rounded-full" style={{ background: "var(--s3)", width: "70%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="w-12 h-12 opacity-20" style={{ color: P }} />
              <p className="font-bold text-center" style={{ color: "var(--text-primary)" }}>
                {tab === "minhas" ? "Ainda não entraste em nenhuma sala" : "Ainda não há salas"}
              </p>
              {uid && (
                <button onClick={() => setShowCreate(true)}
                  className="mt-2 px-5 h-10 rounded-full text-white font-bold text-sm" style={{ background: P }}>
                  Criar a primeira Sala
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((s) => (
                <SalaCard
                  key={s.id}
                  sala={s}
                  isMember={!!myMembership[s.id]}
                  joining={joiningId === s.id}
                  onJoin={() => handleJoin(s)}
                  onOpen={() => {
                    if (myMembership[s.id]) navigate({ to: "/salas/$slug", params: { slug: s.slug } });
                    else handleJoin(s);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <BottomNav />
      </PageWrapper>

      {showCreate && (
        <CreateSalaModal
          onClose={() => setShowCreate(false)}
          onCreated={(s) => {
            setSalas((prev) => [s, ...prev]);
            setMyMembership((m) => ({ ...m, [s.id]: true }));
            setShowCreate(false);
            navigate({ to: "/salas/$slug", params: { slug: s.slug } });
          }}
        />
      )}
    </>
  );
}
