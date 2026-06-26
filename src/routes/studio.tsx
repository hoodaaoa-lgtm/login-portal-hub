import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { t } from "@/lib/useT";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Video, Upload, Settings,
  HelpCircle, LogOut, ArrowLeft, Menu, X, BarChart2, Tv2,
  Camera, Save, Trash2, Globe, Lock, Users, AlertTriangle,
  Loader2, Check, ChevronDown, ListVideo,
} from "lucide-react";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export const Route = createFileRoute("/studio")({
  component: StudioLayout,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

const NAV = [
  { to: "/studio",             label: "Painel",        icon: LayoutDashboard, exact: true },
  { to: "/studio/content",     label: t("studio.content"),      icon: Video },
  { to: "/studio/upload",      label: "Enviar vídeo",  icon: Upload },
  { to: "/studio/playlists",   label: "Playlists",     icon: ListVideo },
  { to: "/studio/analytics",   label: t("studio.analytics"),      icon: BarChart2 },
];

const CATEGORIES = [
  "Música","Jogos","Educação","Notícias","Desporto",
  "Tecnologia","Estilo de vida","Entretenimento","Outro",
];

const COUNTRIES = [
  { code: "AO", name: "Angola" },
  { code: "PT", name: "Portugal" },
  { code: "BR", name: "Brasil" },
  { code: "MZ", name: "Moçambique" },
  { code: "CV", name: "Cabo Verde" },
  { code: "ST", name: "São Tomé e Príncipe" },
  { code: "GW", name: "Guiné-Bissau" },
  { code: "GQ", name: "Guiné Equatorial" },
  { code: "US", name: "Estados Unidos" },
  { code: "GB", name: "Reino Unido" },
  { code: "FR", name: "França" },
  { code: "DE", name: "Alemanha" },
  { code: "ZA", name: "África do Sul" },
  { code: "NG", name: "Nigéria" },
  { code: "KE", name: "Quénia" },
  { code: "CD", name: "Congo (RDC)" },
  { code: "OTHER", name: "Outro" },
];

const AUDIENCE_OPTIONS = [
  { value: "all",     label: "Todos",           icon: Globe,  desc: "Qualquer pessoa pode ver o teu canal" },
  { value: "18+",     label: "Maiores de 18",   icon: Users,  desc: "Conteúdo restrito a adultos" },
  { value: "private", label: t("studio.private"),         icon: Lock,   desc: "Só tu podes ver o teu canal" },
];

const COMMENT_OPTIONS = [
  { value: "all",       label: "Todos" },
  { value: "followers", label: t("profile.followers") },
  { value: "none",      label: "Ninguém" },
];

/* ── Image picker ── */
function ImagePicker({ value, onChange, aspect, label, icon }: {
  value: string | null; onChange: (file: File, preview: string) => void;
  aspect: string; label: string; icon: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button type="button" onClick={() => ref.current?.click()}
      className="relative overflow-hidden flex items-center justify-center border-2 border-dashed transition-all hover:opacity-80 active:scale-95 group"
      style={{
        aspectRatio: aspect, width: "100%",
        borderColor: value ? "transparent" : "var(--border-default)",
        borderRadius: aspect === "1/1" ? "50%" : 12,
        background: value ? "transparent" : "var(--s2)",
      }}>
      {value
        ? <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover"
            style={{ borderRadius: aspect === "1/1" ? "50%" : 12 }} />
        : <div className="flex flex-col items-center gap-1 pointer-events-none"
            style={{ color: "var(--text-muted)" }}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
          </div>}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        style={{ background: "rgba(0,0,0,0.35)", borderRadius: aspect === "1/1" ? "50%" : 12 }}>
        <Camera className="h-5 w-5 text-white" />
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          onChange(f, URL.createObjectURL(f));
        }} />
    </button>
  );
}

