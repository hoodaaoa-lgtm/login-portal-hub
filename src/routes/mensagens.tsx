import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, REALTIME_QUERY_OPTIONS, CONVERSATIONS_QUERY_OPTIONS } from "@/lib/queryClient";
import {
  isEncrypted,
} from "@/lib/e2ee";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useBadges } from "@/contexts/BadgeContext";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { ConversationListSkeleton, BackgroundRefreshDot } from "@/components/Skeletons";
import { toast } from "sonner";

// Helper para tabelas não tipadas no schema gerado
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Send, AtSign, UserPlus, X, Check,
  Loader, Clock, CheckCheck, Bell, UserCheck, UserX, MessageSquare,
  Smile, Mic, Image as ImageIcon, FileText, Video as VideoIcon,
  MoreVertical, Plus, RotateCw, Wand2, Pencil, Type as TypeIcon,
  Crop, Grid3x3, Download, ZoomIn, Forward, Star,
  Eye, EyeOff, Trash2, Reply, Copy,
  AlertCircle, RefreshCw, ArrowDown,
} from "lucide-react";
import MediaEditor, { MediaEditState, DEFAULT_EDIT, EditedMediaDisplay } from "@/components/MediaEditor";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

// Upload directo para Cloudinary com progresso (suporta audio/video via resource_type=video)
function cloudinaryUploadMedia(
  file: File,
  resourceType: "image" | "video",
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", "hooda_videos");
    fd.append("folder", folder);
    fd.append("resource_type", resourceType);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error("Cloudinary: resposta inválida")); }
      } else {
        let msg = `Cloudinary erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Falha de rede no upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelado.")));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/dy7o7tgmk/${resourceType}/upload`);
    xhr.send(fd);
  });
}

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "hooda — Mensagens" }] }),
  component: MensagensPage,
});

const ACCENT = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
const colorFor = (s: string) => ACCENT[(s?.charCodeAt(0) ?? 0) % ACCENT.length];

/* ── Som de notificação (gerado via Web Audio API — sem ficheiro externo) ── */
function playMsgSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Nota 1 — curta e suave
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(ctx.destination);
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    o1.frequency.exponentialRampToValueAtTime(1100, now + 0.08);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.18, now + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o1.start(now); o1.stop(now + 0.18);

    // Nota 2 — ligeiramente mais alta
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(ctx.destination);
    o2.type = "sine";
    o2.frequency.setValueAtTime(1320, now + 0.12);
    o2.frequency.exponentialRampToValueAtTime(1500, now + 0.22);
    g2.gain.setValueAtTime(0, now + 0.12);
    g2.gain.linearRampToValueAtTime(0.14, now + 0.14);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    o2.start(now + 0.12); o2.stop(now + 0.32);

    setTimeout(() => ctx.close(), 600);
  } catch {}
}


function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  color: string;
  is_online?: boolean;
  last_seen?: string;
  msg_permission?: string;
};

type Contact = Profile & {
  conversationId: string;
  lastMsg: string;
  lastTime: string;
  unread: number;
};

// Message type defined in ChatPanel section below

type MessageRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  preview_text: string | null;
  status: string;
  created_at: string;
  sender?: Profile;
};

