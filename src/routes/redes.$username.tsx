import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MoreHorizontal, Users, Share2, Flag, Settings, Info, X, Loader2,
} from "lucide-react";
import { SideNav, PageWrapper, PageHeader, BottomNav } from "@/components/AppShell";
import { UniversalPostCard, type NormalizedPost } from "@/components/UniversalPostCard";
import { ComposeBox } from "@/components/QuickComposer";
import { RedeChatPanel } from "@/components/RedeChatPanel";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UniversalSkeleton } from "@/components/Skeletons";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchRedeByUsername, fetchMinhaAdesao, entrarNaRede, sairDaRede,
  fetchPostsDaRede, marcarRedeVista, fetchAdminIdsDaRede, type Rede, type RedeMembro,
} from "@/lib/redes";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redes/$username")({
  head: () => ({ meta: [{ title: "Rede · Baya" }] }),
  component: RedePage,
});

const COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A", "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];

function rawToNormalizedPost(p: any, adminIds?: Set<string>): NormalizedPost {
  let text = p.content;
  let bg_color: string | null = null;
  if (p.kind === "bg") { try { const j = JSON.parse(p.content); text = j.text; bg_color = j.bgColor; } catch { /* noop */ } }
  return {
    id: p.id, author_id: p.author_id ?? null, author_username: p.author_username ?? null,
    user: p.author_name ?? p.author_username, name: `@${p.author_username ?? "?"}`,
    color: p.author_color ?? undefined, avatar_url: null, text, bg_color,
    photo: p.photo_url ?? null, photos: p.photos ?? null, video: p.video_url ?? null,
    video_thumb: p.thumbnail_url ?? null, kind: p.kind ?? null,
    likes: p.likes_count ?? 0, comments: p.comments_count ?? 0, views_count: p.views_count ?? 0,
    poll: p.poll ?? null, poll_ends_at: p.poll_ends_at ?? null,
    moderation_status: p.moderation_status, is_sensitive: !!p.is_sensitive,
    rede_id: p.rede_id, rede_nome: p.rede_nome, rede_username: p.rede_username,
    rede_avatar_url: p.rede_avatar_url, rede_verificada: !!p.rede_verificada,
    author_is_rede_admin: !!(p.author_id && adminIds?.has(p.author_id)),
  };
}

