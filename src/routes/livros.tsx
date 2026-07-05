import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SideNav, BottomNav, PageWrapper } from "@/components/AppShell";
import {
  BookOpen, Plus, X, Upload, Download, Bookmark, BookmarkCheck,
  Search, Loader2, FileText, Image as ImageIcon,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

export const Route = createFileRoute("/livros")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: LivrosPage,
});

const P = "#5B3FCF";
const CLOUD_NAME = "dy7o7tgmk";
const UPLOAD_PRESET = "hooda_videos";
const CATS = ["Romance","Ficção","Negócios","Autoajuda","História","Tecnologia","Religião","Educação","Outro"];

/* Upload de ficheiro raw (PDF/EPUB/DOCX) para Cloudinary */
function uploadRawToCloudinary(
  file: File,
  userId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", `hooda/books/${userId}`);
    fd.append("resource_type", "raw");
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error("Resposta inválida do Cloudinary.")); }
      } else {
        let msg = `Erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Falha de rede.")));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`);
    xhr.send(fd);
  });
}

/* ── Formatar números ── */
const fmtN = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n ?? 0);

/* ── Capa placeholder ── */
function CoverPlaceholder({ title, color }: { title: string; color: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 gap-2"
      style={{ background: `linear-gradient(135deg,${color}22,${color}44)` }}>
      <BookOpen className="w-8 h-8 opacity-60" style={{ color }} />
      <p className="text-[10px] font-bold text-center line-clamp-3 leading-tight" style={{ color }}>{title}</p>
    </div>
  );
}

const COLORS = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547","#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