/* ── Settings Modal ── */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: channel } = useQuery(myChannelQuery());
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name,        setName]        = useState(channel?.name ?? "");
  const [description, setDescription] = useState(channel?.description ?? "");
  const [category,    setCategory]    = useState(channel?.category ?? "");
  const [country,     setCountry]     = useState(channel?.country ?? "");
  const [audience,    setAudience]    = useState("all");
  const [comments,    setComments]    = useState("all");
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [avatarPrev,  setAvatarPrev]  = useState<string | null>(channel?.avatar_url ?? null);
  const [bannerFile,  setBannerFile]  = useState<File | null>(null);
  const [bannerPrev,  setBannerPrev]  = useState<string | null>(channel?.banner_url ?? null);
  const [saving,      setSaving]      = useState(false);

  const [showDelete,   setShowDelete]   = useState(false);
  const [deleteHandle, setDeleteHandle] = useState("");
  const [deleting,     setDeleting]     = useState(false);

  const [tab, setTab] = useState<"info" | "privacy" | "danger">("info");

  async function uploadImg(file: File, path: string) {
    const ext  = file.name.split(".").pop() ?? "jpg";
    const full = `${path}.${ext}`;
    const { error } = await supabase.storage.from("channel-assets").upload(full, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("channel-assets").getPublicUrl(full);
    return data.publicUrl;
  }

  async function save() {
    if (!channel || saving) return;
    if (!name.trim()) { toast.error("O nome não pode estar vazio."); return; }
    setSaving(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      const uid = ud.user!.id;
      let avatar_url = channel.avatar_url;
      let banner_url = channel.banner_url;
      if (avatarFile) avatar_url = await uploadImg(avatarFile, `${uid}/avatar`) ?? avatar_url;
      if (bannerFile) banner_url = await uploadImg(bannerFile, `${uid}/banner`) ?? banner_url;

      const { error } = await (supabase as any).from("channels").update({
        name: name.trim(), description: description.trim() || null,
        category: category || null, country: country || null,
        avatar_url, banner_url,
      }).eq("id", channel.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["my-channel"] });
      toast.success("Definições guardadas!");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteChannel() {
    if (!channel || deleting) return;
    if (deleteHandle !== channel.handle) { toast.error("Handle incorreto."); return; }
    setDeleting(true);
    try {
      const { error } = await (supabase as any).from("channels").delete().eq("id", channel.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["my-channel"] });
      toast.success("Canal eliminado.");
      onClose();
      navigate({ to: "/studio" as any });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao eliminar");
      setDeleting(false);
    }
  }

  const inputStyle = {
    background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)",
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-lg rounded-3xl flex flex-col overflow-hidden"
        style={{ background: "var(--s0)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}>
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: GRAD }}>
            <Settings className="h-4 w-4 text-white" />
          </div>
          <p className="font-bold text-base flex-1" style={{ color: "var(--text-primary)" }}>
            Definições do canal
          </p>
          <button onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center transition hover:bg-[var(--s2)]"
            style={{ color: "var(--text-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {([ ["info","Informações"], ["privacy",t("settings.privacy")], ["danger","Perigo"] ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-3 text-xs font-semibold transition"
              style={{
                color: tab === key ? P : "var(--text-muted)",
                borderBottom: tab === key ? `2px solid ${P}` : "2px solid transparent",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── TAB: Informações ── */}
          {tab === "info" && (
            <>
              {/* Banner */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>IMAGEM DE CAPA</p>
                <div style={{ aspectRatio: "16/5" }}>
                  <ImagePicker value={bannerPrev} aspect="16/5" label="Adicionar capa"
                    icon={<Upload className="h-4 w-4" />}
                    onChange={(f, p) => { setBannerFile(f); setBannerPrev(p); }} />
                </div>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div style={{ width: 64, height: 64, flexShrink: 0 }}>
                  <ImagePicker value={avatarPrev} aspect="1/1" label="Foto"
                    icon={<Camera className="h-4 w-4" />}
                    onChange={(f, p) => { setAvatarFile(f); setAvatarPrev(p); }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{name || channel?.name}</p>
                  <p className="text-xs" style={{ color: P }}>@{channel?.handle}</p>
                </div>
              </div>

              {/* Nome */}
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>NOME DO CANAL</p>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition"
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = P}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--border-default)"} />
              </div>

              {/* Descrição */}
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>DESCRIÇÃO</p>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={3} maxLength={500} placeholder="Sobre o que é o teu canal?"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition resize-none"
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = P}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--border-default)"} />
                <p className="text-xs text-right mt-0.5" style={{ color: "var(--text-muted)" }}>{description.length}/500</p>
              </div>

              {/* Categoria */}
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>CATEGORIA</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(x => x === c ? "" : c)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                      style={{
                        background:  category === c ? P : "var(--s2)",
                        color:       category === c ? "#fff" : "var(--text-secondary)",
                        borderColor: category === c ? P : "var(--border-default)",
                      }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* País */}
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>PAÍS DO CANAL</p>
                <div className="relative">
                  <select value={country} onChange={e => setCountry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border appearance-none pr-10 cursor-pointer"
                    style={inputStyle}>
                    <option value="">Seleciona o país</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            </>
          )}

          {/* ── TAB: Privacidade ── */}
          {tab === "privacy" && (
            <>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>QUEM PODE VER O TEU CANAL</p>
                <div className="space-y-2">
                  {AUDIENCE_OPTIONS.map(o => {
                    const Icon = o.icon;
                    return (
                      <button key={o.value} onClick={() => setAudience(o.value)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left"
                        style={{
                          background:  audience === o.value ? P + "12" : "var(--s2)",
                          borderColor: audience === o.value ? P : "var(--border-default)",
                        }}>
                        <Icon className="h-4 w-4 shrink-0" style={{ color: audience === o.value ? P : "var(--text-muted)" }} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{o.label}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{o.desc}</p>
                        </div>
                        {audience === o.value && (
                          <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ background: P }}>
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>QUEM PODE COMENTAR</p>
                <div className="flex gap-2">
                  {COMMENT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setComments(o.value)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition"
                      style={{
                        background:  comments === o.value ? P : "var(--s2)",
                        color:       comments === o.value ? "#fff" : "var(--text-secondary)",
                        borderColor: comments === o.value ? P : "var(--border-default)",
                      }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── TAB: Perigo ── */}
          {tab === "danger" && (
            <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "#DC262630", background: "#DC262608" }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
                <div>
                  <p className="font-bold text-sm" style={{ color: "#DC2626" }}>Eliminar canal</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Ação permanente. Todos os vídeos, seguidores e dados do canal serão apagados.
                  </p>
                </div>
              </div>

              {!showDelete
                ? (
                  <button onClick={() => setShowDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition"
                    style={{ color: "#DC2626", borderColor: "#DC262640", background: "#DC262615" }}>
                    <Trash2 className="h-4 w-4" /> Eliminar canal
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Escreve <span className="font-bold" style={{ color: P }}>@{channel?.handle}</span> para confirmar:
                    </p>
                    <input value={deleteHandle} onChange={e => setDeleteHandle(e.target.value)}
                      placeholder={`@${channel?.handle}`}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border"
                      style={{ background: "var(--s2)", borderColor: "#DC262660", color: "var(--text-primary)" }} />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowDelete(false); setDeleteHandle(""); }}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
                        style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
                        Cancelar
                      </button>
                      <button onClick={deleteChannel}
                        disabled={deleting || deleteHandle !== channel?.handle}
                        className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                        style={{ background: "#DC2626" }}>
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirmar eliminação"}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer — só nas tabs que guardam */}
        {tab !== "danger" && (
          <div className="px-6 py-4 border-t shrink-0 flex gap-3" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: GRAD }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> A guardar…</> : <><Save className="h-4 w-4" /> Guardar</>}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Layout principal ── */
function StudioLayout() {
  const { data: channel } = useQuery(myChannelQuery());
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open,        setOpen]        = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const avatar = channel?.avatar_url
    ? <img src={channel.avatar_url} className="h-full w-full object-cover rounded-full" alt="" />
    : <span className="text-sm font-bold text-white">{(channel?.name?.[0] ?? "?").toUpperCase()}</span>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--s1)" }}>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Top header */}
      <header className="h-14 sticky top-0 z-40 flex items-center px-4 gap-3 border-b"
        style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

        <button className="md:hidden p-2 -ml-1 rounded-xl hover:bg-[var(--s2)] transition"
          onClick={() => setOpen(v => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to="/studio" className="flex items-center gap-2 shrink-0 select-none">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: GRAD }}>
            <Tv2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
            Hooda <span style={{ color: P }}>Studio</span>
          </span>
        </Link>

        <div className="flex-1" />

        <Link to="/home"
          className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition"
          style={{ color: "var(--text-secondary)" }}
          onMouseOver={e => (e.currentTarget.style.background = "var(--s2)")}
          onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Hooda
        </Link>

        <button onClick={signOut}
          className="p-2 rounded-full transition"
          style={{ color: "var(--text-muted)" }}
          onMouseOver={e => (e.currentTarget.style.color = "#E94B8A")}
          onMouseOut={e => (e.currentTarget.style.color = "var(--text-muted)")}>
          <LogOut className="h-4 w-4" />
        </button>

        {channel && (
          <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ background: GRAD }}>
            {avatar}
          </div>
        )}
      </header>

      <div className="flex flex-1">

        {/* Sidebar */}
        <aside className={`${open ? "flex" : "hidden"} md:flex w-56 shrink-0 flex-col border-r sticky top-14 h-[calc(100vh-56px)]`}
          style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

          {/* Canal card */}
          <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                style={{ background: GRAD }}>
                {avatar}
              </div>
              <div className="min-w-0">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>O teu canal</p>
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {channel?.name ?? "—"}
                </p>
                {channel?.handle && (
                  <p className="text-xs truncate" style={{ color: P }}>@{channel.handle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV.map(({ to, label, icon: Icon, exact }) => {
              const active = isActive(to, exact);
              return (
                <Link key={to} to={to as any} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all mb-0.5"
                  style={{
                    background: active ? "#5B3FCF18" : "transparent",
                    color: active ? P : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: P }} />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="border-t py-2" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={() => { setShowSettings(true); setOpen(false); }}
              className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm w-full text-left transition hover:bg-[var(--s2)]"
              style={{ color: "var(--text-muted)" }}>
              <Settings className="h-4 w-4 shrink-0" />
              Definições do canal
            </button>
            <a href="mailto:suporte@hooda.app"
              className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm w-full text-left transition hover:bg-[var(--s2)]"
              style={{ color: "var(--text-muted)" }}>
              <HelpCircle className="h-4 w-4 shrink-0" />
              Ajuda / Suporte
            </a>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
