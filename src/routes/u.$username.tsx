import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { HoodaLogo } from "@/components/HoodaLogo";
import {
  ChevronLeft,
  MessageCircle,
  Flag,
  BookOpen,
  Heart,
  MessageCircle as CommentIcon,
  Share2,
  MoreHorizontal,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { QUERY_KEYS, STATIC_QUERY_OPTIONS } from "@/lib/queryClient";
import { ProfileHeaderSkeleton, ProfilePostsSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "hooda — Perfil" }] }),
  component: UserProfilePage,
});

const ACCENT_COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
const colorFor = (s: string) => ACCENT_COLORS[(s?.charCodeAt(0) ?? 0) % ACCENT_COLORS.length];
function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Avatar({
  name,
  size = 72,
  src,
  color,
}: {
  name: string;
  size?: number;
  src?: string | null;
  color?: string;
}) {
  return (
    <div
      style={{
        background: color || colorFor(name),
        width: size,
        height: size,
        borderRadius: "50%",
        border: "3px solid white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
        color: "white",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        (name?.[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

function UserProfilePage() {
  const { username } = useParams({ from: "/u/$username" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [myId, setMyId] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  // Estado local otimista para follow/like — evita esperar a rede para refletir o clique.
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const [followerDelta, setFollowerDelta] = useState(0);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, boolean>>({});

  // Sessão — leitura local/rápida, não bloqueia o resto da página.
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/", replace: true });
        return;
      }
      setMyId(session.user.id);
      setSessionChecked(true);
    })();
  }, [navigate]);

  // ── Query 1: Perfil — abre IMEDIATAMENTE com cache (10min), sem
  // esperar nenhuma outra consulta. Se o perfil já foi visitado antes
  // (ex.: veio de um story ou de um post), aparece instantaneamente.
  const profileQuery = useQuery({
    queryKey: QUERY_KEYS.profileByUsername(username),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,full_name,bio,avatar_url")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        username: string;
        full_name: string | null;
        bio: string | null;
        avatar_url: string | null;
      } | null;
    },
    ...STATIC_QUERY_OPTIONS,
  });
  const profile = profileQuery.data ?? null;
  const profileId = profile?.id;

  // Redireciona para /perfil se for o próprio utilizador.
  useEffect(() => {
    if (sessionChecked && myId && profileId && profileId === myId) {
      navigate({ to: "/perfil", replace: true });
    }
  }, [sessionChecked, myId, profileId, navigate]);

  // ── Query 2: Estatísticas + estado de "seguir" — corre EM PARALELO
  // com a query de publicações (Query 3), nunca depois dela.
  const statsQuery = useQuery({
    queryKey: ["profileStats", username, profileId, myId],
    queryFn: async () => {
      const [{ data: followRow }, { count: fc }, { count: foc }, { count: pc }] = await Promise.all(
        [
          supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", myId)
            .eq("target_username", username)
            .maybeSingle(),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("target_username", username),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", profileId as string),
          supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("author_id", profileId as string),
        ],
      );
      return {
        following: !!followRow,
        followerCount: fc ?? 0,
        followingCount: foc ?? 0,
        postCount: pc ?? 0,
      };
    },
    enabled: !!profileId && !!myId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // ── Query 3: Publicações — corre EM PARALELO com a Query 2. A lista
  // de posts tem o seu próprio Skeleton e não bloqueia o cabeçalho.
  const postsQuery = useQuery({
    queryKey: ["profilePosts", profileId],
    queryFn: async () => {
      const { data: postsData } = await supabase
        .from("posts")
        .select("id,content,kind,created_at,author_name,author_username,author_color")
        .eq("author_id", profileId as string)
        .order("created_at", { ascending: false })
        .limit(30);
      return (postsData ?? []).map((p: any) => {
        let text = p.content;
        let bgColor: string | null = null;
        if (p.kind === "bg") {
          try {
            const j = JSON.parse(p.content);
            text = j.text;
            bgColor = j.bgColor;
          } catch (_) {}
        }
        return {
          id: p.id as string,
          text,
          bgColor,
          createdAt: p.created_at as string,
          kind: p.kind,
        };
      });
    },
    enabled: !!profileId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const posts = postsQuery.data ?? [];

  // ── Query 4: Likes do utilizador atual — depende dos IDs dos posts,
  // mas corre de forma independente; não atrasa a renderização dos posts.
  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const likesQuery = useQuery({
    queryKey: ["profilePostLikes", myId, profileId, postIds.join(",")],
    queryFn: async () => {
      const { data: likesData } = await (supabase as any)
        .from("post_likes")
        .select("post_id")
        .eq("user_id", myId)
        .in("post_id", postIds);
      return new Set<string>((likesData ?? []).map((l: any) => l.post_id));
    },
    enabled: !!myId && postIds.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const likedPosts: Set<string> = likesQuery.data ?? new Set<string>();

  const loadingProfile = profileQuery.isLoading;
  const loadingPosts = postsQuery.isLoading || (!!profileId && postsQuery.isPending);
  const following = followOverride ?? statsQuery.data?.following ?? false;
  const followerCount = (statsQuery.data?.followerCount ?? 0) + followerDelta;
  const followingCount = statsQuery.data?.followingCount ?? 0;
  const postCount = statsQuery.data?.postCount ?? 0;

  async function openChat() {
    if (!profile || !myId || openingChat) return;
    setOpeningChat(true);
    try {
      // Verificar permissão
      const { data: targetProf } = await (supabase as any)
        .from("profiles")
        .select("msg_permission")
        .eq("id", profile.id)
        .single();
      const perm = targetProf?.msg_permission ?? "todos";

      const db = supabase as any;

      // Verificar se conversa já existe
      const { data: myConvs } = await db
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", myId);

      let existingConvId: string | null = null;
      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await db
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", profile.id)
          .in("conversation_id", myConvIds)
          .maybeSingle();
        if (shared) existingConvId = shared.conversation_id;
      }

      if (existingConvId) {
        // Conversa já existe, ir direto
        navigate({ to: "/mensagens" });
        return;
      }

      // Sem conversa — verificar permissão
      if (perm === "aprovados" || perm === "mutuos" || perm === "seguidores") {
        // Enviar pedido de mensagem
        const { data: existing } = await db
          .from("message_requests")
          .select("id,status")
          .eq("sender_id", myId)
          .eq("receiver_id", profile.id)
          .maybeSingle();

        if (existing?.status === "rejected") {
          alert(`@${profile.username} não aceita pedidos de mensagem de momento.`);
          return;
        }
        if (!existing) {
          await db.from("message_requests").insert({
            sender_id: myId,
            receiver_id: profile.id,
            preview_text: "Quero enviar-te uma mensagem.",
            status: "pending",
          });
        }
        alert(
          `Pedido de mensagem enviado a @${profile.username}! Quando aceitar poderás conversar.`,
        );
        return;
      }

      // Criar conversa nova (perm = "todos")
      const { data: conv, error: convErr } = await db
        .from("conversations")
        .insert({ type: "direct" })
        .select("id")
        .single();
      if (convErr || !conv?.id) {
        alert("Erro ao iniciar conversa");
        return;
      }

      await db.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: myId },
        { conversation_id: conv.id, user_id: profile.id },
      ]);

      navigate({ to: "/mensagens" });
    } catch (err) {
      console.error(err);
      alert("Erro ao abrir conversa");
    } finally {
      setOpeningChat(false);
    }
  }

  async function toggleFollow() {
    if (!profile || !myId) return;
    const next = !following;
    setFollowOverride(next);
    setFollowerDelta((d) => d + (next ? 1 : -1));
    try {
      if (!next) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", myId)
          .eq("target_username", username);
      } else {
        await supabase.from("follows").insert({ follower_id: myId, target_username: username });
      }
      qc.invalidateQueries({ queryKey: ["profileStats", username, profile.id, myId] });
    } catch (err) {
      // Reverte em caso de erro
      setFollowOverride(!next);
      setFollowerDelta((d) => d - (next ? 1 : -1));
      console.error(err);
    }
  }

  async function toggleLike(postId: string) {
    if (!myId) return;
    const isLiked = likeOverrides[postId] ?? likedPosts.has(postId);
    setLikeOverrides((prev) => ({ ...prev, [postId]: !isLiked }));
    try {
      if (isLiked) {
        await (supabase as any)
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", myId);
      } else {
        await (supabase as any).from("post_likes").insert({ post_id: postId, user_id: myId });
      }
    } catch (err) {
      setLikeOverrides((prev) => ({ ...prev, [postId]: isLiked }));
      console.error(err);
    }
  }

  const name = profile?.full_name || profile?.username || username;
  const avatarUrl = profile?.avatar_url || null;
  const color = colorFor(username);

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        {/* Header */}
        <header
          className="sticky top-0 z-30 border-b"
          style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}
        >
          <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 h-14 flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/home" })}
              className="p-2 hover:bg-neutral-100 rounded-full transition active:scale-90"
            >
              <ChevronLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            </button>
            <HoodaLogo size="sm" className="lg:hidden" />
            <span
              className="hidden lg:block text-sm font-bold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {name || username}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl lg:max-w-3xl">
          {loadingProfile ? (
            <>
              <ProfileHeaderSkeleton />
              <ProfilePostsSkeleton />
            </>
          ) : !profile ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-8">
              <p className="text-4xl">🔍</p>
              <p className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                Utilizador não encontrado
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                @{username} não existe na hooda
              </p>
              <button
                onClick={() => navigate({ to: "/home" })}
                className="mt-2 px-6 py-2.5 rounded-full text-white font-bold text-sm"
                style={{ background: "#5B3FCF" }}
              >
                Voltar ao início
              </button>
            </div>
          ) : (
            <div className="hooda-fade-in">
              {/* Capa */}
              <div
                className="h-32 relative"
                style={{
                  background: `linear-gradient(135deg,${color} 0%,#1FAFA6 50%,#FFC93C 100%)`,
                }}
              >
                <div className="absolute left-5" style={{ bottom: -42 }}>
                  <div
                    className="rounded-full p-[3px]"
                    style={{
                      background: "linear-gradient(135deg,#5B3FCF 0%,#E94B8A 50%,#FFC93C 100%)",
                    }}
                  >
                    <div className="rounded-full p-[2px] bg-white">
                      <Avatar name={name} size={80} src={avatarUrl} color={color} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões de ação */}
              <div className="flex justify-end gap-2 px-4 pt-3">
                <button
                  onClick={openChat}
                  disabled={openingChat}
                  className="text-sm font-semibold border border-neutral-300 rounded-full px-4 py-1.5 btn-ghost hover:bg-neutral-50 flex items-center gap-1.5 shadow-sm active:scale-95 transition disabled:opacity-60"
                >
                  {openingChat ? (
                    <span
                      className="h-4 w-4 border-2 rounded-full animate-spin inline-block"
                      style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }}
                    />
                  ) : (
                    <MessageCircle className="h-4 w-4" style={{ color: "#5B3FCF" }} />
                  )}
                  {openingChat ? "A abrir..." : "Mensagem"}
                </button>
                <button
                  onClick={toggleFollow}
                  className="text-sm font-bold rounded-full px-5 py-1.5 transition shadow-sm flex items-center gap-1.5 active:scale-95"
                  style={
                    following
                      ? { background: "white", border: "1px solid #d1d1d1", color: "#333" }
                      : { background: "#5B3FCF", color: "white" }
                  }
                >
                  {following ? (
                    <>
                      <UserCheck className="h-4 w-4" /> Seguindo
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Seguir
                    </>
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="px-5 pt-10 pb-3">
                <p className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                  {name}
                </p>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                  @{profile.username}
                </p>
                {profile.bio && (
                  <p
                    className="text-sm mt-2 leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {profile.bio}
                  </p>
                )}
              </div>

              {/* Stats — caixas com tamanho fixo; só o número troca de shimmer para valor real */}
              <div className="grid grid-cols-3 gap-2 px-5 pb-4">
                {[
                  { n: postCount, l: "Publicações" },
                  { n: followerCount, l: "Seguidores" },
                  { n: followingCount, l: "Seguindo" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="stat-card border border-neutral-100 rounded-2xl py-3 text-center shadow-sm"
                  >
                    {statsQuery.isLoading ? (
                      <div className="h-[22px] flex items-center justify-center">
                        <span
                          className="inline-block h-3 w-7 rounded animate-pulse"
                          style={{ background: "var(--surface-2,#e9e9e4)" }}
                        />
                      </div>
                    ) : (
                      <p
                        className="text-lg font-extrabold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtNum(s.n)}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-400 mt-0.5 font-medium">{s.l}</p>
                  </div>
                ))}
              </div>

              {/* Posts — Skeleton enquanto carrega, em paralelo com as stats acima */}
              {loadingPosts ? (
                <ProfilePostsSkeleton />
              ) : posts.length === 0 ? (
                <div className="px-5 py-14 flex flex-col items-center gap-3 text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(91,63,207,0.08)" }}
                  >
                    <BookOpen className="h-7 w-7" style={{ color: "#5B3FCF" }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    {following ? "Ainda não há publicações." : "Segue para ver as publicações."}
                  </p>
                </div>
              ) : (
                <div className="pb-6">
                  {posts.map((post) => {
                    const isLiked = likeOverrides[post.id] ?? likedPosts.has(post.id);
                    return (
                      <article key={post.id} className="hooda-card rounded-none border-b border-neutral-100">
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Avatar name={name} size={40} src={avatarUrl} color={color} />
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold text-sm"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {name}
                            </p>
                            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                              @{profile.username} · {timeAgo(post.createdAt)}
                            </p>
                          </div>
                          <button className="p-1.5 rounded-full hover:bg-neutral-100 transition">
                            <MoreHorizontal className="h-4 w-4 text-neutral-400" />
                          </button>
                        </div>

                        {post.bgColor ? (
                          <div className="px-4 pb-3">
                            <div
                              className="rounded-2xl px-5 py-7 flex items-center justify-center min-h-28"
                              style={{ background: post.bgColor }}
                            >
                              <p className="font-bold text-center leading-snug text-white text-lg">
                                {post.text}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="px-4 pb-3 text-sm leading-relaxed"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {post.text}
                          </p>
                        )}

                        <div className="flex items-center px-3 pb-3 border-t border-neutral-50 pt-2 gap-1">
                          <button
                            onClick={() => toggleLike(post.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 ${isLiked ? "text-red-500" : "hover:bg-neutral-50"}`}
                          >
                            <Heart
                              className={`h-5 w-5 ${isLiked ? "fill-red-500 text-red-500" : "text-neutral-400"}`}
                            />
                          </button>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-50">
                            <CommentIcon className="h-5 w-5 text-neutral-400" />
                          </button>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-50">
                            <Share2 className="h-5 w-5 text-neutral-400" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Denunciar */}
              <div className="px-4 pb-6">
                <button className="w-full h-11 rounded-xl border border-neutral-200 text-neutral-400 text-sm flex items-center justify-center gap-2 hover:bg-neutral-100 shadow-sm">
                  <Flag className="h-4 w-4" /> Denunciar perfil
                </button>
              </div>
            </div>
          )}
        </main>
        <BottomNav />
      </PageWrapper>
    </>
  );
}