function RedePage() {
  const { username } = useParams({ from: "/redes/$username" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<"posts" | "conversa">("posts");
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showMembros, setShowMembros] = useState(false);
  const [joining, setJoining] = useState(false);

  const { data: rede, isLoading: loadingRede } = useQuery({
    queryKey: ["rede", username],
    queryFn: () => fetchRedeByUsername(username),
  });

  const { data: adesao } = useQuery({
    queryKey: ["rede-adesao", rede?.id, user?.id],
    queryFn: () => fetchMinhaAdesao(rede!.id, user!.id),
    enabled: !!rede?.id && !!user?.id,
  });

  const souMembro = adesao?.estado === "ativo";
  const souAdmin = adesao?.papel === "admin";
  const pendente = adesao?.estado === "pendente";

  const { data: postsData, isLoading: loadingPosts, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["rede-posts", rede?.id],
    queryFn: ({ pageParam }) => fetchPostsDaRede(rede!.id, pageParam),
    enabled: !!rede?.id,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length > 0 ? last[last.length - 1].created_at : undefined),
  });

  const { data: adminIds } = useQuery({
    queryKey: ["rede-admin-ids", rede?.id],
    queryFn: () => fetchAdminIdsDaRede(rede!.id),
    enabled: !!rede?.id,
    staleTime: 60_000,
  });

  const posts = (postsData?.pages ?? []).flat().map((p) => rawToNormalizedPost(p, adminIds));

  async function handleEntrar() {
    if (!rede || !user) { toast.error("Inicia sessão para entrar na Rede."); return; }
    setJoining(true);
    try {
      const estado = await entrarNaRede(rede.id);
      toast.success(estado === "pendente" ? "Pedido enviado — aguarda aprovação." : "Entraste na Rede!");
      qc.invalidateQueries({ queryKey: ["rede-adesao", rede.id, user.id] });
      qc.invalidateQueries({ queryKey: ["rede", username] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível entrar na Rede.");
    } finally {
      setJoining(false);
    }
  }

  async function handleSair() {
    if (!rede || !user) return;
    setJoining(true);
    try {
      await sairDaRede(rede.id);
      toast.success("Saíste da Rede.");
      qc.invalidateQueries({ queryKey: ["rede-adesao", rede.id, user.id] });
      qc.invalidateQueries({ queryKey: ["rede", username] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível sair da Rede.");
    } finally {
      setJoining(false);
    }
  }

  function handleAbrirConversa() {
    if (!souMembro) { toast.error("Entra na Rede para veres a conversa."); return; }
    setAba("conversa");
    if (rede) marcarRedeVista(rede.id);
  }

  function handlePartilhar() {
    const url = `${window.location.origin}/redes/${username}`;
    navigator.clipboard?.writeText(url);
    toast.success("Link copiado!");
    setShowMenu(false);
  }

  if (loadingRede) {
    return (
      <div className="flex">
        <SideNav />
        <PageWrapper className="flex-1 min-w-0">
          <UniversalSkeleton variant="feed" count={3} />
        </PageWrapper>
      </div>
    );
  }

  if (!rede) {
    return (
      <div className="flex">
        <SideNav />
        <PageWrapper className="flex-1 min-w-0">
          <PageHeader title="Rede" onBack={() => navigate({ to: "/explorar", search: { tab: "redes" } })} />
          <div className="flex flex-col items-center gap-2 py-20 text-center px-6">
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Esta Rede não existe</p>
          </div>
        </PageWrapper>
      </div>
    );
  }

  const podePublicar = souMembro && (rede.quem_publica === "todos" || souAdmin);

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
        <div className="max-w-[600px] mx-auto lg:border-x min-h-screen relative" style={{ borderColor: "var(--border-subtle)" }}>
          <PageHeader
            title={rede.nome}
            onBack={() => navigate({ to: "/explorar", search: { tab: "redes" } })}
            actions={
              <div className="relative">
                <button onClick={() => setShowMenu((v) => !v)} className="p-2 rounded-full hover:bg-[var(--s2)]">
                  <MoreHorizontal className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-10 z-50 w-56 rounded-xl overflow-hidden shadow-lg border"
                      style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
                      <button onClick={() => { setShowInfo(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--s2)]" style={{ color: "var(--text-primary)" }}>
                        <Info className="h-4 w-4" /> Informações da Rede
                      </button>
                      <button onClick={() => { setShowMembros(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--s2)]" style={{ color: "var(--text-primary)" }}>
                        <Users className="h-4 w-4" /> Membros
                      </button>
                      <button onClick={handlePartilhar} className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--s2)]" style={{ color: "var(--text-primary)" }}>
                        <Share2 className="h-4 w-4" /> Partilhar
                      </button>
                      <button onClick={() => { toast.success("Denúncia enviada. A nossa equipa vai analisar."); setShowMenu(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--s2)]" style={{ color: "#ef4444" }}>
                        <Flag className="h-4 w-4" /> Denunciar
                      </button>
                      {souAdmin && (
                        <button onClick={() => { navigate({ to: "/redes/$username/definicoes", params: { username } }); setShowMenu(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm border-t hover:bg-[var(--s2)]" style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}>
                          <Settings className="h-4 w-4" /> Configurações
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            }
          />

          {/* Cabeçalho da Rede */}
          <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center gap-2">
            <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-2xl"
              style={{ background: colorFor(rede.nome) }}>
              {rede.avatar_url ? <img src={rede.avatar_url} alt="" className="w-full h-full object-cover" /> : rede.nome[0]?.toUpperCase()}
            </div>
            <p className="text-lg font-extrabold inline-flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
              {rede.nome}{rede.verificada && <VerifiedBadge size={15} />}
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>@{rede.username} · {rede.membros_count} membro{rede.membros_count === 1 ? "" : "s"}</p>
            {rede.descricao && <p className="text-sm max-w-sm" style={{ color: "var(--text-secondary)" }}>{rede.descricao}</p>}

            {souMembro ? (
              <button onClick={handleSair} disabled={joining}
                className="mt-1 px-6 h-9 rounded-full text-xs font-bold flex items-center gap-1.5"
                style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                {joining && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Inscrito
              </button>
            ) : pendente ? (
              <button disabled className="mt-1 px-6 h-9 rounded-full text-xs font-bold" style={{ background: "var(--s2)", color: "var(--text-muted)" }}>
                Pedido enviado
              </button>
            ) : (
              <button onClick={handleEntrar} disabled={joining}
                className="mt-1 px-6 h-9 rounded-full text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "#5B3FCF" }}>
                {joining && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Entrar
              </button>
            )}
          </div>

          {/* Abas */}
          <div className="flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={() => setAba("posts")} className="flex-1 py-3 text-sm font-bold relative"
              style={{ color: aba === "posts" ? "var(--text-primary)" : "var(--text-muted)" }}>
              Publicações
              {aba === "posts" && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full" style={{ background: "#5B3FCF" }} />}
            </button>
            {rede.tem_chat && (
              <button onClick={handleAbrirConversa} className="flex-1 py-3 text-sm font-bold relative"
                style={{ color: aba === "conversa" ? "var(--text-primary)" : "var(--text-muted)" }}>
                Conversa
                {aba === "conversa" && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full" style={{ background: "#5B3FCF" }} />}
              </button>
            )}
          </div>

          {aba === "posts" ? (
            <div>
              {podePublicar && (
                <div className="px-3 pt-3">
                  <ComposeBox
                    name={rede.nome} username={rede.username} avatarUrl={rede.avatar_url}
                    placeholder={`Publicar em ${rede.nome}…`}
                    redeContext={{ id: rede.id, nome: rede.nome, username: rede.username, avatarUrl: rede.avatar_url }}
                    onPublished={() => qc.invalidateQueries({ queryKey: ["rede-posts", rede.id] })}
                  />
                </div>
              )}
              <div className="px-3 pt-1 pb-6 space-y-1">
                {loadingPosts && <UniversalSkeleton variant="feed" count={3} />}
                {!loadingPosts && posts.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Ainda sem publicações</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {podePublicar ? "Sê o primeiro a publicar nesta Rede." : "Volta mais tarde para veres novidades."}
                    </p>
                  </div>
                )}
                {posts.map((p) => <UniversalPostCard key={p.id} post={p} />)}
                {hasNextPage && (
                  <div className="flex justify-center py-4">
                    <button onClick={() => fetchNextPage()} className="text-xs font-semibold" style={{ color: "#5B3FCF" }}>Ver mais</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            souMembro && rede.conversation_id
              ? <RedeChatPanel conversationId={rede.conversation_id} />
              : <p className="text-center text-sm py-16" style={{ color: "var(--text-muted)" }}>Entra na Rede para participares na conversa.</p>
          )}

          {/* Modal: Informações */}
          {showInfo && (
            <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50" onClick={() => setShowInfo(false)}>
              <div className="w-full lg:w-[420px] rounded-t-2xl lg:rounded-2xl p-5" style={{ background: "var(--s0)" }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold" style={{ color: "var(--text-primary)" }}>Informações da Rede</p>
                  <button onClick={() => setShowInfo(false)}><X className="h-5 w-5" style={{ color: "var(--text-muted)" }} /></button>
                </div>
                <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p><span className="font-semibold" style={{ color: "var(--text-primary)" }}>Categoria:</span> {rede.categoria ?? "—"}</p>
                  <p><span className="font-semibold" style={{ color: "var(--text-primary)" }}>Tipo:</span> {rede.tipo === "publica" ? "Pública" : rede.tipo === "privada" ? "Privada" : "Canal"}</p>
                  <p><span className="font-semibold" style={{ color: "var(--text-primary)" }}>Membros:</span> {rede.membros_count}</p>
                  {rede.regras && <p><span className="font-semibold" style={{ color: "var(--text-primary)" }}>Regras:</span> {rede.regras}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Modal: Membros */}
          {showMembros && (
            <MembrosModal redeId={rede.id} onClose={() => setShowMembros(false)} />
          )}
        </div>
      </PageWrapper>
      <BottomNav />
    </div>
  );
}

function MembrosModal({ redeId, onClose }: { redeId: string; onClose: () => void }) {
  const { data: membros, isLoading } = useQuery({
    queryKey: ["rede-membros", redeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("rede_membros")
        .select("user_id,papel,profile:profiles(username,full_name,avatar_url)")
        .eq("rede_id", redeId).eq("estado", "ativo")
        .order("joined_at", { ascending: true });
      return (data ?? []) as RedeMembro[];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full lg:w-[420px] max-h-[70vh] overflow-y-auto rounded-t-2xl lg:rounded-2xl p-5" style={{ background: "var(--s0)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>Membros</p>
          <button onClick={onClose}><X className="h-5 w-5" style={{ color: "var(--text-muted)" }} /></button>
        </div>
        {isLoading && <p className="text-sm" style={{ color: "var(--text-muted)" }}>A carregar…</p>}
        <div className="space-y-3">
          {membros?.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs shrink-0" style={{ background: colorFor(m.profile?.username ?? "?") }}>
                {m.profile?.avatar_url ? <img src={m.profile.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.profile?.full_name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{m.profile?.full_name ?? m.profile?.username}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{m.profile?.username}</p>
              </div>
              {m.papel === "admin" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--s2)", color: "var(--text-muted)" }}>Admin</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