function isValidUUID(id: string | null | undefined): id is string {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ── Avatar ──
function Av({ name, color, size = 40, src }: { name: string; color?: string; size?: number; src?: string | null }) {
  const { t } = useTranslation();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color || colorFor(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.38,
      flexShrink: 0, overflow: "hidden",
    }}>
      {src
        ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

function AvatarRing({ name, color, size = 46, src }: { name: string; color?: string; size?: number; src?: string | null }) {
  const { t } = useTranslation();
  return (
    <div style={{ borderRadius: "50%", padding: 2, background: "linear-gradient(135deg,#5B3FCF 0%,#E94B8A 50%,#FFC93C 100%)", flexShrink: 0 }}>
      <div style={{ borderRadius: "50%", padding: 2, background: "var(--bg-card,white)" }}>
        <Av name={name} color={color} size={size} src={src} />
      </div>
    </div>
  );
}

// ── Verificar permissão de mensagem ──
async function checkMsgPermission(myId: string, targetId: string): Promise<"allowed" | "request" | "blocked"> {
  try {
    // Obter permissão do alvo
    const { data: targetProfile, error: profErr } = await db
      .from("profiles")
      .select("msg_permission, username")
      .eq("id", targetId)
      .single();

    if (profErr) {
      console.warn("[checkMsgPermission] Erro ao obter perfil do alvo:", profErr.message);
      return "allowed"; // fallback permissivo
    }

    const perm = targetProfile?.msg_permission ?? "todos";
    console.log(`[checkMsgPermission] Permissão de ${targetId}: "${perm}"`);

    if (perm === "todos") return "allowed";
    // "aprovados" = sempre requer pedido de mensagem (independente de seguimento)
    if (perm === "aprovados") return "request";

    // Verificar se sou seguidor
    const { data: myProfile, error: myProfErr } = await db
      .from("profiles")
      .select("username")
      .eq("id", myId)
      .single();

    if (myProfErr) {
      console.warn("[checkMsgPermission] Erro ao obter perfil próprio:", myProfErr.message);
      return "allowed";
    }

    const myUsername = myProfile?.username ?? "";
    const targetUsername = targetProfile?.username ?? "";

    if (perm === "seguidores") {
      // O alvo segue-me a mim?
      const { data: follows, error: followErr } = await db
        .from("follows")
        .select("follower_id")
        .eq("follower_id", targetId)
        .eq("target_username", myUsername)
        .maybeSingle();
      if (followErr) console.warn("[checkMsgPermission] Erro ao verificar 'seguidores':", followErr.message);
      return follows ? "allowed" : "request";
    }

    if (perm === "mutuos") {
      // Verificar seguimento mútuo
      const [{ data: iFollow, error: iFollowErr }, { data: theyFollow, error: theyFollowErr }] = await Promise.all([
        db.from("follows").select("follower_id").eq("follower_id", myId).eq("target_username", targetUsername).maybeSingle(),
        db.from("follows").select("follower_id").eq("follower_id", targetId).eq("target_username", myUsername).maybeSingle(),
      ]);
      if (iFollowErr) console.warn("[checkMsgPermission] Erro ao verificar iFollow:", iFollowErr.message);
      if (theyFollowErr) console.warn("[checkMsgPermission] Erro ao verificar theyFollow:", theyFollowErr.message);
      return (iFollow && theyFollow) ? "allowed" : "request";
    }

    return "request";
  } catch {
    return "allowed"; // fallback permissivo em caso de erro
  }
}

// ── Criar/encontrar conversa ──
// Usa a função RPC SECURITY DEFINER no servidor para contornar de
// forma SEGURA a RLS de conversation_participants (que só permite
// inserir linhas onde user_id = auth.uid(), impossibilitando
// inserir o participante "outro" directamente do cliente).
async function findOrCreateConversation(myId: string, otherId: string): Promise<string | null> {
  try {
    console.log(`[findOrCreateConversation] myId=${myId} otherId=${otherId}`);

    const { data, error } = await db
      .rpc("create_conversation_with_participants", {
        p_my_id: myId,
        p_other_id: otherId,
      });

    if (error) {
      console.error("[findOrCreateConversation] Erro RPC:", error);
      toast.error(`Erro ao criar conversa: ${error.message}`);
      return null;
    }

    console.log(`[findOrCreateConversation] Conversa criada/encontrada: ${data}`);
    return data as string;
  } catch (err) {
    console.error("[findOrCreateConversation] Exceção:", err);
    toast.error(err instanceof Error ? `Erro: ${err.message}` : "Erro desconhecido ao criar conversa");
    return null;
  }
}

// ── Modal Adicionar Contacto ──
function AddContactModal({ myId, onClose, onAdd, existingContacts }: {
  myId: string;
  onClose: () => void;
  onAdd: (p: Profile, convId: string) => void;
  existingContacts: Contact[];
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState("");
  const [requestSent, setRequestSent] = useState<Set<string>>(new Set<string>());
  const [requestTarget, setRequestTarget] = useState<Profile | null>(null);
  const [requestMsg, setRequestMsg] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const clean = query.trim().replace(/^@/, "");
    try {
      // Pesquisar por username OU full_name
      const { data, error } = await db
        .from("profiles")
        .select("id,username,full_name,avatar_url,msg_permission")
        .or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`)
        .neq("id", myId)
        .limit(10);

      if (error) {
        console.error("Erro na pesquisa:", error);
        toast.error("Erro ao pesquisar");
        setResults([]);
        return;
      }

      const validResults = (data || [])
        .filter((p: any) => isValidUUID(p.id))
        .map((p: any) => ({
          id: p.id,
          username: p.username || "?",
          full_name: p.full_name || p.username || "?",
          avatar_url: p.avatar_url || null,
          color: colorFor(p.username || p.id),
          is_online: !!p.is_online,
          last_seen: new Date().toISOString(),
          msg_permission: p.msg_permission || "todos",
        }));

      setResults(validResults);
    } catch (err) {
      console.error("Erro na pesquisa:", err);
    } finally {
      setSearching(false);
    }
  }, [myId]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (search.trim()) {
      searchTimeoutRef.current = setTimeout(() => handleSearch(search), 300);
    } else {
      setResults([]);
    }
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search, handleSearch]);

  const handleAdd = useCallback(async (profile: Profile) => {
    if (adding) return;
    setAdding(profile.id);
    console.log(`[handleAdd] A adicionar @${profile.username} (id=${profile.id})`);

    try {
      // Verificar permissão
      let permission: "allowed" | "request" | "blocked" = "allowed";
      try {
        permission = await checkMsgPermission(myId, profile.id);
        console.log(`[handleAdd] Permissão para @${profile.username}: ${permission}`);
      } catch (permErr) {
        console.error("[handleAdd] Erro ao verificar permissão, a prosseguir como permitido:", permErr);
      }

      if (permission === "request") {
        // Verificar se já existe pedido — qualquer erro aqui é mostrado,
        // nunca falha em silêncio
        const { data: existing, error: checkErr } = await db
          .from("message_requests")
          .select("id, status")
          .eq("sender_id", myId)
          .eq("receiver_id", profile.id)
          .maybeSingle();

        if (checkErr) {
          // Tabela message_requests pode não existir / RLS pode bloquear.
          // Em vez de travar o utilizador, caímos para conversa direta.
          console.error("[handleAdd] message_requests indisponível, a criar conversa direta:", checkErr);
          const convId = await findOrCreateConversation(myId, profile.id);
          if (convId) {
            toast.success(`@${profile.username} adicionado!`);
            onAdd(profile, convId);
            setSearch("");
            setResults([]);
          } else {
            toast.error("Não foi possível adicionar o contacto. Tenta novamente.");
          }
          return;
        }

        if (existing?.status === "rejected") {
          toast.error(`${profile.username} não aceita pedidos de mensagem`);
          return;
        }

        if (existing?.status === "pending") {
          setRequestSent(prev => new Set([...prev, profile.id]));
          toast(`Já enviaste um pedido a @${profile.username}`);
          return;
        }

        if (!existing) {
          // Mostrar caixa para escrever mensagem antes de enviar pedido
          setAdding("");
          setRequestTarget(profile);
          setRequestMsg("");
          return;
        }

        setRequestSent(prev => new Set([...prev, profile.id]));
        toast.success(`Pedido de mensagem enviado a @${profile.username}`);
        return;
      }

      // Criar conversa diretamente
      console.log(`[handleAdd] Permissão directa — a criar conversa com @${profile.username}`);
      const convId = await findOrCreateConversation(myId, profile.id);
      if (convId) {
        toast.success(`@${profile.username} adicionado!`);
        onAdd(profile, convId);
        setSearch("");
        setResults([]);
      } else {
        toast.error("Não foi possível adicionar o contacto. Tenta novamente.");
      }
    } catch (err) {
      console.error("[handleAdd] Erro inesperado ao adicionar contacto:", err);
      toast.error(err instanceof Error ? `Erro: ${err.message}` : "Erro inesperado ao adicionar contacto");
    } finally {
      setAdding("");
    }
  }, [myId, onAdd]);

  async function sendRequest() {
    if (!requestTarget || sendingRequest) return;
    setSendingRequest(true);
    try {
      const msg = requestMsg.trim() || "Olá! Quero enviar-te uma mensagem.";
      const { error } = await db.from("message_requests").insert({
        sender_id: myId,
        receiver_id: requestTarget.id,
        preview_text: msg,
        status: "pending",
      });
      if (error) {
        // Fallback: criar conversa directa
        const convId = await findOrCreateConversation(myId, requestTarget.id);
        if (convId) {
          toast.success(`@${requestTarget.username} adicionado!`);
          onAdd(requestTarget, convId);
          setRequestTarget(null);
          setSearch(""); setResults([]);
        } else {
          toast.error("Erro ao enviar pedido: " + error.message);
        }
      } else {
        setRequestSent(prev => new Set([...prev, requestTarget.id]));
        toast.success(`Pedido enviado a @${requestTarget.username}!`);
        setRequestTarget(null);
        setSearch(""); setResults([]);
      }
    } finally {
      setSendingRequest(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal de escrever mensagem do pedido */}
      {requestTarget && (
        <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden shadow-2xl z-10"
          style={{ background: "var(--bg-card,white)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border,#f0f0f0)" }}>
            <button onClick={() => setRequestTarget(null)} className="p-1.5 rounded-full hover:bg-[var(--s2)]">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="font-extrabold text-base">Enviar pedido</p>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)]"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "var(--s2,#f5f5f5)" }}>
              <AvatarRing name={requestTarget.username} color={requestTarget.color} size={40} src={requestTarget.avatar_url} />
              <div>
                <p className="font-bold text-sm">{requestTarget.full_name || requestTarget.username}</p>
                <p className="text-xs" style={{ color: "var(--text-muted,#888)" }}>@{requestTarget.username}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted,#888)" }}>A tua mensagem</p>
              <textarea
                autoFocus
                rows={4}
                maxLength={500}
                value={requestMsg}
                onChange={e => setRequestMsg(e.target.value)}
                placeholder={`Olá @${requestTarget.username}! Quero falar contigo...`}
                className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none border"
                style={{ background: "var(--s2,#f5f5f5)", borderColor: "var(--border,#e5e5e5)", color: "var(--text-primary,#111)" }}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendRequest(); }}
              />
              <p className="text-right text-[11px] mt-1" style={{ color: "var(--text-muted,#aaa)" }}>{requestMsg.length}/500</p>
            </div>
            <button
              onClick={sendRequest}
              disabled={sendingRequest}
              className="w-full h-11 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition active:scale-95"
              style={{ background: "#5B3FCF", opacity: sendingRequest ? 0.7 : 1 }}>
              {sendingRequest ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendingRequest ? "A enviar..." : "Enviar pedido"}
            </button>
            <p className="text-center text-[11px]" style={{ color: "var(--text-muted,#aaa)" }}>
              @{requestTarget.username} verá a tua mensagem antes de aceitar
            </p>
          </div>
        </div>
      )}

      {!requestTarget && <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--bg-card,white)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border,#f0f0f0)" }}>
          <p className="font-extrabold text-base">Adicionar contacto</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] dark:hover:bg-[var(--s3)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch(search)}
              placeholder={"@username ou nome"}
              autoFocus
              className="w-full h-11 pl-9 pr-4 rounded-2xl text-sm outline-none"
              style={{ background: "var(--bg-secondary,#f5f5f5)" }}
            />
          </div>

          {searching && (
            <div className="flex justify-center py-4">
              <Loader className="h-4 w-4 animate-spin" style={{ color: "#5B3FCF" }} />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map(r => {
                const isExisting = existingContacts.some(c => c.id === r.id);
                const isAdding = adding === r.id;
                const reqSent = requestSent.has(r.id);
                const needsRequest = r.msg_permission && r.msg_permission !== "todos";
                return (
                  <button
                    key={r.id}
                    onClick={() => handleAdd(r)}
                    disabled={isExisting || isAdding || reqSent}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border hover:bg-opacity-50 disabled:opacity-60 transition"
                    style={{ borderColor: "var(--border,#f0f0f0)" }}>
                    <AvatarRing name={r.username} color={r.color} size={36} src={r.avatar_url} />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-bold text-sm">{r.full_name}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted,#888)" }}>@{r.username}</p>
                    </div>
                    {isAdding && <Loader className="h-4 w-4 animate-spin" />}
                    {reqSent && <span className="text-xs font-semibold" style={{ color: "#F26B3A" }}>Pedido enviado</span>}
                    {isExisting && !reqSent && <Check className="h-4 w-4" style={{ color: "#5B3FCF" }} />}
                    {!isAdding && !isExisting && !reqSent && (
                      needsRequest
                        ? <Clock className="h-4 w-4" style={{ color: "#F26B3A" }} />
                        : <UserPlus className="h-4 w-4" style={{ color: "#5B3FCF" }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {search && !searching && results.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm font-semibold" style={{ color: "var(--text-muted,#888)" }}>Nenhum utilizador encontrado</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted,#aaa)" }}>Verifica o username ou nome</p>
            </div>
          )}

          {!search && (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: "var(--text-muted,#888)" }}>Pesquisa por @username ou nome</p>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

// ── Painel de Pedidos de Mensagem ──
function RequestsPanel({ myId, onApprove, onClose }: {
  myId: string;
  onApprove: (senderId: string, convId: string, senderProfile: Profile) => void;
  onClose: () => void;
}) {
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from("message_requests")
        .select("id,sender_id,receiver_id,preview_text,status,created_at")
        .eq("receiver_id", myId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) { setRequests([]); return; }

      // Carregar perfis dos remetentes
      const senderIds = data.map((r: any) => r.sender_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .in("id", senderIds);

      const withProfiles = data.map((r: any) => ({
        ...r,
        sender: profiles?.find((p: any) => p.id === r.sender_id)
          ? {
              id: r.sender_id,
              username: profiles.find((p: any) => p.id === r.sender_id)?.username || "?",
              full_name: profiles.find((p: any) => p.id === r.sender_id)?.full_name || null,
              avatar_url: profiles.find((p: any) => p.id === r.sender_id)?.avatar_url || null,
              color: colorFor(profiles.find((p: any) => p.id === r.sender_id)?.username || r.sender_id),
            }
          : undefined,
      }));

      setRequests(withProfiles);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const approve = async (req: MessageRequest) => {
    if (acting || !req.sender) return;
    setActing(req.id);
    try {
      const convId = await findOrCreateConversation(myId, req.sender_id);
      if (!convId) return;

      // Inserir a mensagem do pedido na conversa (como o WhatsApp faz)
      if (req.preview_text && req.preview_text !== "Quero enviar-te uma mensagem.") {
        await db.from("messages").insert({
          conversation_id: convId,
          sender_id: req.sender_id,
          receiver_id: myId,
          content: req.preview_text,
          status: "delivered",
          message_type: "text",
        });
      }

      await db.from("message_requests").update({ status: "approved" }).eq("id", req.id);
      toast.success(`Pedido de @${req.sender?.username} aprovado!`);
      onApprove(req.sender_id, convId, req.sender as Profile);
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } finally {
      setActing("");
    }
  };

  const reject = async (req: MessageRequest) => {
    if (acting) return;
    setActing(req.id);
    try {
      await db.from("message_requests").update({ status: "rejected" }).eq("id", req.id);
      toast(`Pedido de @${req.sender?.username} recusado`);
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } finally {
      setActing("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--bg-card,white)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--border,#f0f0f0)" }}>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" style={{ color: "#5B3FCF" }} />
            <p className="font-extrabold text-base">Pedidos de mensagem</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] dark:hover:bg-[var(--s3)]"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" style={{ color: "#5B3FCF" }} /></div>}

          {!loading && requests.length === 0 && (
            <div className="text-center py-10">
              <MessageSquare className="h-10 w-10 mx-auto mb-3" style={{ color: "#d1d1d1" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-muted,#888)" }}>Sem pedidos pendentes</p>
            </div>
          )}

          {requests.map(req => (
            <div key={req.id} className="p-3 rounded-2xl border" style={{ borderColor: "var(--border,#f0f0f0)" }}>
              <div className="flex items-center gap-3 mb-2">
                <AvatarRing name={req.sender?.username || "?"} color={req.sender?.color} size={36} src={req.sender?.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{req.sender?.full_name || req.sender?.username}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted,#888)" }}>@{req.sender?.username} · {timeAgo(req.created_at)}</p>
                </div>
              </div>
              {req.preview_text && (
                <p className="text-xs mb-3 px-1" style={{ color: "var(--text-muted,#666)" }}>"{req.preview_text}"</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => approve(req)} disabled={acting === req.id}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-sm font-bold text-white transition active:scale-95"
                  style={{ background: "#5B3FCF" }}>
                  {acting === req.id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                  Aceitar
                </button>
                <button onClick={() => reject(req)} disabled={acting === req.id}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-sm font-bold border transition active:scale-95"
                  style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                  <UserX className="h-3.5 w-3.5" />
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Constantes do chat (igual à comunidade) ──
const CHAT_ACCENT      = "#5B3FCF";
const CHAT_PANEL = "var(--s2)";
const CHAT_INPUT_BG    = "var(--bg-secondary, #f5f5f5)";
const CHAT_BORDER      = "var(--border, #e5e5e5)";
const CHAT_TEXT        = "var(--text-primary, #111)";
const CHAT_MUTED       = "#9ca3af";

const CHAT_EMOJI_CATS: { key: string; icon: string; emojis: string[] }[] = [
  { key: "freq",  icon: "⏱️", emojis: ["😂","❤️","😍","🤣","😊","🙏","💕","😭","😘","👍","🎉","😅","🔥","🤔","💯","😁","🥰","😢","🤩","😆","🥳","✨","💪","👏","🫂","🤝"] },
  { key: "faces", icon: "😊", emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","🙄","😬","😔","😪","😴","😷","🤒","🥵","🥶","🤯","🤠","🤡","👻","💀","👾","🤖"] },
  { key: "hands", icon: "👋", emojis: ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","✊","👊","🤛","🤜","🤲","🤝","🙏","✍️","💅","💪","🦾","🦵","🦶"] },
  { key: "pets",  icon: "🐾", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦅","🦉","🦋","🐛","🐞","🐬","🐳","🦈","🐊","🌺","🌸"] },
  { key: "food",  icon: "🍕", emojis: ["🍎","🍊","🍋","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🍆","🥑","🥦","🌽","🍕","🍔","🍟","🌭","🌮","🌯","🥙","🥚","🍳","🍣","🍱","🥟","🍦","🍩","🍪","🎂","🍰","🍫","🍬","🍭","☕","🧃","🥤","🧋","🍺","🥂"] },
  { key: "more",  icon: "🚀", emojis: ["🚀","🌈","⭐","🌟","💫","✨","💥","🔥","💯","🎉","🎊","🎁","🏆","🥇","💎","🔮","🌙","☀️","⚡","❄️","🌊","🎸","🎺","🎵","🎶","📱","💻","📷","💡","🔑","❤️‍🔥","💔","❤️","🧡","💛","💚","💙","💜","🤍","🖤"] },
];

const CHAT_STICKERS = [
  "🥳","🤯","🥺","😤","🤬","🤩","🤑","🫠","🥹","🫡","🤭","🤫","🫢","🥴",
  "💀","👻","👾","🤖","👽","🎃","🤡","🎭","🃏","🎉","🎊","🚀","🌈","⭐",
  "🌟","💫","✨","💥","🔥","💯","❤️‍🔥","💔","🐸","🐶","🐱","🐼","🦊","🦁",
  "🌺","🌸","🍀","🎸","🎵","🏆","🥇","💎","🔮","🌊","⚡","❄️","☀️","🌙",
];

const CHAT_GIFS = [
  { id: "g1",  url: "https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif",     label: "LOL" },
  { id: "g2",  url: "https://media.giphy.com/media/l41lUJ1YoZB1lHVkM/giphy.gif", label: "👏" },
  { id: "g3",  url: "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif",     label: "Gato" },
  { id: "g4",  url: "https://media.giphy.com/media/CjmvTCZf2U3p09Cn0h/giphy.gif",label: "Sim!" },
  { id: "g5",  url: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", label: "🔥" },
  { id: "g6",  url: "https://media.giphy.com/media/Vuw9m5wXviFIQ/giphy.gif",     label: "Olá" },
  { id: "g7",  url: "https://media.giphy.com/media/H7kfFDvD9HSYGRbvid/giphy.gif", label: "👍" },
  { id: "g8",  url: "https://media.giphy.com/media/kaBU6pgv0OsPHz2yxy/giphy.gif", label: "🎉" },
  { id: "g9",  url: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif", label: "🙏" },
  { id: "g10", url: "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", label: "Wow" },
  { id: "g11", url: "https://media.giphy.com/media/26AHONQ79FqaZmQLu/giphy.gif",  label: "🥳" },
  { id: "g12", url: "https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif",    label: "🐶" },
];

// ── ChatPicker — idêntico ao da comunidade ──
function ChatPicker({ tab, setTab, emojiSearch, setEmojiSearch, gifSearch, setGifSearch, gifs, gifLoading, onEmoji, onSticker, onGif }: {
  tab: "emoji" | "gif" | "sticker";
  setTab: (t: "emoji" | "gif" | "sticker") => void;
  emojiSearch: string; setEmojiSearch: (s: string) => void;
  gifSearch: string; setGifSearch: (s: string) => void;
  gifs: {id: string; url: string}[];
  gifLoading: boolean;
  onEmoji: (e: string) => void;
  onSticker: (s: string) => void;
  onGif: (url: string) => void;
}) {
  const [emojiCat, setEmojiCat] = useState("freq");
  const filteredEmojis = emojiSearch
    ? CHAT_EMOJI_CATS.flatMap(c => c.emojis).filter(e => e.includes(emojiSearch)).slice(0, 48)
    : (CHAT_EMOJI_CATS.find(c => c.key === emojiCat)?.emojis ?? []);

  return (
    <div className="shrink-0 border-t" style={{ background: CHAT_PANEL, borderColor: CHAT_BORDER }}>
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: `1px solid ${CHAT_BORDER}` }}>
        {(["emoji","gif","sticker"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wide relative transition-colors"
            style={{ color: tab === t ? CHAT_ACCENT : CHAT_MUTED }}>
            {t === "emoji" ? "Emoji" : t === "gif" ? "GIFs" : "Stickers"}
            {tab === t && <div className="absolute bottom-0 inset-x-4 h-0.5 rounded-t-full" style={{ background: CHAT_ACCENT }} />}
          </button>
        ))}
      </div>

      {/* Emoji tab */}
      {tab === "emoji" && (
        <>
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: CHAT_INPUT_BG }}>
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: CHAT_MUTED }} />
              <input value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)}
                placeholder="Pesquisar emoji…" className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: CHAT_TEXT }} />
              {emojiSearch && <button onClick={() => setEmojiSearch("")}><X className="h-3 w-3" style={{ color: CHAT_MUTED }} /></button>}
            </div>
          </div>
          {!emojiSearch && (
            <div className="flex gap-0.5 px-2 pb-1 overflow-x-auto">
              {CHAT_EMOJI_CATS.map(cat => (
                <button key={cat.key} onClick={() => setEmojiCat(cat.key)}
                  className="shrink-0 w-9 h-8 rounded-lg flex items-center justify-center text-base transition-all"
                  style={{ background: emojiCat === cat.key ? CHAT_ACCENT + "33" : "transparent" }}>
                  {cat.icon}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-8 gap-0 px-1 pb-2 overflow-y-auto" style={{ maxHeight: 180 }}>
            {filteredEmojis.map((e, i) => (
              <button key={i} onClick={() => onEmoji(e)}
                className="h-10 flex items-center justify-center text-xl rounded-lg transition-all active:scale-90 hover:bg-black/5">
                {e}
              </button>
            ))}
          </div>
        </>
      )}

      {/* GIF tab */}
      {tab === "gif" && (
        <>
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: CHAT_INPUT_BG }}>
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: CHAT_MUTED }} />
              <input value={gifSearch} onChange={e => setGifSearch(e.target.value)}
                placeholder="Pesquisar GIFs…" className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: CHAT_TEXT }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-2 overflow-y-auto" style={{ maxHeight: 180 }}>
            {gifLoading && <div className="col-span-3 text-center py-4 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>A carregar...</div>}
            {!gifLoading && (gifs.length > 0 ? gifs : CHAT_GIFS).map((gif, i) => (
              <button key={gif.id ?? i} onClick={() => onGif(gif.url)}
                className="relative rounded-xl overflow-hidden active:scale-95 transition-all"
                style={{ aspectRatio: "4/3", background: CHAT_INPUT_BG }}>
                <img src={gif.url} alt={(gif as any).label ?? "gif"} className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget.parentElement as HTMLElement).style.opacity = "0.4"; }} />
                {(gif as any).label && <div className="absolute bottom-0 inset-x-0 text-center text-[9px] font-bold text-white py-0.5"
                  style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.7))" }}>{(gif as any).label}</div>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Sticker tab */}
      {tab === "sticker" && (
        <div className="grid grid-cols-6 gap-1.5 p-2 pb-3 overflow-y-auto" style={{ maxHeight: 200 }}>
          {CHAT_STICKERS.map((s, i) => (
            <button key={i} onClick={() => onSticker(s)}
              className="flex items-center justify-center rounded-2xl active:scale-90 transition-all"
              style={{ fontSize: 30, height: 52, background: CHAT_INPUT_BG }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type MsgType = "text" | "image" | "audio" | "sticker" | "video" | "file";

type Message = {
  id: string;
  senderId: string;
  text: string;
  time: string;
  status: string;
  type: MsgType;
  mediaUrl?: string;
  duration?: number;
  replyTo?: string;
  editState?: MediaEditState;
  /** Visualização única — media some após ser vista */
  viewOnce?: boolean;
  viewOnceOpened?: boolean;
  /** Eliminada apenas para mim */
  deletedForMe?: boolean;
  /** Mensagem foi editada */
  edited?: boolean;
  /** Estado de entrega */
  deliveryStatus?: "sending" | "sent" | "read";
  /** Reações: {emoji: count} */
  reactions?: Record<string, number>;
  /** A minha reação */
  myReaction?: string;
};

// Prefixo usado para embutir a edição (filtro/recorte/texto/stickers) aplicada na
// prévia, dentro do campo "content" — assim quem recebe vê a MESMA edição, sem
// precisar de coluna nova na tabela "messages". Mesmo padrão usado no chat da comunidade.
const MEDIA_EDIT_PREFIX = "\u0000hooda:edit\u0000";

function encodeMediaCaption(caption: string, edit?: MediaEditState | null): string {
  if (!edit) return caption;
  return MEDIA_EDIT_PREFIX + JSON.stringify({ caption, edit });
}

function decodeMediaCaption(content: string): { caption: string; editState?: MediaEditState } {
  if (!content.startsWith(MEDIA_EDIT_PREFIX)) return { caption: content };
  try {
    const parsed = JSON.parse(content.slice(MEDIA_EDIT_PREFIX.length)) as { caption?: string; edit?: MediaEditState };
    return { caption: parsed.caption || "", editState: parsed.edit ?? undefined };
  } catch {
    return { caption: content };
  }
}

// ── MediaProgressRing ──
function MediaProgressRing({ pct, size = 40, color = "#fff" }: { pct?: number; size?: number; color?: string }) {
  const { t } = useTranslation();
  if (pct == null || pct <= 0) {
    return <Loader className="animate-spin" style={{ width: size * 0.55, height: size * 0.55, color }} />;
  }
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={3} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.2s linear" }} />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>{Math.round(pct)}%</span>
    </div>
  );
}

// ── Audio Player — estilo WhatsApp ──
function AudioMsg({ url, isMe, knownDur }: { url: string; isMe: boolean; knownDur?: number }) {
  const { t } = useTranslation();
  const [playing, setPlaying]     = useState(false);
  const [progress, setProgress]   = useState(0);   // 0-100
  const [cur, setCur]             = useState(0);
  const [dur, setDur]             = useState(knownDur ?? 0);
  const [speed, setSpeed]         = useState(1);
  const [loaded, setLoaded]       = useState(false);
  const audioRef  = useRef<HTMLAudioElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);
  const SPEEDS = [1, 1.5, 2];

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.playbackRate = speed; a.play().catch(() => {}); setPlaying(true); }
  };
  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current; if (!a || !a.duration) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * a.duration;
    setProgress(pct * 100);
  }
  const fmt = (s: number) => Number.isFinite(s) && s > 0
    ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "0:00";

  // pseudo-waveform estável baseada na URL
  const bars = Array.from({ length: 30 }, (_, i) => {
    const seed = ((url?.charCodeAt(i * 4 % Math.max(url?.length ?? 1, 1)) ?? 0) * 31 + i * 17) % 100;
    const bell = Math.sin((i / 29) * Math.PI) * 38;
    return Math.max(18, Math.min(85, 24 + bell + (seed % 30)));
  });

  // cores WhatsApp-style
  const bg          = isMe ? "#005C4B" : "#ffffff";
  const playBg      = isMe ? "rgba(255,255,255,0.2)" : "#25D366";
  const barFilled   = isMe ? "#25D366" : "#25D366";
  const barEmpty    = isMe ? "rgba(255,255,255,0.25)" : "#CBCBCB";
  const textColor   = isMe ? "rgba(255,255,255,0.75)" : "#8696A0";
  const speedBg     = isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)";
  const speedColor  = isMe ? "rgba(255,255,255,0.9)"  : "#54656F";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px", minWidth: 220, maxWidth: 280,
      background: bg,
      borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
    }}>
      <audio ref={audioRef} src={url} preload="metadata"
        onLoadedMetadata={e => {
          const a = e.target as HTMLAudioElement;
          const d = a.duration;
          if (isFinite(d) && d > 0) { setDur(d); setLoaded(true); }
          else { setLoaded(true); } // duração indisponível mas áudio carregou
        }}
        onCanPlay={() => { if (!loaded) setLoaded(true); }}
        onTimeUpdate={e => {
          const a = e.target as HTMLAudioElement;
          if (a.duration && isFinite(a.duration)) {
            setProgress(a.currentTime / a.duration * 100);
            setCur(a.currentTime);
            if (!dur || !isFinite(dur)) setDur(a.duration);
          }
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCur(0); }}
        onError={() => { setLoaded(true); toast.error("Erro ao carregar áudio"); }} />

      {/* Botão play/pause — WhatsApp style */}
      <button onClick={toggle} style={{
        width: 42, height: 42, borderRadius: "50%", flexShrink: 0, border: "none", cursor: "pointer",
        background: playBg, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform .1s",
      }}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 16 16" fill={isMe ? "white" : "white"}><rect x="3" y="2" width="3.5" height="12" rx="1.5"/><rect x="9.5" y="2" width="3.5" height="12" rx="1.5"/></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill={isMe ? "white" : "white"} style={{marginLeft:2}}><path d="M4 2.5l10 5.5-10 5.5V2.5z"/></svg>}
      </button>

      {/* Waveform + info */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        {/* Waveform */}
        <div ref={trackRef} onClick={seek}
          style={{ display: "flex", alignItems: "center", height: 28, gap: 2, cursor: "pointer" }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: 99,
              height: `${h}%`,
              background: (i / bars.length * 100) <= progress ? barFilled : barEmpty,
              transition: "background 0.08s",
            }} />
          ))}
        </div>
        {/* Timer + velocidade */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: textColor, fontVariantNumeric: "tabular-nums" }}>
            {loaded ? fmt(playing ? cur : dur) : "…"}
          </span>
          <button onClick={cycleSpeed} style={{
            fontSize: 10, fontWeight: 700, color: speedColor,
            background: speedBg, border: "none", borderRadius: 99,
            padding: "2px 7px", cursor: "pointer",
          }}>
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal View Once (estilo WhatsApp) ──
function ViewOnceModal({ url, type, onClose }: { url: string; type: "image"|"video"; onClose: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(10);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [onClose]);

  // Bloquear screenshot / contexto
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  const circumference = 2 * Math.PI * 18;
  const progress = ((10 - secondsLeft) / 10) * circumference;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: "#000" }}
      onContextMenu={e => e.preventDefault()}>
      {/* Header */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-4 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }}>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.15)" }}>
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-bold">{secondsLeft}s</span>
          {/* Círculo contador */}
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="white" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s linear" }} />
            <text x="22" y="27" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{secondsLeft}</text>
          </svg>
        </div>
        <div className="w-10" />
      </div>

      {/* Média */}
      <div className="w-full h-full flex items-center justify-center select-none"
        style={{ userSelect: "none", pointerEvents: "none" }}>
        {type === "image"
          ? <img src={url} alt="" className="max-w-full max-h-full object-contain"
              style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
              draggable={false} />
          : <video src={url} autoPlay muted={false} playsInline className="max-w-full max-h-full object-contain"
              style={{ pointerEvents: "none" }} />
        }
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-center px-4 py-6 z-10"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{ background: "rgba(255,255,255,0.1)" }}>
          <Eye className="h-4 w-4 text-white" />
          <span className="text-white text-sm">Visualização única · desaparece em {secondsLeft}s</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Prévia de envio de mídia (estilo WhatsApp) ──
// Mostra a imagem/vídeo escolhido em ecrã cheio com uma barra de ferramentas em
// cima (rodar, ajustar, desenhar, texto, recortar, fundo, emoji, sticker — cada
// uma abre o editor completo já existente, igual ao da comunidade), um campo de
// legenda em baixo e o botão de enviar. Sai só quando o utilizador cancela (X) ou envia.
function ChatMediaSendPreview({ item, onCancel, onSend, sending }: {
  item: { file: File; url: string; type: "image" | "video" };
  onCancel: () => void;
  onSend: (caption: string, edit: MediaEditState | null) => void | Promise<void>;
  sending: boolean;
}) {
  const [caption, setCaption] = useState("");
  const [edit, setEdit] = useState<MediaEditState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"recortar" | "filtros" | "ajustes" | "texto" | "stickers">("filtros");

  function openEditor(tab: typeof editorTab) {
    setEditorTab(tab);
    setEditorOpen(true);
  }

  function handleEditorDone(newEdit: MediaEditState) {
    setEdit(newEdit);
    setEditorOpen(false);
  }

  if (editorOpen) {
    return (
      <MediaEditor
        src={item.url}
        type={item.type}
        initialEdit={edit ?? undefined}
        onDone={handleEditorDone}
        onCancel={() => setEditorOpen(false)}
      />
    );
  }

  const tools: { id: typeof editorTab; icon: React.ReactNode; title: string }[] = [
    { id: "recortar", icon: <Crop className="h-[18px] w-[18px]" />,     title: "Recortar" },
    { id: "filtros",  icon: <Grid3x3 className="h-[18px] w-[18px]" />,  title: "Filtros" },
    { id: "ajustes",  icon: <Wand2 className="h-[18px] w-[18px]" />,    title: "Ajustes" },
    { id: "texto",    icon: <TypeIcon className="h-[18px] w-[18px]" />, title: "Texto" },
    { id: "stickers", icon: <Smile className="h-[18px] w-[18px]" />,    title: "Stickers" },
  ];

  const [showCaptionEmoji, setShowCaptionEmoji] = useState(false);
  const captionEmojis = ["😊","❤️","😂","🔥","👍","🙏","😍","✨","💕","🎉","😘","🥰","😭","💯","🤩","👏","🫂","😅","🥳","💪"];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "#0a0a0f" }}>
      {/* Header — barra de ferramentas estilo WhatsApp */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
        <button onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.1)" }}>
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="flex items-center gap-1">
          {tools.map((t, i) => (
            <button key={i} onClick={() => openEditor(t.id)} title={t.title}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition hover:bg-[var(--s2)]/10"
              style={{ color: "white" }}>
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Mídia centralizada */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-3 min-h-0" onClick={() => setShowCaptionEmoji(false)}>
        <div className="max-w-full max-h-full rounded-2xl overflow-hidden">
          {edit ? (
            <EditedMediaDisplay src={item.url} type={item.type} edit={edit} maxH={520} />
          ) : item.type === "image" ? (
            <img src={item.url} alt="" className="max-w-full max-h-[60vh] object-contain block" />
          ) : (
            <video src={item.url} muted loop autoPlay playsInline className="max-w-full max-h-[60vh] object-contain block" />
          )}
        </div>
      </div>

      {/* Emoji picker para legenda */}
      {showCaptionEmoji && (
        <div className="shrink-0 px-3 pb-2">
          <div className="grid grid-cols-10 gap-1 p-2 rounded-2xl" style={{ background: "rgba(255,255,255,0.08)" }}>
            {captionEmojis.map(e => (
              <button key={e} onClick={() => { setCaption(p => p + e); setShowCaptionEmoji(false); }}
                className="h-9 flex items-center justify-center text-xl rounded-lg active:scale-90 transition hover:bg-[var(--s2)]/10">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legenda + enviar */}
      <div className="px-3 py-3 shrink-0">
        <div className="flex items-center gap-2 rounded-full px-2 py-1"
          style={{ background: "rgba(255,255,255,0.08)" }}>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !sending) onSend(caption, edit); }}
            placeholder={"Adicionar legenda…"}
            className="flex-1 bg-transparent outline-none text-white placeholder:text-white/40 text-sm px-3 py-2.5"
            autoFocus
          />
          <button onClick={() => setShowCaptionEmoji(v => !v)}
            className="p-1 rounded-full transition active:scale-90"
            style={{ color: showCaptionEmoji ? "#FFC93C" : "rgba(255,255,255,0.6)" }}>
            <Smile className="h-5 w-5" />
          </button>
          <button onClick={() => !sending && onSend(caption, edit)} disabled={sending}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-50"
            style={{ background: "#25D366" }}>
            {sending
              ? <Loader className="h-5 w-5 animate-spin text-white" />
              : <Send className="h-5 w-5 text-white" style={{ marginLeft: 2 }} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lightbox de visualização de mídia (estilo WhatsApp Web) ──
// Abre ao clicar numa imagem/vídeo já enviado no chat. Mostra a mídia em ecrã
// cheio, com header (avatar+nome, hora, zoom, encaminhar, favorito, emoji,
// download, mais opções, fechar), setas ‹ › para navegar entre as mídias da
// conversa, e uma tira de miniaturas em baixo com a atual destacada a verde.
function ChatMediaLightbox({ items, index, onIndexChange, onClose, onReact, contact, myId }: {
  items: Message[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onReact?: (msgId: string, emoji: string) => void;
  contact: Contact;
  myId: string;
}) {
  const current = items[index];
  const [favorited, setFavorited] = useState<Record<string, boolean>>({});
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [displayIndex, setDisplayIndex] = useState(index);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");

  // Animate out → update → animate in when index changes
  useEffect(() => {
    if (index === displayIndex) return;
    setSlideDir(index > displayIndex ? "right" : "left");
    setVisible(false);
    const t = setTimeout(() => {
      setDisplayIndex(index);
      setVisible(true);
    }, 180);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  useEffect(() => {
    const el = thumbStripRef.current?.querySelector(`[data-idx="${index}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  const displayItem = items[displayIndex];

  if (!displayItem) return null;

  const senderName = displayItem.senderId === myId ? "Tu" : (contact.full_name || contact.username);
  const senderPhoto = displayItem.senderId === myId ? null : contact.avatar_url;
  const dateLabel = displayItem.time;

  const [zoom, setZoom] = useState(1);
  const [showReact, setShowReact] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const REACT_EMOJIS = ["❤️","🔥","😂","👍","😮","😢","🥰","🎉"];

  // Reset zoom ao mudar imagem
  useEffect(() => { setZoom(1); setShowReact(false); setShowMore(false); }, [displayIndex]);

  function toggleFavorite() {
    setFavorited((f) => ({ ...f, [displayItem.id]: !f[displayItem.id] }));
    toast.success(favorited[displayItem.id] ? "Removido dos favoritos" : "Guardado nos favoritos");
  }

  function handleDownload() {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = displayItem.mediaUrl!;
    a.download = `hooda-media-${Date.now()}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Download iniciado");
  }

  function handleForward() {
    if (navigator.share && displayItem.mediaUrl) {
      navigator.share({ url: displayItem.mediaUrl }).catch(() => {});
    } else if (displayItem.mediaUrl) {
      navigator.clipboard?.writeText(displayItem.mediaUrl).then(() => toast.success("Link copiado!")).catch(() => toast.info("Partilha não suportada neste browser"));
    }
  }

  function handleCopyLink() {
    if (displayItem.mediaUrl) {
      navigator.clipboard?.writeText(displayItem.mediaUrl).then(() => { toast.success("Link copiado!"); setShowMore(false); }).catch(() => toast.error("Não foi possível copiar"));
    }
  }

  function handleReact(emoji: string) {
    setShowReact(false);
    onReact?.(displayItem.id, emoji);
  }

  function handleZoomToggle() {
    setZoom(z => z === 1 ? 2 : 1);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: "#0e0e0e" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#1a1a1a" }}>
        <Av name={senderName} color={colorFor(senderName)} size={36} src={senderPhoto} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{senderName}</p>
          <p className="text-xs text-white/50 truncate">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 relative">
          {/* Zoom */}
          <button title={zoom === 1 ? "Zoom in" : "Zoom out"} onClick={handleZoomToggle}
            className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: zoom !== 1 ? "rgba(255,255,255,0.2)" : "transparent", color: "rgba(255,255,255,0.7)" }}>
            <ZoomIn className="h-[18px] w-[18px]" />
          </button>
          {/* Encaminhar / partilhar */}
          <button title={"Partilhar"} onClick={handleForward}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--s2)]/10 transition active:scale-90">
            <Forward className="h-[18px] w-[18px]" />
          </button>
          {/* Favorito */}
          <button title="Favorito" onClick={toggleFavorite}
            className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ color: favorited[displayItem.id] ? "#FFC93C" : "rgba(255,255,255,0.7)" }}>
            <Star className="h-[18px] w-[18px]" fill={favorited[displayItem.id] ? "#FFC93C" : "none"} />
          </button>
          {/* Reagir */}
          <div className="relative">
            <button title="Reagir" onClick={() => { setShowReact(v => !v); setShowMore(false); }}
              className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
              style={{ color: reactions[displayItem.id] ? "#FFC93C" : "rgba(255,255,255,0.7)", background: showReact ? "rgba(255,255,255,0.15)" : "transparent" }}>
              {reactions[displayItem.id] ? <span style={{ fontSize: 18 }}>{reactions[displayItem.id]}</span> : <Smile className="h-[18px] w-[18px]" />}
            </button>
            {showReact && (
              <div className="absolute bottom-full right-0 mb-2 flex gap-1 p-2 rounded-2xl shadow-2xl z-50"
                style={{ background: "#2a2a2a" }}>
                {REACT_EMOJIS.map(e => (
                  <button key={e} onClick={() => handleReact(e)}
                    className="w-9 h-9 flex items-center justify-center text-xl rounded-xl transition active:scale-90 hover:bg-[var(--s2)]/10">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Download */}
          <button title="Transferir" onClick={handleDownload}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--s2)]/10 transition active:scale-90">
            <Download className="h-[18px] w-[18px]" />
          </button>
          {/* Mais opções */}
          <div className="relative">
            <button title="Mais opções" onClick={() => { setShowMore(v => !v); setShowReact(false); }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--s2)]/10 transition active:scale-90">
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
            {showMore && (
              <div className="absolute right-0 top-full mt-1 rounded-2xl overflow-hidden shadow-2xl z-50 min-w-[160px]"
                style={{ background: "#2a2a2a" }}>
                <button onClick={handleCopyLink}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white hover:bg-[var(--s2)]/10 transition">
                  <RefreshCw className="h-4 w-4 opacity-70" /> Copiar link
                </button>
                <button onClick={() => { handleDownload(); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white hover:bg-[var(--s2)]/10 transition">
                  <Download className="h-4 w-4 opacity-70" /> Guardar
                </button>
              </div>
            )}
          </div>
          {/* Fechar */}
          <button title={"Fechar"} onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--s2)]/10 transition active:scale-90">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Mídia central com setas de navegação */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-4" onClick={onClose}>
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10 active:scale-90 transition"
            style={{ background: "rgba(255,255,255,0.1)" }}>
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10 active:scale-90 transition"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        )}

        <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full flex items-center justify-center"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1) translateX(0)" : `scale(0.96) translateX(${slideDir === "right" ? "-24px" : "24px"})`,
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }}>
          {displayItem.type === "image" ? (
            displayItem.editState ? (
              <EditedMediaDisplay src={displayItem.mediaUrl!} type="image" edit={displayItem.editState} maxH={(typeof window !== "undefined" ? window.innerHeight : 600) * 0.7} />
            ) : (
              <img src={displayItem.mediaUrl} alt="" onClick={handleZoomToggle}
                className="max-w-full max-h-[72vh] object-contain select-none transition-transform duration-300 cursor-zoom-in"
                style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? "zoom-out" : "zoom-in" }}
                draggable={false} />
            )
          ) : (
            displayItem.editState ? (
              <EditedMediaDisplay src={displayItem.mediaUrl!} type="video" edit={displayItem.editState} maxH={(typeof window !== "undefined" ? window.innerHeight : 600) * 0.7} />
            ) : (
              <div className="max-w-full w-full" style={{ maxHeight: "72vh" }}>
                <HoodaPlayer src={displayItem.mediaUrl!} autoPlay rounded="rounded-xl" aspectRatio="16/9" />
              </div>
            )
          )}
        </div>

        {/* Reação (estilo "🥹 2" do mockup) */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 12 }}>
          {/* placeholder de reações reais pode entrar aqui futuramente */}
        </div>
      </div>

      {/* Tira de miniaturas */}
      {items.length > 1 && (
        <div ref={thumbStripRef} className="flex items-center gap-2 px-4 py-3 overflow-x-auto shrink-0" style={{ background: "#1a1a1a" }}>
          {items.map((it, i) => (
            <button key={it.id} data-idx={i} onClick={() => onIndexChange(i)}
              className="relative shrink-0 rounded-lg overflow-hidden transition-all"
              style={{
                width: 56, height: 56,
                outline: i === index ? "2px solid #25D366" : "2px solid transparent",
                outlineOffset: 2,
                opacity: i === index ? 1 : 0.6,
              }}>
              {it.type === "image" ? (
                <img src={it.mediaUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video src={it.mediaUrl} className="w-full h-full object-cover" muted />
                  <div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 px-1 rounded text-[9px] text-white font-semibold" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <VideoIcon className="h-2.5 w-2.5" />
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    typeof document !== "undefined" ? document.body : ({} as Element)
  );
}

// ── Opções de fundo do chat ──
const BG_OPTIONS = [
  { id: "default",   label: "Padrão",      bg: "#f0ece8", style: { backgroundImage: "radial-gradient(circle, rgba(91,63,207,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" } },
  { id: "white",     label: "Branco",      bg: "#ffffff", style: {} },
  { id: "dark",      label: "Escuro",      bg: "#1a1a2e", style: {} },
  { id: "purple",    label: "Púrpura",     bg: "linear-gradient(160deg,#2d1b69 0%,#11041f 100%)", style: {} },
  { id: "ocean",     label: "Oceano",      bg: "linear-gradient(160deg,#0f2027 0%,#203a43 50%,#2c5364 100%)", style: {} },
  { id: "rose",      label: "Rosa",        bg: "linear-gradient(160deg,#fce4ec 0%,#f8bbd0 100%)", style: {} },
  { id: "mint",      label: "Menta",       bg: "linear-gradient(160deg,#e0f7fa 0%,#b2ebf2 100%)", style: {} },
  { id: "sunset",    label: "Pôr do sol",  bg: "linear-gradient(160deg,#fff3e0 0%,#ffe0b2 100%)", style: {} },
  { id: "dots",      label: "Pontos",      bg: "#f5f0ff", style: { backgroundImage: "radial-gradient(circle, rgba(91,63,207,0.15) 1.5px, transparent 1.5px)", backgroundSize: "18px 18px" } },
  { id: "lines",     label: "Linhas",      bg: "#f0f4ff", style: { backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(91,63,207,0.08) 22px, rgba(91,63,207,0.08) 23px)" } },
  { id: "grid",      label: "Grelha",      bg: "#f8f8f8", style: { backgroundImage: "linear-gradient(rgba(91,63,207,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(91,63,207,0.07) 1px,transparent 1px)", backgroundSize: "20px 20px" } },
  { id: "waves",     label: "Ondas",       bg: "linear-gradient(160deg,#667eea 0%,#764ba2 100%)", style: {} },
] as const;

type BgId = typeof BG_OPTIONS[number]["id"];

// Mapa id → background CSS — construído a partir de BG_OPTIONS (fonte única de verdade)
const CHAT_BACKGROUNDS = Object.fromEntries(
  BG_OPTIONS.map(o => [o.id, o.bg])
) as Record<BgId, string>;

// ── Emoji Reactions ──
const REACTION_EMOJIS = ["❤️","🔥","😂","👍","😮","😢"];

function ReactionBar({ reactions, myReaction, onReact }: {
  reactions?: Record<string,number>;
  myReaction?: string | null;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = Object.values(reactions ?? {}).reduce((s,v) => s+v, 0);
  if (total === 0 && !open) return (
    <button onClick={() => setOpen(true)}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] px-1.5 py-0.5 rounded-full"
      style={{ background: "var(--s3)", color: "var(--text-muted)" }}>
      +
    </button>
  );
  return (
    <div className="relative flex items-center gap-1 flex-wrap mt-0.5">
      {/* Existing reactions */}
      {Object.entries(reactions ?? {}).filter(([,v])=>v>0).map(([emoji, count]) => (
        <button key={emoji} onClick={() => onReact(emoji)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[12px] transition active:scale-90"
          style={{
            background: myReaction===emoji ? "#5B3FCF20" : "var(--s3)",
            border: myReaction===emoji ? "1px solid #5B3FCF50" : "1px solid var(--border-subtle)",
          }}>
          {emoji} <span style={{ fontSize:10, color:"var(--text-secondary)" }}>{count}</span>
        </button>
      ))}
      {/* Add reaction button */}
      <button onClick={() => setOpen(v=>!v)}
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] opacity-0 group-hover:opacity-100 transition"
        style={{ background: "var(--s3)", color: "var(--text-muted)" }}>
        +
      </button>
      {/* Picker popup */}
      {open && (
        <div className="absolute bottom-7 left-0 flex items-center gap-1 px-2 py-1.5 rounded-2xl shadow-xl z-30"
          style={{ background: "var(--s0)", border: "1px solid var(--border-default)" }}
          onMouseLeave={() => setOpen(false)}>
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => { onReact(e); setOpen(false); }}
              className="text-xl hover:scale-125 active:scale-90 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--s2)]">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scroll-to-bottom button ──
function ScrollToBottomBtn({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all active:scale-90"
      style={{
        background: "#5B3FCF",
        opacity: show ? 1 : 0,
        pointerEvents: show ? "all" : "none",
        transform: show ? "scale(1) translateY(0)" : "scale(0.8) translateY(8px)",
        transition: "all 0.2s ease",
      }}>
      <ArrowDown className="w-5 h-5 text-white" />
    </button>
  );
}

// ── Retry button for failed messages ──
function FailedMsgBadge({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <AlertCircle className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
      <span className="text-[11px]" style={{ color: "#ef4444" }}>Falhou ao enviar</span>
      <button onClick={onRetry}
        className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition active:scale-90"
        style={{ background: "#ef444415", color: "#ef4444" }}>
        <RefreshCw className="w-3 h-3" /> Tentar
      </button>
    </div>
  );
}

// ── Upload progress overlay on image bubbles ──
function UploadProgressOverlay({ progress }: { progress?: number }) {
  const { t } = useTranslation();
  if (progress == null || progress >= 100) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
      style={{ background: "rgba(0,0,0,0.45)" }}>
      <MediaProgressRing pct={progress} size={44} color="#fff" />
    </div>
  );
}

// ─────────────────────────────────────────
// MsgBubble — bolha com menu contexto completo
// ─────────────────────────────────────────
function MsgBubble({ m, isMe, replied, contact, myId, mediaMsgs, onReply, onEdit, onDeleteForMe, onDeleteForEveryone, onOpenViewOnce, onOpenLightbox, onReact, onRetry, uploadPct, readReceipts }: {
  m: Message; isMe: boolean; replied: Message | null;
  contact: Contact; myId: string; mediaMsgs: Message[];
  onReply: () => void; onEdit: () => void;
  onDeleteForMe: () => void; onDeleteForEveryone: () => void;
  onReact?: (msgId: string, emoji: string) => void; onRetry?: () => void;
  onOpenViewOnce: () => void; onOpenLightbox: () => void;
  uploadPct?: number; readReceipts?: boolean;
}) {
  const [showMenu,    setShowMenu]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<"me" | "all" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, [showMenu]);

  const bubbleBg   = isMe ? "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)" : "var(--s1)";
  const bubbleText = isMe ? "white" : "var(--text-primary)";
  const br         = isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px";

  // Visualização única já aberta
  if (m.viewOnce && m.viewOnceOpened) {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} px-1`}>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs italic"
          style={{ background: isMe ? "#5B3FCF22" : "var(--s2)", color: "var(--text-muted)" }}>
          <EyeOff className="h-3.5 w-3.5" />
          <span>{isMe ? "Enviado" : "Visionado"} · ver uma vez</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} group px-1`}>
      <div className="max-w-[75%] relative">

        {/* Hover actions */}
        <div className={`absolute ${isMe ? "right-full mr-1" : "left-full ml-1"} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 z-10`}>
          <button onClick={onReply}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.12)", color: "var(--text-secondary)" }}>
            <Reply className="h-3.5 w-3.5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowMenu(v => !v)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.12)", color: "var(--text-secondary)" }}>
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {showMenu && (
              <div className={`absolute ${isMe ? "right-0" : "left-0"} bottom-full mb-1 rounded-2xl shadow-2xl z-30 overflow-hidden min-w-[190px] border`}
                style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

                {/* Reagir rápido */}
                <div className="flex items-center gap-1 px-3 py-2.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  {["❤️","🔥","😂","👍","😮","😢"].map(emoji => (
                    <button key={emoji} onClick={() => { onReact?.(m.id, emoji); setShowMenu(false); }}
                      className="text-xl transition active:scale-90 hover:scale-125 px-0.5">
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Responder */}
                <button onClick={() => { onReply(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition"
                  onMouseOver={e => e.currentTarget.style.background = "var(--s2)"}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <Reply className="h-4 w-4" style={{ color: "#5B3FCF" }} />
                  <span style={{ color: "var(--text-primary)" }}>Responder</span>
                </button>

                {/* Copiar texto */}
                {m.type === "text" && m.text && (
                  <button onClick={() => { navigator.clipboard?.writeText(m.text ?? ""); toast.success("Copiado!"); setShowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                    onMouseOver={e => e.currentTarget.style.background = "var(--s2)"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                    <Copy className="h-4 w-4" style={{ color: "#1FAFA6" }} />
                    <span style={{ color: "var(--text-primary)" }}>Copiar</span>
                  </button>
                )}

                {/* Encaminhar */}
                {m.mediaUrl && (
                  <button onClick={() => {
                    if (navigator.share && m.mediaUrl) {
                      navigator.share({ url: m.mediaUrl }).catch(() => {});
                    } else if (m.mediaUrl) {
                      navigator.clipboard?.writeText(m.mediaUrl).then(() => toast.success("Link copiado!"));
                    }
                    setShowMenu(false);
                  }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                    onMouseOver={e => e.currentTarget.style.background = "var(--s2)"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                    <Forward className="h-4 w-4" style={{ color: "#F26B3A" }} />
                    <span style={{ color: "var(--text-primary)" }}>Encaminhar</span>
                  </button>
                )}

                {/* Editar */}
                {isMe && m.type === "text" && (
                  <button onClick={() => { onEdit(); setShowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                    onMouseOver={e => e.currentTarget.style.background = "var(--s2)"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                    <Pencil className="h-4 w-4" style={{ color: "#5B3FCF" }} />
                    <span style={{ color: "var(--text-primary)" }}>Editar</span>
                  </button>
                )}

                {/* Eliminar */}
                <button onClick={() => { setConfirmDel("me"); setShowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onMouseOver={e => e.currentTarget.style.background = "var(--s2)"}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <Trash2 className="h-4 w-4" style={{ color: "#F97316" }} />
                  <span style={{ color: "var(--text-primary)" }}>Eliminar para mim</span>
                </button>
                {isMe && (
                  <button onClick={() => { setConfirmDel("all"); setShowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                    onMouseOver={e => e.currentTarget.style.background = "#fee2e2"}>
                    <Trash2 className="h-4 w-4" style={{ color: "#EF4444" }} />
                    <span style={{ color: "#EF4444" }}>Eliminar para todos</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bubble */}
        <div className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: bubbleBg, color: bubbleText, borderRadius: br }}>

          {/* Reply strip */}
          {replied && (
            <div className="px-3 pt-2 pb-0">
              <div className="px-2 py-1 rounded-lg text-xs"
                style={{ background: isMe ? "rgba(255,255,255,0.2)" : "var(--s3)", borderLeft: "3px solid " + (isMe ? "white" : "#5B3FCF") }}>
                <p className="font-bold mb-0.5" style={{ color: isMe ? "rgba(255,255,255,0.9)" : "#5B3FCF" }}>
                  {replied.senderId === myId ? "Tu" : contact.username}
                </p>
                <p className="truncate" style={{ color: isMe ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}>
                  {replied.type === "image" ? "📷 Imagem" : replied.type === "video" ? "🎥 Vídeo" : replied.type === "audio" ? "🎤 Áudio" : replied.text}
                </p>
              </div>
            </div>
          )}

          <div className="px-3 py-2">
            {/* Sticker */}
            {m.type === "sticker" && <p style={{ fontSize: 48, lineHeight: 1 }}>{m.text}</p>}

            {/* View-once button */}
            {m.viewOnce && !m.viewOnceOpened && (m.type === "image" || m.type === "video") && (
              <button onClick={onOpenViewOnce}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition active:scale-95"
                style={{ background: isMe ? "rgba(255,255,255,0.15)" : "#5B3FCF15", color: isMe ? "white" : "#5B3FCF" }}>
                <Eye className="h-5 w-5" />
                <span className="text-sm font-semibold">{m.type === "video" ? "Vídeo" : "Foto"} · Ver uma vez</span>
              </button>
            )}

            {/* Image */}
            {m.type === "image" && m.mediaUrl && !m.viewOnce && (
              <button type="button" className="block" onClick={onOpenLightbox}>
                {m.editState
                  ? <EditedMediaDisplay src={m.mediaUrl} type="image" edit={m.editState} maxH={280} />
                  : <img src={m.mediaUrl} alt="imagem" className="rounded-xl max-w-full" style={{ maxHeight: 220, objectFit: "cover" }} />}
              </button>
            )}

            {/* Video */}
            {m.type === "video" && m.mediaUrl && !m.viewOnce && (
              <div className="w-full max-w-xs">
                {m.editState
                  ? <EditedMediaDisplay src={m.mediaUrl} type="video" edit={m.editState} maxH={280} />
                  : <HoodaPlayer src={m.mediaUrl} rounded="rounded-xl" aspectRatio="16/9" />}
              </div>
            )}

            {/* Audio */}
            {m.type === "audio" && m.mediaUrl && <AudioMsg url={m.mediaUrl} isMe={isMe} knownDur={m.duration} />}

            {/* File */}
            {m.type === "file" && m.mediaUrl && (
              <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: isMe ? "rgba(255,255,255,0.2)" : "#5B3FCF" }}>
                  <FileText className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium truncate max-w-[140px]">{m.text}</span>
              </a>
            )}

            {/* Text */}
            {m.type === "text" && m.text && (
              <p className="break-words text-sm leading-relaxed">
                {m.text}
                {m.edited && <span className="text-[10px] ml-1.5 opacity-60">editado</span>}
              </p>
            )}

            {/* Time + ticks */}
            <div className="flex items-center justify-end gap-1 mt-1">
              <p className="text-[10px]" style={{ opacity: 0.65 }}>{m.time}</p>
              {isMe && (() => {
                const st = m.status;
                const ds = m.deliveryStatus;
                // read (azul duplo, só se confirmações ativas)
                if (st === "read" || ds === "read")
                  return <CheckCheck className="h-3.5 w-3.5" style={{ color: readReceipts !== false ? "#53BDEB" : (isMe ? "rgba(255,255,255,0.55)" : "#999") }} />;
                // delivered (cinza duplo)
                if (st === "delivered" || ds === "sent")
                  return <CheckCheck className="h-3.5 w-3.5" style={{ color: isMe ? "rgba(255,255,255,0.55)" : "#999" }} />;
                // sent (cinza simples)
                if (st === "sent" || ds === "sending")
                  return <Check className="h-3.5 w-3.5" style={{ color: isMe ? "rgba(255,255,255,0.55)" : "#999" }} />;
                // a enviar (relógio)
                return <Clock className="h-3 w-3" style={{ color: isMe ? "rgba(255,255,255,0.4)" : "#bbb" }} />;
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDel && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setConfirmDel(null)}>
          <div className="rounded-2xl p-5 mx-6 max-w-xs w-full shadow-2xl"
            style={{ background: "var(--s0)" }}
            onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
              {confirmDel === "all" ? "Eliminar para todos?" : "Eliminar para mim?"}
            </p>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              {confirmDel === "all" ? "A mensagem será removida para ambos." : "A mensagem desaparece só para ti."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
                Cancelar
              </button>
              <button onClick={() => { confirmDel === "all" ? onDeleteForEveryone() : onDeleteForMe(); setConfirmDel(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: confirmDel === "all" ? "#EF4444" : "#F97316" }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>,
        typeof document !== "undefined" ? document.body : ({} as Element)
      )}
    </div>
  );
}

// ── BgPickerModal — escolher fundo do chat ──
function BgPickerModal({ current, onPick, onClose }: {
  current: BgId;
  onPick: (id: BgId) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--bg-card,white)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border,#f0f0f0)" }}>
          <p className="font-extrabold text-base">Fundo do chat</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] dark:hover:bg-[var(--s3)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 grid grid-cols-4 gap-3 max-h-72 overflow-y-auto">
          {BG_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => onPick(opt.id as BgId)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className="w-14 h-14 rounded-2xl transition-all"
                style={{
                  background: opt.bg,
                  ...opt.style,
                  outline: current === opt.id ? "3px solid #5B3FCF" : "2px solid transparent",
                  outlineOffset: 2,
                  boxShadow: current === opt.id ? "0 0 0 4px #5B3FCF22" : undefined,
                }}
              />
              <span className="text-[10px] font-semibold text-center leading-tight"
                style={{ color: current === opt.id ? "#5B3FCF" : "var(--text-muted,#888)" }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// ChatPanel — E2EE + Realtime + Cache + Full features
// ─────────────────────────────────────────
function ChatPanel({ myId, contact, onBack }: {
  myId: string;
  contact: Contact;
  onBack: () => void;
}) {
  const { markMessagesRead } = useBadges();
  const queryClient = useQueryClient();

  // ── State ──
  const [input,        setInput]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [pickerTab,    setPickerTab]    = useState<"emoji"|"gif"|"sticker">("emoji");
  const [emojiSearch,  setEmojiSearch]  = useState("");
  const [gifSearch,    setGifSearch]    = useState("");
  const [emojiCat,     setEmojiCat]     = useState("freq");
  const [gifs,         setGifs]         = useState<{id:string;url:string}[]>([]);
  const [gifLoading,   setGifLoading]   = useState(false);
  const [showAttach,   setShowAttach]   = useState(false);
  const [replyTo,      setReplyTo]      = useState<Message|null>(null);
  const [showBgModal,  setShowBgModal]  = useState(false);
  const [bgId,         setBgId]         = useState<BgId>(() => {
    try {
      const saved = localStorage.getItem(`hooda_chat_bg_${contact.conversationId}`);
      if (saved && BG_OPTIONS.some(o => o.id === saved)) return saved as BgId;
    } catch {}
    return "default";
  });
  const [lightboxIndex,setLightboxIndex] = useState<number|null>(null);
  const [viewOnceModal, setViewOnceModal] = useState<{url: string; type: "image"|"video"; msgId: string}|null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [recording,    setRecording]    = useState(false);
  const [recordSecs,   setRecordSecs]   = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string; dur: number } | null>(null);
  const [trimStart,    setTrimStart]    = useState(0);   // 0-100 %
  const [trimEnd,      setTrimEnd]      = useState(100); // 0-100 %
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPos,   setPreviewPos]   = useState(0);   // 0-100 %
  const trimEndRef   = useRef<number>(100);
  const trimStartRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement|null>(null);
  const [waveform,     setWaveform]     = useState<number[]>([]);
  const [mediaSendQueue, setMediaSendQueue] = useState<{file:File;url:string;type:"image"|"video";edit:MediaEditState|null;caption:string}[]>([]);
  const [mediaQueueIdx,  setMediaQueueIdx]  = useState(0);
  const [showMediaPreview, setShowMediaPreview] = useState(false);

  // ── Chat menu (três pontos) ──
  const [showChatMenu,    setShowChatMenu]    = useState(false);
  const [chatConfirm,     setChatConfirm]     = useState<{ title: string; body: string; action: () => void } | null>(null);
  const [readReceipts,    setReadReceipts]    = useState(() => {
    try { return localStorage.getItem(`hooda_read_receipts_${contact.conversationId}`) !== "off"; } catch { return true; }
  });
  const [showLastSeen,    setShowLastSeen]    = useState(() => {
    try { return localStorage.getItem(`hooda_last_seen_${contact.conversationId}`) !== "off"; } catch { return true; }
  });
  const [mutedConv,       setMutedConv]       = useState(() => {
    try { return localStorage.getItem(`hooda_muted_${contact.conversationId}`) === "on"; } catch { return false; }
  });

  // ── Carregar estado real das preferências da DB ao montar ──
  useEffect(() => {
    if (!myId || !contact.conversationId) return;
    (async () => {
      try {
        const { data: profRows, error: profErr } = await (db as any).rpc("get_my_profile_private");
        const prof = profRows?.[0] ?? null;
        if (profErr) {
          console.error("[prefs] ERRO ao carregar perfil:", profErr.message);
        } else if (prof) {
          setReadReceipts(!prof.read_receipts_off);
          setShowLastSeen(!prof.hide_last_seen);
        }
        const { data: muted, error: mutedErr } = await db.from("muted_conversations")
          .select("muted")
          .eq("user_id", myId)
          .eq("conversation_id", contact.conversationId)
          .maybeSingle();
        if (mutedErr) {
          console.error("[prefs] ERRO muted_conversations:", mutedErr.message);
        } else if (muted) {
          setMutedConv(!!muted.muted);
        }
      } catch (e) {
        console.error("[prefs] Exceção ao carregar preferências:", e);
      }
    })();
  }, [myId, contact.conversationId]);

  async function toggleReadReceipts() {
    const next = !readReceipts;
    setReadReceipts(next);
    setShowChatMenu(false);
    try { localStorage.setItem(`hooda_read_receipts_${contact.conversationId}`, next ? "on" : "off"); } catch {}
    const { error } = await (db as any).from("profiles")
      .update({ read_receipts_off: !next })
      .eq("id", myId);
    if (error) {
      console.error("[prefs] toggleReadReceipts error:", error);
      toast.error("Erro ao guardar: " + error.message);
      setReadReceipts(!next);
      try { localStorage.setItem(`hooda_read_receipts_${contact.conversationId}`, (!next) ? "on" : "off"); } catch {}
    } else {
      toast(next ? "✓ Confirmações de leitura ativadas" : "✓ Confirmações de leitura desativadas");
    }
  }

  async function toggleLastSeen() {
    const next = !showLastSeen;
    setShowLastSeen(next);
    setShowChatMenu(false);
    try { localStorage.setItem(`hooda_last_seen_${contact.conversationId}`, next ? "on" : "off"); } catch {}
    const { error } = await (db as any).from("profiles")
      .update({ hide_last_seen: !next })
      .eq("id", myId);
    if (error) {
      console.error("[prefs] toggleLastSeen error:", error);
      toast.error("Erro ao guardar: " + error.message);
      setShowLastSeen(!next);
      try { localStorage.setItem(`hooda_last_seen_${contact.conversationId}`, (!next) ? "on" : "off"); } catch {}
    } else {
      toast(next ? "✓ Última vez ativo visível" : "✓ Última vez ativo oculta");
    }
  }

  async function toggleMute() {
    const next = !mutedConv;
    setMutedConv(next);
    setShowChatMenu(false);
    try {
      const { error } = await db.from("muted_conversations").upsert(
        { user_id: myId, conversation_id: contact.conversationId, muted: next },
        { onConflict: "user_id,conversation_id" }
      );
      if (error) {
        console.error("[toggleMute] erro:", error.message);
        toast.error("Erro ao guardar: " + error.message);
        setMutedConv(!next);
      } else {
        try { localStorage.setItem(`hooda_muted_${contact.conversationId}`, next ? "on" : "off"); } catch {}
        toast(next ? "🔕 Conversa silenciada" : "🔔 Notificações ativadas");
      }
    } catch (e: any) {
      console.error("[toggleMute] exceção:", e);
      toast.error("Erro inesperado: " + (e?.message ?? e));
      setMutedConv(!next);
    }
  }

  // ── Reações reais (DB) ──
  async function handleReact(msgId: string, emoji: string) {
    if (!myId) return;
    try {
      const { data: existing } = await (db as any)
        .from("message_reactions")
        .select("id,emoji")
        .eq("message_id", msgId)
        .eq("user_id", myId)
        .maybeSingle();
      if (existing) {
        if (existing.emoji === emoji) {
          // toggle off
          await (db as any).from("message_reactions").delete().eq("id", existing.id);
          setMsgs(prev => prev.map(m => {
            if (m.id !== msgId) return m;
            const r = { ...(m.reactions ?? {}) };
            r[emoji] = Math.max(0, (r[emoji] ?? 1) - 1);
            if (r[emoji] === 0) delete r[emoji];
            return { ...m, reactions: r, myReaction: undefined };
          }));
        } else {
          // mudar emoji
          await (db as any).from("message_reactions").update({ emoji }).eq("id", existing.id);
          setMsgs(prev => prev.map(m => {
            if (m.id !== msgId) return m;
            const r = { ...(m.reactions ?? {}) };
            r[existing.emoji] = Math.max(0, (r[existing.emoji] ?? 1) - 1);
            if (r[existing.emoji] === 0) delete r[existing.emoji];
            r[emoji] = (r[emoji] ?? 0) + 1;
            return { ...m, reactions: r, myReaction: emoji };
          }));
        }
      } else {
        await (db as any).from("message_reactions").insert({ message_id: msgId, user_id: myId, emoji });
        setMsgs(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          const r = { ...(m.reactions ?? {}) };
          r[emoji] = (r[emoji] ?? 0) + 1;
          return { ...m, reactions: r, myReaction: emoji };
        }));
      }
    } catch (e) {
      console.error("[react] erro:", e);
      toast.error("Erro ao reagir");
    }
  }


  function clearConversation() {
    setShowChatMenu(false);
    setChatConfirm({
      title: "Limpar conversa",
      body: "Todas as mensagens serão apagadas para ti localmente. Esta ação não pode ser desfeita.",
      action: async () => {
        setChatConfirm(null);
        // Apagar as minhas mensagens da DB (RLS impede apagar as do outro)
        await db.from("messages")
          .delete()
          .eq("conversation_id", contact.conversationId)
          .eq("sender_id", myId);
        // Limpar visualmente TUDO (cache + state)
        setMsgs([]);
        try { localStorage.removeItem(CACHE_KEY); } catch {}
        toast("✓ Conversa limpa");
      },
    });
  }

  function blockUser() {
    setShowChatMenu(false);
    setChatConfirm({
      title: `Bloquear @${contact.username}?`,
      body: `@${contact.username} não poderá enviar-te mensagens nem ver o teu perfil.`,
      action: async () => {
        setChatConfirm(null);
        const { error } = await db.from("blocked_users").upsert(
          { blocker_id: myId, blocked_id: contact.id },
          { onConflict: "blocker_id,blocked_id" }
        );
        if (error) { toast.error("Erro ao bloquear: " + error.message); return; }
        setIsBlocked(true);
        toast.success(`🚫 @${contact.username} bloqueado`);
      },
    });
  }

  function unblockUser() {
    setShowChatMenu(false);
    setChatConfirm({
      title: `Desbloquear @${contact.username}?`,
      body: `@${contact.username} voltará a poder enviar-te mensagens.`,
      action: async () => {
        setChatConfirm(null);
        const { error } = await db.from("blocked_users")
          .delete().eq("blocker_id", myId).eq("blocked_id", contact.id);
        if (error) { toast.error("Erro ao desbloquear: " + error.message); return; }
        setIsBlocked(false);
        toast.success(`✓ @${contact.username} desbloqueado`);
      },
    });
  }

  const [isBlocked, setIsBlocked] = useState(false);
  const [iAmBlockedBy, setIAmBlockedBy] = useState(false);
  const [msgPermBlocked, setMsgPermBlocked] = useState(false);
  const [msgPermReason, setMsgPermReason] = useState("");

  // Verificar msg_permission do contacto
  useEffect(() => {
    if (!myId || !contact.id) return;
    (async () => {
      const { data: prof } = await db.from("profiles").select("msg_permission").eq("id", contact.id).maybeSingle();
      const perm = (prof as any)?.msg_permission ?? "todos";
      if (perm === "todos") { setMsgPermBlocked(false); return; }
      if (perm === "aprovados") {
        setMsgPermBlocked(true);
        setMsgPermReason(`@${contact.username} só aceita mensagens de utilizadores aprovados.`);
        return;
      }
      if (perm === "seguidores") {
        // Verificar se o contacto me segue
        const { data: follows } = await db.from("follows").select("id")
          .eq("follower_id", contact.id).eq("following_id", myId).maybeSingle();
        if (!follows) {
          setMsgPermBlocked(true);
          setMsgPermReason(`@${contact.username} só aceita mensagens de seguidores.`);
        } else {
          setMsgPermBlocked(false);
        }
        return;
      }
      if (perm === "mutuos") {
        const [{ data: iFollow }, { data: theyFollow }] = await Promise.all([
          db.from("follows").select("id").eq("follower_id", myId).eq("following_id", contact.id).maybeSingle(),
          db.from("follows").select("id").eq("follower_id", contact.id).eq("following_id", myId).maybeSingle(),
        ]);
        if (!iFollow || !theyFollow) {
          setMsgPermBlocked(true);
          setMsgPermReason(`@${contact.username} só aceita mensagens de utilizadores com seguimento mútuo.`);
        } else {
          setMsgPermBlocked(false);
        }
      }
    })();
  }, [myId, contact.id, contact.username]);

  // Verificar bloqueios (eu→contacto e contacto→eu) ao montar + tempo real
  useEffect(() => {
    if (!myId || !contact.id) return;
    db.from("blocked_users")
      .select("blocker_id").eq("blocker_id", myId).eq("blocked_id", contact.id).maybeSingle()
      .then((res: any) => setIsBlocked(!!res.data));
    db.from("blocked_users")
      .select("blocker_id").eq("blocker_id", contact.id).eq("blocked_id", myId).maybeSingle()
      .then((res: any) => setIAmBlockedBy(!!res.data));

    // Realtime: ouvir alterações de bloqueio em ambos os sentidos
    const chName = `blocks-${myId}-${contact.id}`;
    // Remover canal anterior se existir (evita erro "cannot add callbacks after subscribe")
    const existing = (db as any).getChannels?.().find?.((c: any) => c.topic === `realtime:${chName}`);
    if (existing) db.removeChannel(existing);
    const ch = db.channel(chName)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "blocked_users", filter: `blocker_id=eq.${myId}` },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          // eu bloqueei o contacto (ou desbloqueei)
          if (row.blocker_id === myId && row.blocked_id === contact.id) {
            setIsBlocked(payload.eventType !== "DELETE");
          }
          // o contacto bloqueou-me (ou desbloqueou)
          if (row.blocker_id === contact.id && row.blocked_id === myId) {
            const nowBlocked = payload.eventType !== "DELETE";
            setIAmBlockedBy(nowBlocked);
            if (nowBlocked) {
              toast.error(`Foste bloqueado por @${contact.username}. Já não podes enviar mensagens.`);
            } else {
              toast.success(`@${contact.username} desbloqueou-te.`);
            }
          }
        })
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [myId, contact.id, contact.username]);


  // ── Edit / Delete / ViewOnce ──
  const [editingMsgId,   setEditingMsgId]   = useState<string|null>(null);
  const [editingText,    setEditingText]    = useState("");
  const [localOverrides, setLocalOverrides] = useState<Record<string,Partial<Message>>>({});

  // ── E2EE ──

  // ── Refs ──
  const bottomRef     = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const recordTimerRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const recordSecsLive   = useRef<number>(0); // duração real sem depender de setState async
  const imgInputRef   = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const atBottom      = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [contactTyping, setContactTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastChRef = useRef<any>(null);
  const realtimeDmSeqRef = useRef(0);

  // ── Msgs com cache local ──
  const CACHE_KEY = `hooda_dm_${contact.conversationId}`;
  const [msgs, setMsgs] = useState<Message[]>(() => {
    try {
      if (typeof window === "undefined") return [];
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const parsed: Message[] = JSON.parse(raw);
      // Limpar mensagens corrompidas com ciphertext antigo
      return parsed.filter(m => !m.text?.startsWith("e2ee:"));
    } catch { return []; }
  });

  function saveCache(messages: Message[]) {
    try {
      if (typeof window === "undefined") return;
      // Não guardar mensagens temporárias nem com ciphertext
      const clean = messages
        .filter(m => !m.id.startsWith("temp-") && !m.text?.startsWith("e2ee:"))
        .slice(-200);
      localStorage.setItem(CACHE_KEY, JSON.stringify(clean));
    } catch {}
  }

  // ── E2EE desactivado para DMs ──
  // A chave AES era gerada localmente e nunca partilhada com o outro
  // utilizador — o destinatário nunca conseguia decifrar. Protecção
  // feita pela RLS do Supabase (só participantes lêem a conversa).
  const encrypt = useCallback(async (text: string): Promise<string> => text, []);

  const decrypt = useCallback(async (content: string): Promise<string> => {
    // Mensagens antigas encriptadas localmente: mostrar indicador visual
    if (isEncrypted(content)) return "🔒 Mensagem (dispositivo anterior)";
    return content;
  }, []);

  // ── Parse raw row → Message ──
  const parseRow = useCallback(async (r: any): Promise<Message> => {
    const mt = (r.message_type || r.media_type) as MsgType | undefined;
    // Detectar tipo pelo path da media_url se message_type não existir
    const type: MsgType = mt ?? (
      r.media_url
        ? (r.media_url.includes("/audio/") ? "audio"
          : r.media_url.includes("/videos/") ? "video"
          : r.media_url.includes("/files/") ? "file"
          : "image")
        : "text"
    );
    // Só desencriptar texto puro — emojis e conteúdo não encriptado passam direto
    const rawContent = r.content ?? "";
    const isEncryptedContent = rawContent.startsWith("e2ee:");
    const decrypted = isEncryptedContent ? await decrypt(rawContent) : rawContent;
    const text = type === "text" ? decrypted : "";
    return {
      id:             r.id,
      senderId:       r.sender_id,
      text,
      time:           new Date(r.created_at).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}),
      status:         r.status ?? "sent",
      type,
      mediaUrl:       r.media_url ?? undefined,
      replyTo:        r.reply_to ?? r.reply_to_id ?? undefined,
      edited:         !!r.edited_at,
      viewOnce:       !!r.view_once,
      viewOnceOpened: (() => {
        if (r.view_once_opened_by?.includes(myId)) return true;
        try {
          const key = `hooda_vo_fallback_${myId}`;
          const local: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
          return local.includes(r.id);
        } catch { return false; }
      })(),
      deliveryStatus: r.status === "read" ? "read" : "sent",
      duration: r.duration ?? undefined,
      reactions: r.reactions ?? {},
      myReaction: (r.reactions ?? {})[myId] ?? undefined,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, decrypt]);

  // ── Load msgs from Supabase ──
  const loadMsgs = useCallback(async () => {
    if (!contact.conversationId) return;

    // ── DIAGNÓSTICO: testar sessão e participação ──
    const { data: sessionData } = await supabase.auth.getSession();
    console.log("[DIAG] session uid:", sessionData?.session?.user?.id);
    console.log("[DIAG] myId:", myId);
    console.log("[DIAG] conversationId:", contact.conversationId);

    const { data: partCheck, error: partErr } = await db
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", contact.conversationId)
      .eq("user_id", myId);
    console.log("[DIAG] sou participante:", partCheck, "err:", partErr);

    const { data, error } = await db.from("messages")
      .select("*")
      .eq("conversation_id", contact.conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[loadMsgs] Erro Supabase:", JSON.stringify(error));
      toast.error("Erro ao carregar: " + error.message);
      return;
    }
    console.log("[loadMsgs] Rows recebidos:", data?.length ?? 0);
    if (data?.length) console.log("[loadMsgs] Primeira row:", JSON.stringify(data[0]));
    if (!data) return;

    // Carregar reações para todas as mensagens desta conversa
    const msgIds = data.map((r: any) => r.id);
    let reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
    if (msgIds.length > 0) {
      const { data: rxData } = await (db as any).from("message_reactions")
        .select("message_id,emoji,user_id")
        .in("message_id", msgIds);
      for (const rx of rxData ?? []) {
        if (!reactionsMap[rx.message_id]) reactionsMap[rx.message_id] = [];
        reactionsMap[rx.message_id].push(rx);
      }
    }
    // Enriquecer rows com reactions antes de parseRow
    const enriched = data.map((r: any) => {
      const rxList = reactionsMap[r.id] ?? [];
      const counts: Record<string, number> = {};
      for (const rx of rxList) counts[rx.emoji] = (counts[rx.emoji] ?? 0) + 1;
      const myRx = rxList.find((rx: any) => rx.user_id === myId);
      return { ...r, reactions: counts, myReaction: myRx?.emoji };
    });
    const parsed = await Promise.all(enriched.map(parseRow));
    // Filtrar localmente as apagadas para todos (caso a RLS ainda não esteja actualizada)
    const visible = parsed.filter((m: any) => !m.deletedForAll);
    setMsgs(visible);
    saveCache(visible);
    // marcar como lido
    await db.from("messages")
      .update({ status: "read" })
      .eq("conversation_id", contact.conversationId)
      .neq("sender_id", myId)
      .neq("status", "read");
    markMessagesRead(contact.conversationId);
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations(myId) });
  }, [contact.conversationId, myId, markMessagesRead, queryClient, parseRow]);

  // ── Realtime: INSERT + UPDATE + DELETE ──
  useEffect(() => {
    if (!contact.conversationId) return;
    loadMsgs();

    const channelName = `dm-${contact.conversationId}-${myId ?? "anon"}-${++realtimeDmSeqRef.current}`;
    let ch: ReturnType<typeof db.channel> | null = null;

    try {
      ch = db.channel(channelName)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${contact.conversationId}` },
          async (payload: any) => {
            const m = await parseRow(payload.new);
            setMsgs(prev => {
              // já existe com o id real → nada a fazer
              if (prev.some(x => x.id === m.id)) return prev;
              // tentar fazer match com um optimistic temp do mesmo sender+tipo, próximo no tempo
              const tempMatch = prev.find(x =>
                x.id.startsWith("temp-") &&
                x.senderId === m.senderId &&
                x.type === m.type &&
                Math.abs(new Date(m.time).getTime() - new Date(x.time).getTime()) < 10000
              );
              if (tempMatch) {
                const n = prev.map(x => x.id === tempMatch.id ? { ...x, id: m.id, deliveryStatus: "sent" as const } : x);
                saveCache(n);
                return n;
              }
              const next = [...prev, m];
              saveCache(next);
              return next;
            });
            // marcar como lido imediatamente se sou o destinatário
            if (payload.new.sender_id !== myId) {
              db.from("messages").update({ status: "read" }).eq("id", payload.new.id).then(() => {});
              markMessagesRead(contact.conversationId!);
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations(myId) });
              // Som de notificação
              playMsgSound();
            }
            if (atBottom.current) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          }
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${contact.conversationId}` },
          async (payload: any) => {
            if (payload.new.deleted_for_all) {
              setMsgs(prev => { const n = prev.filter(x => x.id !== payload.new.id); saveCache(n); return n; });
              return;
            }
            const newStatus = payload.new.status as string;
            setMsgs(prev => {
              const n = prev.map(x => x.id === payload.new.id
                ? { ...x, status: newStatus, deliveryStatus: newStatus === "read" ? "read" as const : "sent" as const }
                : x
              );
              saveCache(n); return n;
            });
          }
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${contact.conversationId}` },
          (payload: any) => {
            setMsgs(prev => { const n = prev.filter(x => x.id !== payload.old.id); saveCache(n); return n; });
          }
        )
        .subscribe((status: string, err?: Error) => {
          if (err) console.error(`[realtime dm] erro:`, err);
          else console.log(`[realtime dm] status:`, status);
        });
    } catch (error) {
      console.error("[realtime dm] falha ao iniciar canal:", error);
    }

    return () => {
      if (ch) db.removeChannel(ch);
    };
  }, [contact.conversationId, myId]);

  // ── Mobile: ao voltar a focar o separador, refrescar mensagens ──
  // (Browsers móveis suspendem o WebSocket quando a app vai para background.)
  useEffect(() => {
    if (!contact.conversationId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadMsgs();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [contact.conversationId, loadMsgs]);

  // ── Limpar badge imediatamente ao abrir a conversa ──
  useEffect(() => {
    if (!contact.conversationId) return;
    markMessagesRead(contact.conversationId);
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations(myId) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.conversationId]);

  const chatMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showChatMenu) return;
    const fn = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) setShowChatMenu(false);
    };
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, [showChatMenu]);

  // ── Broadcast: presença + "está a escrever" ──
  useEffect(() => {
    if (!contact.conversationId || !myId) return;
    const typingChName = `typing-${contact.conversationId}`;
    const existingTyping = (db as any).getChannels?.().find?.((c: any) => c.topic === `realtime:${typingChName}`);
    if (existingTyping) db.removeChannel(existingTyping);
    const ch = db.channel(typingChName, {
      config: { broadcast: { self: false } },
    });
    broadcastChRef.current = ch;
    ch.on("broadcast", { event: "typing" }, (payload: any) => {
      if (payload.payload?.userId === contact.id) {
        setContactTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setContactTyping(false), 3000);
      }
    }).subscribe();
    return () => {
      try { db.removeChannel(ch); } catch {}
      broadcastChRef.current = null;
    };
  }, [contact.conversationId, contact.id, myId]);

  // ── Scroll auto ao fundo ──
  useEffect(() => {
    if (atBottom.current) bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [msgs.length]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottom.current = isAtBottom;
    setShowScrollBtn(!isAtBottom);
  }

  // ── Patch local (deletedForMe, viewOnceOpened, edited) ──
  function patchMsg(id: string, patch: Partial<Message>) {
    setLocalOverrides(p => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
  }

  // ── Eliminar para mim ──
  function deleteForMe(id: string) {
    patchMsg(id, { deletedForMe: true });
    toast.success("Mensagem eliminada para ti");
  }

  // ── Eliminar para todos ──
  async function deleteForEveryone(id: string) {
    setMsgs(prev => { const n = prev.filter(x => x.id !== id); saveCache(n); return n; });
    toast.success("Mensagem eliminada para todos");
    await db.from("messages").update({ deleted_for_all: true }).eq("id", id);
  }

  // ── Editar mensagem ──
  function startEdit(m: Message) { setEditingMsgId(m.id); setEditingText(m.text); }
  async function confirmEdit() {
    if (!editingMsgId) return;
    const t = editingText.trim(); if (!t) return;
    patchMsg(editingMsgId, { text: t, edited: true });
    setEditingMsgId(null);
    const encrypted = await encrypt(t);
    await db.from("messages").update({ content: encrypted, edited_at: new Date().toISOString() }).eq("id", editingMsgId);
  }

  // ── Visualização única ──
  function openViewOnce(id: string) {
    // Encontrar a mensagem para abrir o modal antes de marcar como vista
    const msg = msgs.find(m => m.id === id);
    if (msg && msg.mediaUrl && !msg.viewOnceOpened) {
      setViewOnceModal({ url: msg.mediaUrl, type: msg.type as "image"|"video", msgId: id });
    }
  }

  // ── Upload com progresso real (Cloudinary) ──
  async function uploadFile(file: File, folder: string): Promise<string|null> {
    setUploading(true); setUploadPct(5);
    try {
      // folder define o tipo: "audio" e "video" → resource_type=video; "images" → image
      const isImage = folder === "images" || file.type.startsWith("image/");
      const resourceType: "image" | "video" = isImage ? "image" : "video";
      const cloudFolder = `hooda/messages/${folder}/${myId}`;

      let url: string;
      if (isImage) {
        const r = await uploadImageToCloudinary(file, cloudFolder, pct => setUploadPct(Math.max(5, pct)));
        url = r.url;
      } else {
        url = await cloudinaryUploadMedia(file, resourceType, cloudFolder, pct => setUploadPct(Math.max(5, pct)));
      }
      console.log("[uploadFile] ✅ Cloudinary URL:", url);
      setUploadPct(100);
      setTimeout(() => { setUploading(false); setUploadPct(0); }, 400);
      return url;
    } catch (err: any) {
      console.error("[uploadFile] erro:", err);
      toast.error("Erro no upload: " + (err?.message ?? "desconhecido"));
      setUploading(false); setUploadPct(0);
      return null;
    }
  }

  // ── Send ──
  async function send(
    text = input,
    type: MsgType = "text",
    mediaUrl?: string,
    replyToId?: string,
    duration?: number,
    viewOnce = false,
  ) {
    if (sending || uploading) return;
    if (isBlocked) { toast.error(`Desbloqueia @${contact.username} para enviar mensagens.`); return; }
    if (iAmBlockedBy) { toast.error("Não é possível enviar mensagens a este utilizador."); return; }
    if (msgPermBlocked) { toast.error(msgPermReason); return; }
    const t = text.trim();
    if (!t && !mediaUrl) return;
    setSending(true);

    // Optimistic local msg
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localMsg: Message = {
      id: tempId, senderId: myId, text: t, type,
      mediaUrl, duration, time: new Date().toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}),
      status: "sent", replyTo: replyToId ?? replyTo?.id,
      deliveryStatus: "sending", viewOnce,
    };
    setMsgs(prev => { const n = [...prev, localMsg]; saveCache(n); return n; });
    setInput(""); setReplyTo(null); setShowEmoji(false); setShowAttach(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const encrypted = type === "text" ? await encrypt(t) : (t ? await encrypt(t) : "");
      // Verificar participação antes de inserir
      const { data: myPart, error: partErr } = await db
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", contact.conversationId)
        .eq("user_id", myId)
        .maybeSingle();
      console.log("[send] Sou participante:", myPart, "err:", partErr);

      const { data, error } = await db.from("messages").insert({
        conversation_id: contact.conversationId,
        sender_id: myId,
        receiver_id: contact.id,
        content: encrypted || t || "📎",
        status: "sent",
        media_url: mediaUrl ?? null,
        message_type: type,
        reply_to: replyToId ?? replyTo?.id ?? null,
        view_once: viewOnce,
        duration: duration ?? null,
      }).select("id").single();

      if (error) {
        console.error("[send] ERRO INSERT:", error.code, error.message, error.details, error.hint);
        toast.error("Erro " + error.code + ": " + error.message);
        throw error;
      }
      console.log("[send] ✅ Inserido id:", data.id);
      // replace temp with real id
      setMsgs(prev => {
        const n = prev.map(x => x.id === tempId ? { ...x, id: data.id, deliveryStatus: "sent" as const } : x);
        saveCache(n); return n;
      });
      // mark delivered after 1s
      setTimeout(() => {
        db.from("messages").update({ status: "delivered" }).eq("id", data.id).then(() => {});
      }, 1000);
    } catch (e) {
      console.error("[send] Erro ao enviar mensagem:", e);
      patchMsg(tempId, { deliveryStatus: "sending", status: "failed" } as any);
      const errMsg = (e as any)?.message || (e as any)?.details || "Falha ao enviar mensagem";
      toast.error(errMsg);
    }
    setSending(false);
  }

  // ── Retry failed ──
  async function retryMsg(m: Message) {
    setMsgs(prev => { const n = prev.filter(x => x.id !== m.id); saveCache(n); return n; });
    await send(m.text, m.type, m.mediaUrl, m.replyTo);
  }

  // ── View once send ──
  async function sendViewOnce(file: File, type: "image"|"video") {
    setShowAttach(false);
    const url = await uploadFile(file, type === "image" ? "images" : "videos");
    if (url) await send("", type, url, undefined, undefined, true);
  }

  // ── Media queue ──
  function openMediaQueue(files: FileList, type: "image"|"video") {
    const items = Array.from(files).map(f => ({ file: f, url: URL.createObjectURL(f), type, edit: null, caption: "" }));
    setMediaSendQueue(items); setMediaQueueIdx(0); setShowMediaPreview(true);
  }

  // Aplana edições (filtros, brilho, textos, stickers) numa imagem usando Canvas
  // e devolve um novo File com as edições "queimadas" nos pixels — para upload real.
  async function flattenImageEdit(src: string, edit: import("@/components/MediaEditor").MediaEditState): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas não suportado")); return; }

        // Aplicar filtros CSS via filter
        const { EDITOR_FILTERS } = await import("@/components/MediaEditor").then(m => m).catch(() => ({ EDITOR_FILTERS: [] as any[] }));
        const filterCss = (() => {
          const base = (EDITOR_FILTERS as any[])[edit.filterIdx]?.css ?? "none";
          const parts: string[] = [];
          if (edit.brightness !== 100) parts.push(`brightness(${edit.brightness}%)`);
          if (edit.contrast !== 100)   parts.push(`contrast(${edit.contrast}%)`);
          if (edit.saturation !== 100) parts.push(`saturate(${edit.saturation}%)`);
          if (edit.exposure !== 0)     parts.push(`brightness(${100 + edit.exposure / 2}%)`);
          if (edit.temperature !== 0)  parts.push(`hue-rotate(${edit.temperature}deg)`);
          const adj = parts.join(" ");
          if (base === "none" && !adj) return "none";
          if (base === "none") return adj;
          if (!adj) return base;
          return `${base} ${adj}`;
        })();

        if (filterCss && filterCss !== "none") ctx.filter = filterCss;
        ctx.drawImage(img, 0, 0);
        ctx.filter = "none";

        // Vinheta
        if (edit.vignette > 0) {
          const grad = ctx.createRadialGradient(
            canvas.width/2, canvas.height/2, canvas.width*0.3,
            canvas.width/2, canvas.height/2, canvas.width*0.8
          );
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(0,0,0,${edit.vignette/100})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Textos
        for (const t of edit.texts) {
          ctx.save();
          ctx.font = `${t.bold?"bold ":""}${t.italic?"italic ":""}${t.sizePx * (canvas.width/400)}px ${t.fontCss}`;
          ctx.fillStyle = t.color;
          ctx.textAlign = t.align;
          if (t.shadow) ctx.shadowColor = "rgba(0,0,0,0.9)", ctx.shadowBlur = 8;
          const x = (t.x / 100) * canvas.width;
          const y = (t.y / 100) * canvas.height;
          ctx.fillText(t.text, x, y);
          ctx.restore();
        }

        // Stickers
        const stickerPromises = edit.stickers.map(s => new Promise<void>(res => {
          const x = (s.x / 100) * canvas.width;
          const y = (s.y / 100) * canvas.height;
          const sz = s.sizePx * (canvas.width / 400);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((s.rotation * Math.PI) / 180);
          ctx.font = `${sz}px serif`;
          ctx.fillText(s.emoji, 0, 0);
          ctx.restore();
          res();
        }));
        Promise.all(stickerPromises).then(() => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error("Canvas toBlob falhou")); return; }
            resolve(new File([blob], "imagem_editada.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.92);
        });
      };
      img.onerror = () => reject(new Error("Falha ao carregar imagem para edição"));
      img.src = src;
    });
  }

  async function confirmCurrentMedia() {
    const item = mediaSendQueue[mediaQueueIdx];
    if (!item) return;

    let fileToUpload = item.file;

    // Se há edições numa imagem, aplana-as no Canvas antes de fazer upload
    if (item.type === "image" && item.edit) {
      try {
        fileToUpload = await flattenImageEdit(item.url, item.edit);
      } catch (err) {
        console.warn("[MediaPreview] falha ao aplanar edições, envia original:", err);
        // Fallback: envia ficheiro original mas guarda editState como metadado
      }
    }

    const url = await uploadFile(fileToUpload, item.type === "image" ? "images" : "videos");
    // Para vídeo, editState é guardado como metadado (filtros aplicados via CSS na visualização)
    // Para imagem com Canvas flatten, editState é null (edições já estão nos pixels)
    const editMeta = item.type === "video" ? item.edit : null;
    if (url) await send(item.caption, item.type, url, undefined, undefined);

    const nextIdx = mediaQueueIdx + 1;
    if (nextIdx < mediaSendQueue.length) { setMediaQueueIdx(nextIdx); }
    else { setMediaSendQueue([]); setMediaQueueIdx(0); setShowMediaPreview(false); }
  }

  // ── GIF search ──
  useEffect(() => {
    if (!gifSearch || pickerTab !== "gif") return;
    const t = setTimeout(async () => {
      setGifLoading(true);
      try {
        const r = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifSearch)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCFY&limit=20&media_filter=gif`);
        const j = await r.json();
        setGifs((j.results ?? []).map((x: any) => ({ id: x.id, url: x.media_formats?.gif?.url ?? "" })));
      } catch { setGifs([]); }
      setGifLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [gifSearch, pickerTab]);

  // ── Recording ──
  async function startRecording() {
    if (recording) return; // evitar double-start
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      // Ordem de preferência: mp4/aac funciona em iOS/Safari, webm funciona em Chrome/Firefox
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus"
        : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      let recordSecsAtStop = 0;
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        // usar o ref síncrono — setState é async e chegaria sempre a 0
        recordSecsAtStop = recordSecsLive.current;
        setRecordSecs(0);
        recordSecsLive.current = 0;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 500) { toast.error("Gravação muito curta"); return; }
        const blobUrl = URL.createObjectURL(blob);
        // Usar recordSecs como duração real — metadata do WebM gravado ao vivo
        // devolve Infinity ou NaN na maioria dos browsers
        const realDur = recordSecsAtStop > 0 ? recordSecsAtStop : 1;
        setAudioPreview({ blob, url: blobUrl, dur: realDur });
        setTrimStart(0); setTrimEnd(100);
        trimStartRef.current = 0; trimEndRef.current = 100;
        setPreviewPos(0); setPreviewPlaying(false);
        setWaveform(Array.from({ length: 40 }, (_, i) => {
          const bell = Math.sin((i / 39) * Math.PI) * 45;
          return Math.max(10, Math.min(90, 22 + bell + ((i * 37) % 30)));
        }));
      };

      // timeslice de 250ms — garante que todos os chunks são capturados
      mr.start(250);
      setRecording(true);
      setRecordSecs(0);
      recordSecsLive.current = 0;
      recordTimerRef.current = setInterval(() => {
        recordSecsLive.current += 1;
        setRecordSecs(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error("[recording]", err);
      toast.error("Não foi possível aceder ao microfone");
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mr.stop(); // com timeslice ativo, onstop recebe os dados todos automaticamente
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }

  function cancelRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordSecsLive.current = 0;
    audioChunksRef.current = [];
    mediaRecorderRef.current?.stop();
    setAudioPreview(null);
    setRecording(false); setRecordSecs(0);
  }

  function discardPreview() {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (audioPreview?.url) URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null); setPreviewPlaying(false); setPreviewPos(0);
  }

  function togglePreviewPlay() {
    if (!audioPreview) return;
    if (!previewAudioRef.current) {
      const a = new Audio(audioPreview.url);
      previewAudioRef.current = a;
      a.currentTime = audioPreview.dur * (trimStartRef.current / 100);
      a.ontimeupdate = () => {
        const pct = a.currentTime / audioPreview.dur * 100;
        console.log("pct:", pct.toFixed(2), "| trimEnd:", trimEndRef.current);
        setPreviewPos(pct);
        if (pct >= trimEndRef.current) {
          a.pause();
          setPreviewPlaying(false);
          setPreviewPos(trimStartRef.current);
        }
      };
      a.onended = () => { setPreviewPlaying(false); setPreviewPos(trimStart); };
    }
    if (previewPlaying) {
      previewAudioRef.current.pause(); setPreviewPlaying(false);
    } else {
      const a = previewAudioRef.current;
      const startPct = trimStartRef.current / 100;
      if (previewPos < trimStartRef.current || previewPos > trimEndRef.current) {
        a.currentTime = audioPreview.dur * startPct;
      }
      a.play().catch((err) => {
        console.error("Erro ao reproduzir áudio:", err);
        toast.error("Não foi possível reproduzir o áudio");
        setPreviewPlaying(false);
      }); setPreviewPlaying(true);
    }
  }

  async function sendAudioPreview() {
    if (!audioPreview) return;
    // Usar o tipo MIME real do blob gravado (webm, ogg, etc.)
    const blobType = audioPreview.blob.type || "audio/webm";
    const ext = blobType.includes("ogg") ? "ogg" : blobType.includes("mp4") ? "m4a" : blobType.includes("webm") ? "webm" : "m4a";
    console.log("audioPreview.blob:", audioPreview.blob);
    console.log("blob.size:", audioPreview.blob.size, "| blob.type:", audioPreview.blob.type);
    if (audioPreview.blob.size === 0) {
      toast.error("Áudio vazio — tenta gravar de novo");
      return;
    }
    const file = new File([audioPreview.blob], `audio-${Date.now()}.${ext}`, { type: blobType });
    const dur = audioPreview.dur;
    const url = await uploadFile(file, "audio");
    console.log("URL do áudio após upload:", url);
    if (!url) {
      toast.error("Falha no upload — áudio não foi enviado");
      return;
    }
    discardPreview();
    await send("🎤 Áudio", "audio", url, undefined, dur);
  }

  // ── Media msgs for lightbox ──
  const mediaMsgs = useMemo(() =>
    msgs.filter(m => (m.type === "image" || m.type === "video") && !m.viewOnce),
  [msgs]);

  const msgRef = (m: Message) => msgs.find(x => x.id === m.replyTo);
  const fmtSecs = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div className="flex flex-col h-full" style={{ background: CHAT_BACKGROUNDS[bgId] ?? "var(--s1)" }}>

      {/* ── HEADER estilo WhatsApp com cores hooda ── */}
      <div className="flex items-center gap-3 px-3 py-2.5 shrink-0 z-10"
        style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)", boxShadow: "0 2px 12px rgba(91,63,207,0.3)" }}>
        <button onClick={onBack} className="lg:hidden p-1.5 rounded-full transition active:scale-90"
          style={{ background: "rgba(255,255,255,0.15)" }}>
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
        {/* Avatar com anel branco */}
        <div className="rounded-full p-[2px] shrink-0" style={{ background: "rgba(255,255,255,0.3)" }}>
          <div className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold"
            style={{ background: colorFor(contact.username ?? "") }}>
            {contact.avatar_url
              ? <img src={contact.avatar_url} alt="" className="w-full h-full object-cover" />
              : (contact.full_name?.[0] ?? contact.username?.[0] ?? "?").toUpperCase()}
          </div>
        </div>
        <div className="flex-1 min-w-0 cursor-pointer">
          <p className="text-sm font-bold text-white truncate leading-tight">
            {contact.full_name || contact.username}
          </p>
          <p className="text-[11px] text-white/70">@{contact.username}</p>
        </div>
        <button onClick={() => setShowBgModal(true)} title="Mudar fundo"
          className="p-2 rounded-full transition active:scale-90"
          style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
          <Wand2 className="h-4 w-4" />
        </button>
        <div className="relative" ref={chatMenuRef}>
          <button onClick={() => setShowChatMenu(p => !p)}
            className="p-2 rounded-full transition active:scale-90"
            style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
            <MoreVertical className="h-4 w-4" />
          </button>
          {showChatMenu && (
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl shadow-xl border overflow-hidden"
              style={{ background:"var(--s1)", borderColor:"var(--border-default)" }}>
              {/* Confirmações de leitura */}
              <button onClick={e => { e.stopPropagation(); toggleReadReceipts(); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--s2)] transition text-left">
                <div className="flex items-center gap-3">
                  <CheckCheck className="h-4 w-4" style={{ color: readReceipts ? "#5B3FCF" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Confirmações de leitura</p>
                    <p className="text-[11px]" style={{ color:"var(--text-muted)" }}>Ticks azuis quando lido</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${readReceipts ? "bg-[#5B3FCF]" : "bg-neutral-400"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--s2)] shadow transition-transform ${readReceipts ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
              {/* Última vez ativo */}
              <button onClick={e => { e.stopPropagation(); toggleLastSeen(); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--s2)] transition text-left border-t"
                style={{ borderColor:"var(--border-default)" }}>
                <div className="flex items-center gap-3">
                  <Eye className="h-4 w-4" style={{ color: showLastSeen ? "#5B3FCF" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Última vez ativo</p>
                    <p className="text-[11px]" style={{ color:"var(--text-muted)" }}>Mostrar quando estiveste online</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${showLastSeen ? "bg-[#5B3FCF]" : "bg-neutral-400"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--s2)] shadow transition-transform ${showLastSeen ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
              {/* Silenciar */}
              <button onClick={e => { e.stopPropagation(); toggleMute(); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--s2)] transition text-left border-t"
                style={{ borderColor:"var(--border-default)" }}>
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4" style={{ color: mutedConv ? "var(--text-muted)" : "#5B3FCF" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{mutedConv ? "Ativar notificações" : "Silenciar conversa"}</p>
                    <p className="text-[11px]" style={{ color:"var(--text-muted)" }}>Notificações desta conversa</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${mutedConv ? "bg-neutral-400" : "bg-[#5B3FCF]"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--s2)] shadow transition-transform ${mutedConv ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
              {/* Limpar conversa */}
              <button onClick={e => { e.stopPropagation(); clearConversation(); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--s2)] transition text-left border-t"
                style={{ borderColor:"var(--border-default)" }}>
                <Trash2 className="h-4 w-4" style={{ color:"var(--text-muted)" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Limpar conversa</p>
                  <p className="text-[11px]" style={{ color:"var(--text-muted)" }}>Remove mensagens localmente</p>
                </div>
              </button>
              {/* Bloquear / Desbloquear */}
              <button onClick={e => { e.stopPropagation(); isBlocked ? unblockUser() : blockUser(); }}
                className="w-full flex items-center gap-3 px-4 py-3 transition text-left border-t"
                style={{ borderColor:"var(--border-default)", background: isBlocked ? "transparent" : "transparent" }}
                onMouseOver={e => e.currentTarget.style.background = isBlocked ? "#dcfce7" : "#fee2e2"}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                {isBlocked
                  ? <UserCheck className="h-4 w-4" style={{ color:"#16a34a" }} />
                  : <UserX className="h-4 w-4 text-red-500" />}
                <div>
                  <p className="text-sm font-medium" style={{ color: isBlocked ? "#16a34a" : "#ef4444" }}>
                    {isBlocked ? "Desbloquear utilizador" : "Bloquear utilizador"}
                  </p>
                  <p className="text-[11px]" style={{ color:"var(--text-muted)" }}>
                    {isBlocked ? "Permite mensagens desta pessoa" : "Impede mensagens desta pessoa"}
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── BLOCKED BANNER ── */}
      {isBlocked && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
          style={{ background:"#fee2e2", borderColor:"#fca5a5" }}>
          <UserX className="h-5 w-5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-600">Utilizador bloqueado</p>
            <p className="text-xs text-red-400">Não podes enviar nem receber mensagens de @{contact.username}.</p>
          </div>
          <button onClick={unblockUser}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shrink-0"
            style={{ background:"#dc2626" }}>
            Desbloquear
          </button>
        </div>
      )}
      {!isBlocked && iAmBlockedBy && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
          style={{ background:"#fef3c7", borderColor:"#fcd34d" }}>
          <UserX className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-700">Não podes enviar mensagens</p>
            <p className="text-xs text-amber-600">@{contact.username} bloqueou-te. As tuas mensagens não serão entregues.</p>
          </div>
        </div>
      )}

      {/* ── MESSAGES ── */}
      <div className="flex-1 overflow-y-auto scroll-smooth" onScroll={onScroll}>
        <div className="flex flex-col justify-end min-h-full px-2 py-4 space-y-1">
        {msgs.map(m => {
          const merged = { ...m, ...(localOverrides[m.id] ?? {}) } as Message & { deletedForMe?: boolean };
          if (merged.deletedForMe) return null;
          if ((merged as any).deleted_for_all) return null;
          const isMe = merged.senderId === myId;
          const replied = merged.replyTo ? msgRef(merged) ?? null : null;
          return (
            <MsgBubble key={merged.id} m={merged as any} isMe={isMe} replied={replied}
              contact={contact} myId={myId} mediaMsgs={mediaMsgs}
              onReply={() => setReplyTo(merged)}
              onEdit={() => startEdit(merged)}
              onDeleteForMe={() => deleteForMe(merged.id)}
              onDeleteForEveryone={() => deleteForEveryone(merged.id)}
              onOpenViewOnce={() => openViewOnce(merged.id)}
              onOpenLightbox={() => {
                const idx = mediaMsgs.findIndex(x => x.id === merged.id);
                if (idx !== -1) setLightboxIndex(idx);
              }}
              onReact={handleReact}
              onRetry={() => retryMsg(merged)}
              uploadPct={uploadPct}
              readReceipts={readReceipts}
            />
          );
        })}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* ── SCROLL TO BOTTOM ── */}
      {showScrollBtn && (
        <button onClick={() => { atBottom.current = true; setShowScrollBtn(false); bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }}
          className="absolute bottom-24 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-lg z-10 transition active:scale-90"
          style={{ background:"linear-gradient(135deg,#5B3FCF,#7B5CE8)", color:"white", position:"sticky" }}>
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {/* ── EDIT BAR ── */}
      {editingMsgId && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-t"
          style={{ background:"var(--s2)", borderColor:"#5B3FCF44" }}>
          <Pencil className="h-4 w-4 shrink-0" style={{ color:"#5B3FCF" }} />
          <input autoFocus value={editingText} onChange={e => setEditingText(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter") confirmEdit(); if (e.key==="Escape") setEditingMsgId(null); }}
            className="flex-1 text-sm outline-none bg-transparent" style={{ color:"var(--text-primary)" }} />
          <button onClick={confirmEdit}
            className="px-3 py-1 rounded-xl text-xs font-bold text-white"
            style={{ background:"linear-gradient(135deg,#5B3FCF,#7B5CE8)" }}>Guardar</button>
          <button onClick={() => setEditingMsgId(null)}><X className="h-4 w-4 text-[var(--text-muted)]" /></button>
        </div>
      )}

      {/* ── REPLY BAR ── */}
      {replyTo && !editingMsgId && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-t"
          style={{ borderColor: CHAT_ACCENT + "44", background:"var(--s2)" }}>
          <div className="flex-1 px-3 py-1.5 rounded-xl border-l-4 min-w-0"
            style={{ borderColor: CHAT_ACCENT, background:"var(--s3)" }}>
            <p className="text-[11px] font-bold" style={{ color: CHAT_ACCENT }}>
              {replyTo.senderId === myId ? "Tu" : contact.full_name || contact.username}
            </p>
            <p className="text-[11px] truncate" style={{ color:"var(--text-secondary)" }}>
              {replyTo.type === "image" ? "📷 Imagem" : replyTo.type === "video" ? "🎥 Vídeo" : replyTo.type === "audio" ? "🎤 Áudio" : replyTo.text}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)}><X className="h-4 w-4" style={{ color:"var(--text-muted)" }}/></button>
        </div>
      )}

      {/* ── EMOJI / GIF / STICKER PICKER ── */}
      {showEmoji && (
        <ChatPicker
          tab={pickerTab} setTab={setPickerTab}
          emojiSearch={emojiSearch} setEmojiSearch={setEmojiSearch}
          gifSearch={gifSearch} setGifSearch={setGifSearch}
          gifs={gifs} gifLoading={gifLoading}
          onEmoji={e => { setInput(p => p + e); inputRef.current?.focus(); }}
          onSticker={s => send(s, "sticker")}
          onGif={url => send("GIF", "image", url)}
        />
      )}

      {/* ── ATTACH PANEL ── */}
      {showAttach && !recording && (
        <div className="px-4 py-5 grid grid-cols-4 gap-4 shrink-0 border-t"
          style={{ background:"var(--s2)", borderColor:"var(--border-default)" }}>
          {[
            { icon: <ImageIcon className="h-6 w-6 text-white"/>, label:"Galeria", color:"#E94B8A", action:() => imgInputRef.current?.click() },
            { icon: <VideoIcon className="h-6 w-6 text-white"/>, label:"Vídeo",   color:"#1FAFA6", action:() => videoInputRef.current?.click() },
            { icon: <FileText  className="h-6 w-6 text-white"/>, label:"Ficheiro",color:"#5B3FCF", action:() => fileInputRef.current?.click() },
            { icon: <Eye       className="h-6 w-6 text-white"/>, label:"Ver 1x",  color:"#7C3AED", action:() => (document.getElementById("viewonce-input-dm") as HTMLInputElement)?.click() },
          ].map(a => (
            <button key={a.label} onClick={a.action}
              className="flex flex-col items-center gap-1.5 active:scale-90 transition">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow"
                style={{ background: `linear-gradient(135deg,${a.color},${a.color}99)` }}>
                {a.icon}
              </div>
              <span className="text-[11px] font-semibold" style={{ color:"var(--text-secondary)" }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── GRAVAÇÃO EM CURSO — estilo WhatsApp ── */}
      {recording && (
        <div className="flex items-center gap-3 px-3 py-3 shrink-0 border-t"
          style={{ background:"var(--s0)", borderColor:"var(--border-default)" }}>
          {/* Botão cancelar */}
          <button onClick={cancelRecording}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
            style={{ background:"#EF444415", color:"#EF4444" }}>
            <Trash2 className="h-5 w-5" />
          </button>
          {/* Indicador gravação — ponto + timer */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background:"#EF4444" }} />
            <div className="flex gap-[2px] items-end flex-1 h-8 overflow-hidden">
              {Array.from({length:40}).map((_,i) => (
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    background: CHAT_ACCENT,
                    opacity: 0.7,
                    minHeight: 3,
                    animation: `typing-bounce ${0.6 + (i % 5) * 0.12}s ease-in-out ${i * 0.04}s infinite`,
                  }} />
              ))}
            </div>
            <span className="text-sm font-mono font-semibold tabular-nums shrink-0"
              style={{ color:"#EF4444", minWidth:40, textAlign:"right" }}>
              {fmtSecs(recordSecs)}
            </span>
          </div>
          {/* Parar e ir para preview */}
          <button onClick={stopRecording}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
            style={{ background:"#25D366", color:"white", boxShadow:"0 2px 8px #25D36644" }}>
            <Check className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ── PREVIEW DE ÁUDIO — estilo WhatsApp ── */}
      {audioPreview && !recording && (
        <div className="shrink-0 border-t px-3 py-3"
          style={{ background:"var(--s0)", borderColor:"var(--border-default)" }}>
          {/* Linha principal: lixo | play + waveform + timer | enviar */}
          <div className="flex items-center gap-3">
            {/* Eliminar */}
            <button onClick={discardPreview}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
              style={{ background:"#EF444415", color:"#EF4444" }}>
              <Trash2 className="h-5 w-5" />
            </button>
            {/* Bolha de preview — idêntica ao AudioMsg mas com seek */}
            <div className="flex items-center gap-2 flex-1 min-w-0 rounded-2xl px-3 py-2"
              style={{ background:"#005C4B" }}>
              {/* Play/Pause */}
              <button onClick={togglePreviewPlay}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
                style={{ background:"rgba(255,255,255,0.18)" }}>
                {previewPlaying
                  ? <svg width="13" height="13" viewBox="0 0 16 16" fill="white"><rect x="3" y="2" width="3.5" height="12" rx="1.5"/><rect x="9.5" y="2" width="3.5" height="12" rx="1.5"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 16 16" fill="white" style={{marginLeft:2}}><path d="M4 2.5l10 5.5-10 5.5V2.5z"/></svg>}
              </button>
              {/* Waveform + timer */}
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-[2px] h-7 cursor-pointer"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
                    setPreviewPos(pct);
                    if (previewAudioRef.current) previewAudioRef.current.currentTime = audioPreview.dur * pct / 100;
                  }}>
                  {waveform.map((h, i) => {
                    const barPct = (i / waveform.length) * 100;
                    const inTrim = barPct >= trimStart && barPct <= trimEnd;
                    const played = barPct <= previewPos;
                    return (
                      <div key={i} className="flex-1 rounded-full transition-colors duration-75"
                        style={{
                          height:`${h}%`,
                          background: !inTrim ? "rgba(255,255,255,0.12)" : played ? "#25D366" : "rgba(255,255,255,0.28)",
                        }} />
                    );
                  })}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color:"rgba(255,255,255,0.65)" }}>
                    {fmtSecs(Math.round(audioPreview.dur * previewPos / 100))}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color:"rgba(255,255,255,0.45)" }}>
                    {fmtSecs(Math.round(audioPreview.dur))}
                  </span>
                </div>
              </div>
            </div>
            {/* Enviar */}
            <button onClick={sendAudioPreview}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
              style={{ background:"#25D366", color:"white", boxShadow:"0 2px 8px #25D36655" }}>
              <Send className="h-5 w-5" style={{ marginLeft:1 }} />
            </button>
          </div>
          {/* Linha de corte — compacta, abaixo da bolha */}
          <div className="flex items-center gap-2 mt-2.5 px-1">
            <span className="text-[9px] shrink-0" style={{ color:"#25D366", minWidth:28, textAlign:"right" }}>
              ✂️ {fmtSecs(Math.round(audioPreview.dur * trimStart / 100))}
            </span>
            <div className="flex-1 flex flex-col gap-1">
              <input type="range" min={0} max={trimEnd - 2} value={trimStart}
                onChange={e => { const v = Number(e.target.value); setTrimStart(v); trimStartRef.current = v; if (previewAudioRef.current) previewAudioRef.current.currentTime = audioPreview.dur * v / 100; setPreviewPos(v); }}
                className="w-full h-1 accent-[#5B3FCF]" style={{ cursor:"pointer" }} />
              <input type="range" min={trimStart + 2} max={100} value={trimEnd}
                onChange={e => { const v = Number(e.target.value); setTrimEnd(v); trimEndRef.current = v; }}
                className="w-full h-1" style={{ cursor:"pointer", accentColor:"#E94B8A" }} />
            </div>
            <span className="text-[9px] shrink-0" style={{ color:"#E94B8A", minWidth:28 }}>
              {fmtSecs(Math.round(audioPreview.dur * trimEnd / 100))} ✂️
            </span>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMAÇÃO ── */}
      {chatConfirm && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background:"rgba(0,0,0,0.55)", backdropFilter:"blur(6px)" }}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            style={{ background:"var(--s0,white)" }}>
            <div className="px-6 pt-6 pb-4">
              <p className="text-base font-bold mb-2" style={{ color:"var(--text-primary)" }}>
                {chatConfirm.title}
              </p>
              <p className="text-sm leading-relaxed" style={{ color:"var(--text-secondary,#666)" }}>
                {chatConfirm.body}
              </p>
            </div>
            <div className="flex border-t" style={{ borderColor:"var(--border-default)" }}>
              <button onClick={() => setChatConfirm(null)}
                className="flex-1 py-4 text-sm font-semibold transition hover:bg-[var(--s2)]"
                style={{ color:"var(--text-secondary)" }}>
                Cancelar
              </button>
              <div style={{ width:1, background:"var(--border-default)" }} />
              <button onClick={chatConfirm.action}
                className="flex-1 py-4 text-sm font-bold transition hover:bg-red-50"
                style={{ color:"#EF4444" }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── TYPING INDICATOR ── */}
      {contactTyping && (
        <div className="flex items-center gap-2 px-4 py-1.5 shrink-0"
          style={{ background: "var(--s0)" }}>
          <div className="flex items-center gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "#5B3FCF",
                  animation: `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
            ))}
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {contact.full_name || contact.username} está a escrever...
          </span>
        </div>
      )}

      {/* ── INPUT BAR estilo WhatsApp ── */}
      {(isBlocked || iAmBlockedBy || msgPermBlocked) ? (
        <div className="flex flex-col items-center justify-center px-4 py-4 shrink-0 border-t gap-1"
          style={{ background:"var(--s2)", borderColor:"var(--border-default)" }}>
          <p className="text-sm text-center font-semibold" style={{ color:"var(--text-primary)" }}>
            {isBlocked
              ? "Bloqueaste este utilizador. Desbloqueia para enviar mensagens."
              : iAmBlockedBy
              ? `@${contact.username} bloqueou-te. Não podes enviar mensagens.`
              : msgPermReason}
          </p>
          {msgPermBlocked && (
            <p className="text-xs text-center" style={{ color:"var(--text-muted)" }}>
              Não é possível enviar mensagens a este utilizador com as definições de privacidade actuais.
            </p>
          )}
        </div>
      ) : (

      <div className="flex items-end gap-2 px-2 py-2 shrink-0"
        style={{ background:"var(--s0,#f0ece8)" }}>
        {/* Botão anexo */}
        <button onClick={() => { setShowAttach(v=>!v); setShowEmoji(false); }}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 mb-0.5"
          style={{
            background: showAttach ? "linear-gradient(135deg,#5B3FCF,#E94B8A)" : "white",
            color: showAttach ? "white" : "#5B3FCF",
            boxShadow: "0 1px 6px rgba(0,0,0,0.12)"
          }}>
          <Plus className="h-5 w-5" />
        </button>
        {/* Campo de texto — igual ao WhatsApp */}
        <div className="flex-1 flex items-end rounded-3xl px-4 py-2 gap-2 min-h-[44px]"
          style={{ background: "var(--s2)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Mensagem..." className="flex-1 bg-transparent outline-none text-sm resize-none py-1 max-h-28 leading-relaxed"
            style={{ color:"var(--text-primary,#111)" }} />
          <button onClick={() => { setShowEmoji(v=>!v); setShowAttach(false); }}
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 mb-0.5"
            style={{ color: showEmoji ? "#5B3FCF" : "#aaa" }}>
            <Smile className="h-5 w-5" />
          </button>
        </div>
        {/* Send / Mic — círculo roxo igual ao WhatsApp mas cor hooda */}
        {input.trim()
          ? (
            <button onClick={() => send()} disabled={sending}
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 mb-0.5"
              style={{ background:`linear-gradient(135deg,#5B3FCF,#7B5CE8)`, color:"white", boxShadow:`0 4px 14px rgba(91,63,207,0.4)` }}>
              {sending ? <Loader className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" style={{ marginLeft: 2 }} />}
            </button>
          ) : (
            <button
              onClick={() => { recording ? stopRecording() : startRecording(); }}
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 mb-0.5"
              style={{ background: recording ? "#EF4444" : "#25D366", color:"white", boxShadow: recording ? "0 4px 14px #EF444455" : "0 4px 14px #25D36655" }}>
              {recording ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="4" height="10" rx="1" fill="white"/><rect x="8" y="2" width="4" height="10" rx="1" fill="white"/></svg> : <Mic className="h-5 w-5" />}
            </button>
          )
        }
      </div>
      )} {/* end isBlocked ternary */}

      {/* ── HIDDEN INPUTS ── */}
      <input ref={imgInputRef}   type="file" accept="image/*" multiple style={{ display:"none" }}
        onChange={e => { if (e.target.files?.length) openMediaQueue(e.target.files, "image"); e.target.value = ""; }} />
      <input ref={videoInputRef} type="file" accept="video/*"            style={{ display:"none" }}
        onChange={e => { if (e.target.files?.length) openMediaQueue(e.target.files, "video"); e.target.value = ""; }} />
      <input ref={fileInputRef}  type="file"                             style={{ display:"none" }}
        onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
          const url = await uploadFile(f, "files"); if (url) await send(f.name, "file", url);
        }} />
      <input id="viewonce-input-dm" type="file" accept="image/*,video/*" style={{ display:"none" }}
        onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
          await sendViewOnce(f, f.type.startsWith("video") ? "video" : "image");
        }} />

      {/* ── MEDIA SEND PREVIEW ── */}
      {showMediaPreview && mediaSendQueue[mediaQueueIdx] && (
        <ChatMediaSendPreview
          item={mediaSendQueue[mediaQueueIdx]}
          sending={sending || uploading}
          onCancel={() => { setShowMediaPreview(false); setMediaSendQueue([]); }}
          onSend={async (caption, edit) => {
            setMediaSendQueue(q => q.map((x,i) => i===mediaQueueIdx ? {...x, caption, edit} : x));
            await confirmCurrentMedia();
          }}
        />
      )}

      {/* ── BG MODAL ── */}
      {showBgModal && (
        <BgPickerModal current={bgId} onPick={id => {
          setBgId(id);
          setShowBgModal(false);
          try { localStorage.setItem(`hooda_chat_bg_${contact.conversationId}`, id); } catch {}
        }} onClose={() => setShowBgModal(false)} />
      )}

      {/* ── LIGHTBOX ── */}
      {lightboxIndex !== null && mediaMsgs[lightboxIndex] && (
        <ChatMediaLightbox items={mediaMsgs} index={lightboxIndex}
          onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)}
          onReact={handleReact}
          contact={contact} myId={myId} />
      )}

      {/* ── VIEW ONCE MODAL ── */}
      {viewOnceModal && (
        <ViewOnceModal
          url={viewOnceModal.url}
          type={viewOnceModal.type}
          onClose={async () => {
            const msgId = viewOnceModal.msgId;
            patchMsg(msgId, { viewOnceOpened: true });
            setViewOnceModal(null);
            // Retry 3x com backoff antes de usar fallback localStorage
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const { error } = await db.rpc("mark_view_once_opened", { p_msg_id: msgId, p_user_id: myId });
                if (!error) return;
              } catch {}
              if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
            }
            // Todas as tentativas falharam — guardar localmente para persistir entre sessões
            try {
              const key = `hooda_vo_fallback_${myId}`;
              const existing: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
              if (!existing.includes(msgId)) localStorage.setItem(key, JSON.stringify([...existing, msgId]));
            } catch {}
          }}
        />
      )}
    </div>
  );
}


