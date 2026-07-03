import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/definicoes")({
  head: () => ({ meta: [{ title: "Configurações — Hooda Studio" }] }),
  component: SettingsPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

const CATEGORIES = ["Educação", "Entretenimento", "Música", "Notícias", "Desporto", "Tecnologia", "Estilo de vida", "Comédia", "Gaming", "Outro"];

function SettingsPage() {
  const navigate = useNavigate();
  const { data: channel, refetch } = useQuery(myChannelQuery());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [avatar, setAvatar] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const avRef = useRef<HTMLInputElement>(null);
  const bnRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name ?? "");
    setDescription((channel as any).description ?? "");
    setCategory((channel as any).category ?? "");
    setAvatar(channel.avatar_url ?? "");
    setBanner((channel as any).banner_url ?? "");
  }, [channel]);

  async function uploadFile(f: File, kind: "avatar" | "banner") {
    if (!channel) return;
    try {
      const { url } = await uploadImageToCloudinary(f, `hooda/channel/${channel.id}/${kind}`);
      if (kind === "avatar") setAvatar(url); else setBanner(url);
    } catch (e: any) { toast.error(e?.message ?? "Erro no upload."); }
  }

  async function save() {
    if (!channel) return;
    setSaving(true);
    const { error } = await (supabase as any).from("channels").update({
      name: name.trim(),
      description,
      category,
      avatar_url: avatar,
      banner_url: banner,
    }).eq("id", channel.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado!");
    refetch();
  }

  if (!channel) return (
    <div className="p-6 text-center">
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Ainda não tens um canal.</p>
      <button onClick={() => navigate({ to: "/studio" as any })}
        className="px-4 py-2 rounded-2xl text-sm font-bold text-white" style={{ background: GRAD }}>
        Criar canal
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Personaliza o teu canal.</p>
      </div>

      {/* Banner */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: "var(--s2)", aspectRatio: "3 / 1" }}>
        {banner && <img src={banner} className="w-full h-full object-cover" alt="" />}
        <button onClick={() => bnRef.current?.click()}
          className="absolute bottom-3 right-3 h-10 w-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>
          <Camera className="h-4 w-4" />
        </button>
        <input ref={bnRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "banner"); e.currentTarget.value = ""; }} />
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="h-20 w-20 rounded-full overflow-hidden" style={{ background: "var(--s2)" }}>
            {avatar && <img src={avatar} className="w-full h-full object-cover" alt="" />}
          </div>
          <button onClick={() => avRef.current?.click()}
            className="absolute bottom-0 right-0 h-8 w-8 rounded-full flex items-center justify-center border-2"
            style={{ background: P, color: "#fff", borderColor: "var(--s0)" }}>
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input ref={avRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "avatar"); e.currentTarget.value = ""; }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>@{channel.handle}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Canal Hooda</p>
        </div>
      </div>

      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>NOME</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>DESCRIÇÃO</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={500}
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border resize-none"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>CATEGORIA</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="mt-1 w-full px-4 py-2.5 rounded-xl text-sm outline-none border"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
            <option value="">Selecionar…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 disabled:opacity-50"
        style={{ background: GRAD }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar alterações
      </button>
    </div>
  );
}
