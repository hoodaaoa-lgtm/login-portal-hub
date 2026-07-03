import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import {
  Heart, MessageCircle, Share2, Eye, Plus, Clock,
  X, Image as ImageIcon, Music, BarChart3, Video, Type,
} from "lucide-react";
import i18n from "@/lib/i18n";

function t(key: string, opts?: Record<string, unknown>) {
  return i18n.t(key, opts) as string;
}

export const Route = createFileRoute("/drops")({
  head: () => ({ meta: [{ title: "Hooda - Drops" }] }),
  component: DropsPage,
});

interface Drop {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content_type: "photo" | "video" | "text" | "music" | "poll";
  content_url: string | null;
  text_content: string | null;
  music_url: string | null;
  poll_options?: string[];
  poll_votes?: Record<string, number>;
  duration_hours: number;
  created_at: string;
  expires_at: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  is_liked: boolean;
  is_shared: boolean;
}

interface CreateDropModal {
  open: boolean;
  photo: string | null;
  video: string | null;
  text: string;
  music: string | null;
  duration: number;
  pollOptions: string[];
  contentType: "photo" | "video" | "text" | "music" | "poll" | null;
}

const ACCENT = "#5B3FCF";

function DropsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<CreateDropModal>({
    open: false,
    photo: null,
    video: null,
    text: "",
    music: null,
    duration: 24,
    pollOptions: ["", ""],
    contentType: null,
  });

  // Autenticação
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(session.user.id);
    })();
  }, [navigate]);

  // Feed de Drops com scroll infinito
  const {
    data: dropsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["drops-feed"],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from("drops")
        .select(
          `*,
           profiles!user_id(username, avatar_url),
           drop_interactions(id, interaction_type, user_id)`
        )
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + 9);

      if (error) throw error;

      return (data || []).map((drop: any) => ({
        ...drop,
        username: drop.profiles?.username || "Unknown",
        avatar_url: drop.profiles?.avatar_url,
        is_liked: drop.drop_interactions?.some(
          (i: any) => i.interaction_type === "like" && i.user_id === userId
        ) || false,
        is_shared: drop.drop_interactions?.some(
          (i: any) => i.interaction_type === "share" && i.user_id === userId
        ) || false,
      }));
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === 10 ? pages.length * 10 : undefined,
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  // Deletar Drops expirados automaticamente
  useEffect(() => {
    const interval = setInterval(async () => {
      const { error } = await supabase
        .from("drops")
        .delete()
        .lte("expires_at", new Date().toISOString());

      if (error) console.error("Error deleting expired drops:", error);
    }, 1000 * 60 * 5); // A cada 5 minutos

    return () => clearInterval(interval);
  }, []);

  // Observer para scroll infinito
  const observerTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const drops = dropsData?.pages.flatMap((page) => page) || [];

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1
              className="text-2xl font-extrabold"
              style={{ color: "var(--text-primary)" }}
            >
              ⏳ Drops
            </h1>
            <button
              onClick={() => setCreateModal({ ...createModal, open: true })}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition hover:opacity-80"
              style={{
                background: ACCENT,
                color: "white",
              }}
            >
              <Plus className="w-5 h-5" />
              {t("drops.create", "Criar Drop")}
            </button>
          </div>

          {/* Feed Vertical */}
          <div className="space-y-4">
            {drops.length === 0 ? (
              <div className="text-center py-12">
                <p style={{ color: "var(--text-muted)" }}>
                  {t("drops.no_drops", "Nenhum drop por enquanto")}
                </p>
              </div>
            ) : (
              drops.map((drop) => (
                <DropCard key={drop.id} drop={drop} userId={userId} />
              ))
            )}
          </div>

          {/* Infinite scroll observer */}
          <div ref={observerTarget} className="py-4 text-center">
            {isFetchingNextPage && (
              <p style={{ color: "var(--text-muted)" }}>
                {t("drops.loading", "Carregando...")}
              </p>
            )}
          </div>
        </div>
        <BottomNav />
      </PageWrapper>

      {/* Create Drop Modal */}
      {createModal.open && (
        <CreateDropModal
          modal={createModal}
          setModal={setCreateModal}
          userId={userId}
        />
      )}
    </>
  );
}