/* ── Book Card ── */
function BookCard({ book, onSave, onOpen }: { book: any; onSave: () => void; onOpen: () => void }) {
  const color = colorFor(book.title);
  return (
    <div className="rounded-2xl overflow-hidden cursor-pointer group transition-all hover:-translate-y-1 hover:shadow-xl"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}
      onClick={onOpen}>
      {/* Capa */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "2/3", background: "var(--s2)" }}>
        {book.cover_url
          ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <CoverPlaceholder title={book.title} color={color} />}
        {/* Save button */}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
          {book.saved_by_me
            ? <BookmarkCheck className="w-4 h-4 text-white" />
            : <Bookmark className="w-4 h-4 text-white" />}
        </button>
        {/* Category badge */}
        {book.category && (
          <span className="absolute bottom-2 left-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
            style={{ background: `${color}cc` }}>
            {book.category}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-2.5">
        <p className="text-[12px] font-bold leading-tight line-clamp-2 mb-0.5" style={{ color: "var(--text-primary)" }}>{book.title}</p>
        <p className="text-[11px] line-clamp-1" style={{ color: "var(--text-muted)" }}>{book.author_name || "Autor desconhecido"}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <Download className="w-3 h-3" />{fmtN(book.downloads ?? 0)}
          </span>
          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <Bookmark className="w-3 h-3" />{fmtN(book.saves ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Modal Criar Livro ── */
function CreateBookModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle]       = useState("");
  const [author, setAuthor]     = useState("");
  const [desc, setDesc]         = useState("");
  const [category, setCategory] = useState("Outro");
  const [coverFile, setCoverFile]   = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [bookFile, setBookFile]     = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const [progress, setProgress] = useState(0);
  const coverRef = useRef<HTMLInputElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Seleciona uma imagem para a capa."); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Capa demasiado grande (máx 5MB)."); return; }
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  }

  function onBookFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["application/pdf","application/epub+zip","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|epub|docx)$/i)) {
      toast.error("Formato inválido. Aceite: PDF, EPUB, DOCX"); return;
    }
    if (f.size > 100 * 1024 * 1024) { toast.error("Ficheiro demasiado grande (máx 100MB)."); return; }
    setBookFile(f);
  }

  async function handleSubmit() {
    if (!title.trim()) { toast.error("Adiciona um título."); return; }
    if (!bookFile) { toast.error("Faz upload do ficheiro do livro."); return; }
    setSaving(true);
    setProgress(10);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");
      const uid = session.user.id;

      // Upload capa via Cloudinary (imagem)
      let coverUrl: string | null = null;
      if (coverFile) {
        setProgress(20);
        const res = await uploadImageToCloudinary(coverFile, `hooda/book-covers/${uid}`, p => setProgress(20 + p * 0.3));
        coverUrl = res.url;
      }

      // Upload ficheiro via Cloudinary (raw)
      setProgress(50);
      const fileUrl = await uploadRawToCloudinary(bookFile, uid, p => setProgress(50 + p * 0.4));

      setProgress(92);
      const fext = bookFile.name.split(".").pop()?.toUpperCase() ?? "PDF";
      const { error } = await (supabase as any).from("books").insert({
        uploader_id: uid,
        title: title.trim(),
        author_name: author.trim() || null,
        description: desc.trim() || null,
        category,
        cover_url: coverUrl,
        file_url: fileUrl,
        file_format: fext,
        downloads: 0,
        saves: 0,
      });
      if (error) throw error;
      setProgress(100);
      toast.success("Livro publicado!");
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao publicar o livro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full sm:max-w-lg rounded-3xl overflow-hidden"
        style={{ background: "var(--s0)", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="font-extrabold text-lg" style={{ color: "var(--text-primary)" }}>Adicionar livro</h2>
          {!saving && <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}><X className="w-4 h-4" /></button>}
        </div>

        <div className="p-5 space-y-4">
          {/* Capa + Ficheiro lado a lado */}
          <div className="flex gap-4">
            {/* Capa */}
            <div className="shrink-0">
              <p className="text-xs font-bold mb-1.5" style={{ color: "var(--text-muted)" }}>CAPA</p>
              <button onClick={() => coverRef.current?.click()}
                className="w-24 rounded-xl overflow-hidden border-2 border-dashed transition-all hover:border-[#5B3FCF] flex items-center justify-center"
                style={{ aspectRatio: "2/3", borderColor: coverPreview ? P : "var(--border-default)", background: "var(--s2)" }}>
                {coverPreview
                  ? <img src={coverPreview} className="w-full h-full object-cover" alt="capa" />
                  : <div className="flex flex-col items-center gap-1"><ImageIcon className="w-6 h-6" style={{ color: "var(--text-muted)" }} /><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Carregar</span></div>}
              </button>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={onCoverChange} />
            </div>

            {/* Campos principais */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)" }}>TÍTULO *</p>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do livro"
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:border-[#5B3FCF]"
                  style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)" }}>AUTOR</p>
                <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Nome do autor"
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:border-[#5B3FCF]"
                  style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)" }}>CATEGORIA</p>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)" }}>DESCRIÇÃO</p>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Sobre o livro..." rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm border outline-none resize-none focus:border-[#5B3FCF]"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>

          {/* Upload ficheiro */}
          <div>
            <p className="text-xs font-bold mb-1.5" style={{ color: "var(--text-muted)" }}>FICHEIRO DO LIVRO * <span className="font-normal normal-case">(PDF, EPUB, DOCX · máx 100MB)</span></p>
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all hover:border-[#5B3FCF]"
              style={{ borderColor: bookFile ? P : "var(--border-default)", background: "var(--s2)" }}>
              {bookFile
                ? <><FileText className="w-5 h-5" style={{ color: P }} /><span className="text-sm font-semibold" style={{ color: P }}>{bookFile.name}</span></>
                : <><Upload className="w-5 h-5" style={{ color: "var(--text-muted)" }} /><span className="text-sm" style={{ color: "var(--text-muted)" }}>Clica para fazer upload</span></>}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.epub,.docx" className="hidden" onChange={onBookFileChange} />
          </div>

          {/* Progress */}
          {saving && (
            <div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${P},#E94B8A)` }} />
              </div>
              <p className="text-xs mt-1 text-center" style={{ color: "var(--text-muted)" }}>A publicar... {progress}%</p>
            </div>
          )}

          {/* Botão publicar */}
          <button onClick={handleSubmit} disabled={saving}
            className="w-full h-12 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: `linear-gradient(135deg,${P},#E94B8A)` }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />A publicar...</> : <><BookOpen className="w-4 h-4" />Publicar livro</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal Detalhe do Livro ── */
function BookDetailModal({ book, onClose, onSave, onDownload }: {
  book: any; onClose: () => void; onSave: () => void; onDownload: () => void;
}) {
  const color = colorFor(book.title);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md rounded-3xl overflow-hidden"
        style={{ background: "var(--s0)", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Top bar */}
        <div className="flex justify-end p-3">
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Capa */}
        <div className="flex justify-center px-6 pb-4">
          <div className="w-36 rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "2/3" }}>
            {book.cover_url
              ? <img src={book.cover_url} className="w-full h-full object-cover" alt={book.title} />
              : <CoverPlaceholder title={book.title} color={color} />}
          </div>
        </div>
        {/* Info */}
        <div className="px-6 pb-6 space-y-4">
          <div className="text-center">
            <h2 className="font-extrabold text-xl leading-tight mb-1" style={{ color: "var(--text-primary)" }}>{book.title}</h2>
            {book.author_name && <p className="text-sm" style={{ color: "var(--text-muted)" }}>por {book.author_name}</p>}
            {book.category && (
              <span className="inline-block mt-2 text-xs font-bold uppercase px-3 py-1 rounded-full" style={{ background: `${color}22`, color }}>
                {book.category}
              </span>
            )}
          </div>
          {/* Stats */}
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <p className="font-extrabold text-lg" style={{ color: P }}>{fmtN(book.downloads ?? 0)}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Downloads</p>
            </div>
            <div className="text-center">
              <p className="font-extrabold text-lg" style={{ color: "#E94B8A" }}>{fmtN(book.saves ?? 0)}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Guardados</p>
            </div>
            {book.file_format && (
              <div className="text-center">
                <p className="font-extrabold text-lg" style={{ color: "#1FAFA6" }}>{book.file_format}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Formato</p>
              </div>
            )}
          </div>
          {/* Descrição */}
          {book.description && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{book.description}</p>
          )}
          {/* Acções */}
          <div className="flex gap-3">
            <button onClick={onSave}
              className="flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all active:scale-95"
              style={book.saved_by_me
                ? { background: `${P}18`, color: P, borderColor: P }
                : { background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
              {book.saved_by_me ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              {book.saved_by_me ? "Guardado" : "Guardar"}
            </button>
            <button onClick={onDownload}
              className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg,${P},#E94B8A)` }}>
              <Download className="w-4 h-4" /> Descarregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Página Principal ── */
function LivrosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate]   = useState(false);
  const [showDetail, setShowDetail]   = useState<any>(null);
  const [search, setSearch]           = useState("");
  const [tab, setTab]                 = useState<"discover" | "saved" | "mine">("discover");

  // Sessão
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => { const { data } = await supabase.auth.getSession(); return data.session; },
  });
  const uid = session?.user?.id;

  // Todos os livros (explorar)
  const { data: allBooks = [], isLoading } = useQuery({
    queryKey: ["books", "all"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("books")
        .select("*")
        .order("downloads", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // Livros guardados pelo utilizador
  const { data: savedIds = [] } = useQuery({
    queryKey: ["books", "saved", uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data } = await (supabase as any)
        .from("book_saves").select("book_id").eq("user_id", uid);
      return (data ?? []).map((r: any) => r.book_id);
    },
    enabled: !!uid,
  });

  // Enriquecer com saved_by_me
  const enriched = allBooks.map((b: any) => ({ ...b, saved_by_me: savedIds.includes(b.id) }));

  // Filtrar por tab
  const tabBooks = tab === "saved"
    ? enriched.filter((b: any) => b.saved_by_me)
    : tab === "mine"
    ? enriched.filter((b: any) => b.uploader_id === uid)
    : enriched;

  // Filtrar por pesquisa
  const filtered = search.trim()
    ? tabBooks.filter((b: any) =>
        b.title?.toLowerCase().includes(search.toLowerCase()) ||
        b.author_name?.toLowerCase().includes(search.toLowerCase()) ||
        b.category?.toLowerCase().includes(search.toLowerCase()))
    : tabBooks;

  // Score algoritmo: mais downloads + saves = aparece primeiro
  const sorted = [...filtered].sort((a, b) =>
    tab === "discover" ? (b.downloads * 2 + b.saves * 3) - (a.downloads * 2 + a.saves * 3) : 0
  );

  async function toggleSave(book: any) {
    if (!uid) { toast.error("Inicia sessão para guardar livros."); return; }
    const isSaved = savedIds.includes(book.id);
    if (isSaved) {
      await (supabase as any).from("book_saves").delete().eq("user_id", uid).eq("book_id", book.id);
      await (supabase as any).from("books").update({ saves: Math.max(0, (book.saves ?? 1) - 1) }).eq("id", book.id);
      toast.success("Removido dos guardados");
    } else {
      await (supabase as any).from("book_saves").insert({ user_id: uid, book_id: book.id });
      await (supabase as any).from("books").update({ saves: (book.saves ?? 0) + 1 }).eq("id", book.id);
      toast.success("Livro guardado!");
    }
    qc.invalidateQueries({ queryKey: ["books"] });
    if (showDetail?.id === book.id) setShowDetail({ ...showDetail, saved_by_me: !isSaved });
  }

  async function handleDownload(book: any) {
    if (!book.file_url) { toast.error("Ficheiro não disponível."); return; }
    // Incrementar contador
    await (supabase as any).from("books").update({ downloads: (book.downloads ?? 0) + 1 }).eq("id", book.id);
    if (uid) await (supabase as any).from("book_downloads").insert({ user_id: uid, book_id: book.id }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["books"] });
    window.open(book.file_url, "_blank");
  }

  const TABS = [
    { key: "discover", label: "Descobrir" },
    { key: "saved",    label: "Guardados" },
    { key: "mine",     label: "Os meus"   },
  ] as const;

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {/* Header */}
        <div className="sticky top-0 z-30 px-4 pt-4 pb-3"
          style={{ background: "var(--s1)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6" style={{ color: P }} />
              <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Livros</h1>
            </div>
            {uid && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 h-9 rounded-full text-white text-sm font-bold transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg,${P},#E94B8A)` }}>
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar livros, autores..."
              className="w-full pl-9 pr-4 h-10 rounded-full text-sm border outline-none"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className="px-4 h-8 rounded-full text-sm font-bold transition-all"
                style={tab === key
                  ? { background: P, color: "#fff" }
                  : { background: "var(--s2)", color: "var(--text-muted)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="px-4 py-4">
          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "var(--s2)" }}>
                  <div style={{ aspectRatio: "2/3", background: "var(--s3)" }} />
                  <div className="p-2 space-y-1.5">
                    <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "80%" }} />
                    <div className="h-2.5 rounded-full" style={{ background: "var(--s3)", width: "60%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <BookOpen className="w-12 h-12 opacity-20" style={{ color: P }} />
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                {tab === "saved" ? "Ainda não guardaste nenhum livro" :
                 tab === "mine"  ? "Ainda não publicaste nenhum livro" :
                 search ? "Nenhum livro encontrado" : "Ainda não há livros"}
              </p>
              {tab === "mine" && uid && (
                <button onClick={() => setShowCreate(true)}
                  className="mt-2 px-5 h-10 rounded-full text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg,${P},#E94B8A)` }}>
                  Adicionar o primeiro livro
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {sorted.map((book: any) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onSave={() => toggleSave(book)}
                  onOpen={() => setShowDetail(book)}
                />
              ))}
            </div>
          )}
        </div>

        <BottomNav />
      </PageWrapper>

      {showCreate && (
        <CreateBookModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["books"] })}
        />
      )}

      {showDetail && (
        <BookDetailModal
          book={enriched.find((b: any) => b.id === showDetail.id) ?? showDetail}
          onClose={() => setShowDetail(null)}
          onSave={() => toggleSave(showDetail)}
          onDownload={() => handleDownload(showDetail)}
        />
      )}
    </>
  );
}