// ── Contact List ──
function ContactList({ contacts, loading, refreshing, search, setSearch, active, setActive, setShowAddContact, setShowRequests, pendingRequestCount }: {
  contacts: Contact[];
  loading: boolean;
  refreshing?: boolean;
  search: string;
  setSearch: (v: string) => void;
  active: Contact | null;
  setActive: (c: Contact | null) => void;
  setShowAddContact: (v: boolean) => void;
  setShowRequests: (v: boolean) => void;
  pendingRequestCount: number;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const lower = search.toLowerCase();
    return contacts.filter(c =>
      c.username?.toLowerCase().includes(lower) ||
      c.full_name?.toLowerCase().includes(lower)
    );
  }, [contacts, search]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-0,#fff)" }}>
      {/* Header estilo WhatsApp — fundo gradiente roxo hooda */}
      <div className="px-4 pt-5 pb-3 shrink-0"
        style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#7B5CE8 100%)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Mensagens</h1>
            {refreshing && <BackgroundRefreshDot show />}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowRequests(true)} className="relative p-2 rounded-full transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <Bell className="h-5 w-5 text-white" />
              {pendingRequestCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                  style={{ background: "#E94B8A" }}>
                  {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                </span>
              )}
            </button>
            <button onClick={() => setShowAddContact(true)}
              className="p-2 rounded-full transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <UserPlus className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
        {/* Barra de pesquisa estilo WhatsApp */}
        <div className="flex items-center gap-2 px-3 h-10 rounded-full"
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}>
          <Search className="h-4 w-4 text-white/70 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={"Pesquisar..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/60 text-white"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-white/70" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <ConversationListSkeleton count={8} />}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted,#888)" }}>
            <MessageSquare className="h-12 w-12 mx-auto mb-3" style={{ color: "#d1d1d1" }} />
            <p className="text-sm font-semibold">{search ? "Nenhuma conversa encontrada" : "Sem mensagens ainda"}</p>
            {!search && (
              <button onClick={() => setShowAddContact(true)}
                className="mt-4 px-5 py-2.5 rounded-full text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
                Iniciar conversa
              </button>
            )}
          </div>
        )}

        {filtered.map((c: any) => (
          <button
            key={c.conversationId}
            onClick={() => setActive(c)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--s1)]"
            style={{
              borderBottom: "1px solid var(--border-subtle,#f0f0f0)",
              background: active?.conversationId === c.conversationId ? "rgba(91,63,207,0.06)" : "transparent",
            }}>
            {/* Avatar com anel roxo se activo */}
            <div className="relative shrink-0">
              <div className="rounded-full"
                style={{
                  padding: active?.conversationId === c.conversationId ? 2 : 0,
                  background: active?.conversationId === c.conversationId
                    ? "linear-gradient(135deg,#5B3FCF,#E94B8A)" : "transparent",
                }}>
                <div style={{ borderRadius: "50%", padding: active?.conversationId === c.conversationId ? 1.5 : 0, background: "var(--s2)" }}>
                  <Av name={c.username} color={c.color} size={46} src={c.avatar_url} />
                </div>
              </div>
              {c.is_online && (
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={{ background: "#22c55e" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline gap-2">
                <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary,#111)" }}>
                  {c.full_name || c.username}
                </p>
                <p className="text-[11px] shrink-0" style={{ color: c.unread > 0 ? "#5B3FCF" : "var(--text-muted,#aaa)" }}>
                  {c.lastTime}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[13px] truncate flex-1" style={{ color: "var(--text-muted,#888)" }}>
                  {c.lastMsg || "@" + c.username}
                </p>
                {c.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
                    {c.unread > 9 ? "9+" : c.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──
function MensagensPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [myId, setMyId] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Contact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  // Contactos adicionados localmente nesta sessão (ex.: acabou de aceitar um
  // pedido) que ainda não vieram de volta na query — mesclados na lista
  // final para a UI reagir instantaneamente, sem esperar o refetch.
  const [optimisticContacts, setOptimisticContacts] = useState<Contact[]>([]);

  // Busca pura dos contactos (sem tocar em estado React) — usada como
  // queryFn do React Query. Com a persistência em localStorage, a lista
  // de conversas aparece instantaneamente ao reabrir a app, enquanto os
  // dados frescos chegam em segundo plano — nunca um ecrã vazio nem um
  // "a carregar contactos" longo.
  const fetchContacts = useCallback(async (uid: string): Promise<Contact[]> => {
    try {
      const { data: myConversations, error: convErr } = await db
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", uid);

      if (convErr) {
        console.error("Erro ao carregar conversation_participants:", convErr);
        return []; // não crash — retorna lista vazia
      }

      if (!myConversations || myConversations.length === 0) return [];

      const convIds = myConversations.map((c: any) => c.conversation_id);

      // Busca tudo em paralelo em vez de N queries sequenciais
      const [partResult, profilesResult, allMsgsResult] = await Promise.all([
        db.from("conversation_participants")
          .select("conversation_id,user_id")
          .in("conversation_id", convIds)
          .neq("user_id", uid),
        // profiles carregados após participantes — encadeado abaixo
        Promise.resolve({ data: null, error: null }),
        // última mensagem de TODAS as conversas de uma só vez
        db.from("messages")
          .select("conversation_id,content,created_at,sender_id,status,message_type")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false }),
      ]);

      const otherParticipants = partResult.data ?? [];
      if (partResult.error) console.error("Erro participantes:", partResult.error);
      if (otherParticipants.length === 0) return [];

      const otherIds = [...new Set(otherParticipants.map((p: any) => p.user_id))];

      const { data: profiles } = await db
        .from("profiles")
        .select("id,username,full_name,avatar_url,is_online")
        .in("id", otherIds as any);

      const allMsgs: any[] = allMsgsResult.data ?? [];

      // Agrupar mensagens por conversa (já vêm ordenadas desc, logo [0] é a última)
      const lastMsgMap: Record<string, any> = {};
      const unreadMap: Record<string, number> = {};
      for (const msg of allMsgs) {
        if (!lastMsgMap[msg.conversation_id]) {
          lastMsgMap[msg.conversation_id] = msg;
        }
        if (msg.sender_id !== uid && msg.status === "sent") {
          unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] ?? 0) + 1;
        }
      }

      const contactList: Contact[] = [];

      for (const convId of convIds) {
        const participant = otherParticipants.find(
          (p: any) => p.conversation_id === convId && p.user_id !== uid
        );
        if (!participant) continue;

        const profile = (profiles ?? []).find((p: any) => p.id === participant.user_id);
        if (!profile) continue;

        const lastMsg = lastMsgMap[convId];

        (contactList as any[]).push({
          id: profile.id,
          username: profile.username || "?",
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          color: colorFor(profile.username || profile.id),
          is_online: false,
          conversationId: convId,
          lastMsg: (() => {
            if (!lastMsg) return "";
            const c = lastMsg.content || "";
            if (c.startsWith("e2ee:")) return "🔒 Mensagem";
            const mt = lastMsg.message_type;
            if (mt === "image") return "📷 Imagem";
            if (mt === "video") return "🎥 Vídeo";
            if (mt === "audio") return "🎤 Áudio";
            if (mt === "file")  return "📎 Ficheiro";
            if (mt === "sticker") return c;
            return c;
          })(),
          lastTime: lastMsg ? timeAgo(lastMsg.created_at) : "",
          lastTimestamp: lastMsg ? new Date(lastMsg.created_at).getTime() : 0,
          unread: unreadMap[convId] ?? 0,
        });
      }

      contactList.sort((a, b) => {
        if (b.unread !== a.unread) return b.unread - a.unread;
        return (b as any).lastTimestamp - (a as any).lastTimestamp;
      });

      return contactList;
    } catch (err) {
      console.error("[fetchContacts] Erro inesperado:", err);
      return []; // nunca lança — o Error Boundary não dispara por causa disto
    }
  }, []);

  const contactsQuery = useQuery({
    queryKey: QUERY_KEYS.conversations(myId),
    queryFn: () => fetchContacts(myId),
    enabled: !!myId,
    ...CONVERSATIONS_QUERY_OPTIONS,
    // Nunca mostra ecrã vazio: usa dados anteriores enquanto carrega novos
    placeholderData: (prev) => prev,
  });

  // Lista final mostrada: dados em cache/rede + contactos adicionados
  // localmente nesta sessão que a query ainda não "viu", deduplicados por
  // conversationId — abre instantaneamente, sem esperar o servidor.
  const contacts = useMemo(() => {
    const base = contactsQuery.data ?? [];
    const seen = new Set(base.map((c) => c.conversationId));
    return [...base, ...optimisticContacts.filter((c) => !seen.has(c.conversationId))];
  }, [contactsQuery.data, optimisticContacts]);

  // Só mostra o skeleton quando não há absolutamente nada em cache —
  // mesmo cache desatualizado é melhor do que uma tela vazia.
  const loading = contactsQuery.isLoading && contacts.length === 0;
  const refreshingInBackground = contactsQuery.isFetching && !loading;
  const loadError = contactsQuery.isError
    ? (contactsQuery.error instanceof Error ? contactsQuery.error.message : "Erro inesperado ao carregar contactos")
    : "";
  const loadContacts = useCallback((_uid: string) => contactsQuery.refetch(), [contactsQuery]);

  const loadPendingRequests = useCallback(async (uid: string) => {
    const { count } = await db
      .from("message_requests")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", uid)
      .eq("status", "pending");
    setPendingRequestCount(count || 0);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id || !isValidUUID(session.user.id)) {
          navigate({ to: "/", replace: true });
          return;
        }
        const uid = session.user.id;
        setMyId(uid);
        // A lista de contactos é buscada automaticamente pelo useQuery
        // (cache instantâneo) assim que myId muda — só precisamos dos
        // pedidos pendentes aqui.
        await loadPendingRequests(uid);
      } catch {
        navigate({ to: "/", replace: true });
      }
    })();
  }, [navigate, loadPendingRequests]);

  // Realtime para pedidos
  useEffect(() => {
    if (!myId) return;
    const ch = supabase.channel(`requests-${myId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "message_requests",
        filter: `receiver_id=eq.${myId}`,
      }, () => loadPendingRequests(myId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId, loadPendingRequests]);

  // ── Realtime global: nova mensagem em QUALQUER conversa ──
  // Atualiza a lista de contactos E mostra notificação tipo WhatsApp
  useEffect(() => {
    if (!myId) return;

    const ch = supabase.channel(`global-msgs-${myId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
      }, async (payload: any) => {
        const msg = payload.new;
        // Só processa mensagens recebidas (não as que eu enviei)
        if (msg.sender_id === myId) return;
        // Verificar se sou participante desta conversa
        const { data: part } = await db
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", msg.conversation_id)
          .eq("user_id", myId)
          .maybeSingle();
        if (!part) return;

        // Atualizar lista de contactos
        contactsQuery.refetch();

        // Notificação toast estilo WhatsApp
        // (só se a conversa não estiver aberta)
        const activeConvId = (window as any).__hoodalActiveConvId__;
        if (activeConvId === msg.conversation_id) return;

        // Buscar perfil do remetente
        const { data: profile } = await db
          .from("profiles")
          .select("username,full_name,avatar_url")
          .eq("id", msg.sender_id)
          .single();

        const name = profile?.full_name || profile?.username || "Alguém";
        const text = msg.content?.startsWith("e2ee:") ? "🔒 Mensagem"
          : msg.message_type === "image"  ? "📷 Imagem"
          : msg.message_type === "video"  ? "🎥 Vídeo"
          : msg.message_type === "audio"  ? "🎤 Áudio"
          : msg.message_type === "sticker" ? "😊 Sticker"
          : (msg.content || t("messages.new_message"));

        toast(
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-sm"
              style={{ background: "#5B3FCF" }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : (name[0] ?? "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary,#111)" }}>{name}</p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted,#888)" }}>{text}</p>
            </div>
          </div>,
          {
            duration: 4000,
            style: { padding: "10px 14px", borderRadius: 16, cursor: "pointer" },
            action: {
              label: "Ver",
              onClick: () => {
                const contact = contacts.find(c => c.conversationId === msg.conversation_id);
                if (contact) setActive(contact);
              },
            },
          }
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [myId, contacts, contactsQuery]);

  // Mobile: refrescar lista de conversas quando o separador volta a estar visível
  useEffect(() => {
    if (!myId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        contactsQuery.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [myId, contactsQuery]);

  // Guardar a conversa ativa globalmente para a notificação saber se deve aparecer
  useEffect(() => {
    (window as any).__hoodalActiveConvId__ = active?.conversationId ?? null;
  }, [active]);

  const handleAddContact = useCallback((profile: Profile, convId: string) => {
    setShowAddContact(false);
    const newContact: Contact = {
      ...profile,
      conversationId: convId,
      lastMsg: "",
      lastTime: "",
      unread: 0,
    };
    const exists = contacts.find(c => c.conversationId === convId);
    if (exists) {
      setActive(exists);
    } else {
      setOptimisticContacts(prev => [newContact, ...prev]);
      setActive(newContact);
    }
    setTimeout(() => loadContacts(myId), 800);
  }, [myId, loadContacts, contacts]);

  const handleRequestApprove = useCallback((senderId: string, convId: string, senderProfile: Profile) => {
    setShowRequests(false);
    loadPendingRequests(myId);
    handleAddContact(senderProfile, convId);
  }, [myId, loadPendingRequests, handleAddContact]);

  if (!myId) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-screen">
          <Loader className="h-8 w-8 animate-spin" style={{ color: "#5B3FCF" }} />
        </div>
      </PageWrapper>
    );
  }

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-0 lg:pb-0">
        {loadError && (
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "#FEE2E2" }}>
            <X className="h-4 w-4 shrink-0" style={{ color: "#DC2626" }} />
            <p className="text-xs flex-1" style={{ color: "#991B1B" }}>{loadError}</p>
            <button onClick={() => loadContacts(myId)} className="text-xs font-bold underline shrink-0" style={{ color: "#991B1B" }}>
              Tentar de novo
            </button>
          </div>
        )}
        {/* Desktop */}
        <div className="hidden lg:flex h-screen" style={{ background: "var(--surface-1,#f5f5f0)" }}>
          <div className="w-80 shrink-0 border-r overflow-hidden" style={{ borderColor: "var(--border-subtle,#e5e5e5)" }}>
            <ContactList
              contacts={contacts} loading={loading} refreshing={refreshingInBackground} search={search} setSearch={setSearch}
              active={active} setActive={setActive} setShowAddContact={setShowAddContact}
              setShowRequests={setShowRequests} pendingRequestCount={pendingRequestCount}
            />
          </div>
          <div className="flex-1 flex flex-col">
            {active
              ? <ChatPanel key={active.conversationId} myId={myId} contact={active} onBack={() => setActive(null)} />
              : <div className="flex items-center justify-center h-full flex-col gap-3" style={{ color: "var(--text-muted,#888)" }}>
                  <MessageSquare className="h-12 w-12" style={{ color: "#d1d1d1" }} />
                  <p>{t("messages.select_conversation", "Seleciona uma conversa")}</p>
                </div>
            }
          </div>
        </div>

        {/* Mobile */}
        <div className="lg:hidden relative" style={{ height: "calc(100dvh - 62px)" }}>
          <div className="absolute inset-0 transition-transform duration-300" style={{ transform: active ? "translateX(-100%)" : "translateX(0)", overflow: "hidden" }}>
            <ContactList
              contacts={contacts} loading={loading} refreshing={refreshingInBackground} search={search} setSearch={setSearch}
              active={active} setActive={setActive} setShowAddContact={setShowAddContact}
              setShowRequests={setShowRequests} pendingRequestCount={pendingRequestCount}
            />
          </div>
          <div className="absolute inset-0 transition-transform duration-300" style={{ transform: active ? "translateX(0)" : "translateX(100%)", overflow: "hidden", pointerEvents: active ? "auto" : "none" }}>
            {active && <ChatPanel key={active.conversationId} myId={myId} contact={active} onBack={() => setActive(null)} />}
          </div>
        </div>

        {showAddContact && (
          <AddContactModal myId={myId} onClose={() => setShowAddContact(false)} onAdd={handleAddContact} existingContacts={contacts} />
        )}

        {showRequests && (
          <RequestsPanel myId={myId} onApprove={handleRequestApprove} onClose={() => setShowRequests(false)} />
        )}
      </PageWrapper>
    </>
  );
}

export default MensagensPage;