function DropCard({ drop, userId }: { drop: Drop; userId: string | null }) {
  const [liked, setLiked] = useState(drop.is_liked);
  const [likeCount, setLikeCount] = useState(drop.likes_count);
  const timeLeft = getTimeLeft(drop.expires_at);

  const handleLike = useCallback(async () => {
    if (!userId) return;

    if (liked) {
      setLiked(false);
      setLikeCount(Math.max(0, likeCount - 1));
      await supabase
        .from("drop_interactions")
        .delete()
        .match({
          drop_id: drop.id,
          user_id: userId,
          interaction_type: "like",
        });
    } else {
      setLiked(true);
      setLikeCount(likeCount + 1);
      await supabase.from("drop_interactions").insert({
        drop_id: drop.id,
        user_id: userId,
        interaction_type: "like",
      });
    }
  }, [liked, likeCount, drop.id, userId]);

  return (
    <div
      className="rounded-3xl p-5 shadow-sm overflow-hidden"
      style={{
        background: "var(--s0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: ACCENT }}
          >
            {drop.avatar_url ? (
              <img
                src={drop.avatar_url}
                alt=""
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              drop.username[0]?.toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {drop.username}
            </p>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" style={{ color: ACCENT }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {timeLeft}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mb-4 rounded-2xl overflow-hidden bg-black/5">
        {drop.content_type === "photo" && drop.content_url && (
          <img
            src={drop.content_url}
            alt="Drop"
            className="w-full h-64 object-cover"
          />
        )}
        {drop.content_type === "video" && drop.content_url && (
          <video
            src={drop.content_url}
            controls
            className="w-full h-64 object-cover"
          />
        )}
        {drop.content_type === "text" && drop.text_content && (
          <div className="p-6 text-center">
            <p
              className="text-lg font-medium break-words"
              style={{ color: "var(--text-primary)" }}
            >
              {drop.text_content}
            </p>
          </div>
        )}
        {drop.content_type === "music" && drop.music_url && (
          <div className="p-6 text-center flex items-center justify-center gap-3">
            <Music className="w-8 h-8" style={{ color: ACCENT }} />
            <audio src={drop.music_url} controls className="flex-1" />
          </div>
        )}
        {drop.content_type === "poll" && drop.poll_options && (
          <div className="p-6 space-y-2">
            {drop.poll_options.map((option, idx) => {
              const votes = drop.poll_votes?.[idx] || 0;
              const totalVotes =
                Object.values(drop.poll_votes || {}).reduce(
                  (a, b) => (a as number) + (b as number),
                  0
                ) || 1;
              const percentage = Math.round((votes / totalVotes) * 100);

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-primary)" }}>
                      {option}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {percentage}%
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full"
                    style={{ background: "var(--border-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        background: ACCENT,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-around text-xs mb-3 px-2">
        <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Eye className="w-4 h-4" />
          <span>{drop.views_count}</span>
        </div>
        <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Heart className="w-4 h-4" />
          <span>{likeCount}</span>
        </div>
        <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <MessageCircle className="w-4 h-4" />
          <span>{drop.comments_count}</span>
        </div>
        <div className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Share2 className="w-4 h-4" />
          <span>{drop.shares_count}</span>
        </div>
      </div>

      {/* Interaction buttons */}
      <div className="flex items-center justify-around gap-2">
        <button
          onClick={handleLike}
          className="flex-1 py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 font-medium text-sm"
          style={{
            background: liked ? `${ACCENT}20` : "var(--s2)",
            color: liked ? ACCENT : "var(--text-secondary)",
          }}
        >
          <Heart className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
          {t("drops.like", "Curtir")}
        </button>
        <button
          className="flex-1 py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 font-medium text-sm"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}
        >
          <MessageCircle className="w-5 h-5" />
          {t("drops.comment", "Comentar")}
        </button>
        <button
          className="flex-1 py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 font-medium text-sm"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}
        >
          <Share2 className="w-5 h-5" />
          {t("drops.share", "Partilhar")}
        </button>
      </div>
    </div>
  );
}

interface CreateDropModalProps {
  modal: CreateDropModal;
  setModal: (modal: CreateDropModal) => void;
  userId: string | null;
}

function CreateDropModal({ modal, setModal, userId }: CreateDropModalProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!userId || !modal.contentType) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("drops").insert({
        user_id: userId,
        content_type: modal.contentType,
        content_url: modal.photo || modal.video,
        text_content: modal.text,
        music_url: modal.music,
        duration_hours: modal.duration,
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + modal.duration * 60 * 60 * 1000
        ).toISOString(),
        poll_options: modal.pollOptions,
        likes_count: 0,
        comments_count: 0,
        shares_count: 0,
        views_count: 0,
      });

      if (error) throw error;

      setModal({
        open: false,
        photo: null,
        video: null,
        text: "",
        music: null,
        duration: 24,
        pollOptions: ["", ""],
        contentType: null,
      });
    } catch (err) {
      console.error("Error creating drop:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--s0)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {t("drops.create_drop", "Criar Drop")}
          </h2>
          <button
            onClick={() =>
              setModal({
                ...modal,
                open: false,
              })
            }
            className="w-8 h-8 rounded-full flex items-center justify-center transition hover:opacity-70"
            style={{ background: "var(--s2)" }}
          >
            <X className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Content Type Selection */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { type: "photo" as const, icon: ImageIcon, label: t("drops.photo", "Foto") },
            { type: "video" as const, icon: Video, label: t("drops.video", "Vídeo") },
            { type: "text" as const, icon: Type, label: t("drops.text", "Texto") },
            { type: "music" as const, icon: Music, label: t("drops.music", "Música") },
            { type: "poll" as const, icon: BarChart3, label: t("drops.poll", "Enquete") },
          ].map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() =>
                setModal({ ...modal, contentType: type })
              }
              className="py-3 px-4 rounded-xl transition flex flex-col items-center gap-2"
              style={{
                background:
                  modal.contentType === type
                    ? `${ACCENT}20`
                    : "var(--s2)",
                border:
                  modal.contentType === type
                    ? `2px solid ${ACCENT}`
                    : "none",
              }}
            >
              <Icon className="w-6 h-6" style={{ color: ACCENT }} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Duration */}
        <div className="mb-6">
          <p
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            {t("drops.duration", "Duração")}
          </p>
          <select
            value={modal.duration}
            onChange={(e) =>
              setModal({ ...modal, duration: parseInt(e.target.value) })
            }
            className="w-full px-4 py-2 rounded-xl"
            style={{
              background: "var(--s2)",
              color: "var(--text-primary)",
              border: `1px solid var(--border-subtle)`,
            }}
          >
            <option value={6}>{t("drops.6_hours", "6 horas")}</option>
            <option value={12}>{t("drops.12_hours", "12 horas")}</option>
            <option value={24}>{t("drops.24_hours", "24 horas")}</option>
          </select>
        </div>

        {/* Content Input */}
        {modal.contentType === "text" && (
          <textarea
            value={modal.text}
            onChange={(e) => setModal({ ...modal, text: e.target.value })}
            placeholder={t("drops.text_placeholder", "Escreve algo...")}
            className="w-full px-4 py-3 rounded-xl mb-6 resize-none"
            style={{
              background: "var(--s2)",
              color: "var(--text-primary)",
              border: `1px solid var(--border-subtle)`,
            }}
            rows={4}
          />
        )}

        {modal.contentType === "poll" && (
          <div className="space-y-3 mb-6">
            {modal.pollOptions.map((option, idx) => (
              <input
                key={idx}
                type="text"
                value={option}
                onChange={(e) => {
                  const newOptions = [...modal.pollOptions];
                  newOptions[idx] = e.target.value;
                  setModal({ ...modal, pollOptions: newOptions });
                }}
                placeholder={t("drops.option", `Opção ${idx + 1}`)}
                className="w-full px-4 py-2 rounded-xl"
                style={{
                  background: "var(--s2)",
                  color: "var(--text-primary)",
                  border: `1px solid var(--border-subtle)`,
                }}
              />
            ))}
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={loading || !modal.contentType}
          className="w-full py-3 px-4 rounded-xl font-semibold transition disabled:opacity-50 text-white"
          style={{ background: ACCENT }}
        >
          {loading
            ? t("drops.creating", "Criando...")
            : t("drops.create_button", "Criar Drop")}
        </button>
      </div>
    </div>
  );
}

function getTimeLeft(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();

  if (diff <= 0) return "Expirado";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}