import React, { useState } from "react";
import {
  X, Bell, Heart, MessageCircle, UserPlus,
  Share2, AtSign, Megaphone, CheckCheck,
} from "lucide-react";

const ACCENT = "#5B3FCF";

export type NotifType =
  | "follow" | "like" | "comment" | "mention"
  | "message"
  | "share" | "system" | "video_new" | "video_like"
  | "video_comment";

export interface Notif {
  id: number;
  type: NotifType;
  user: string;
  name: string;
  color: string;
  text: string;
  detail?: string;
  time: string;
  read: boolean;
}

export const SAMPLE_NOTIFICATIONS: Notif[] = [];

function notifIcon(type: NotifType) {
  const cls = "h-3 w-3";
  switch (type) {
    case "follow":       return <UserPlus className={cls} />;
    case "like":         return <Heart className={cls} />;
    case "comment":      return <MessageCircle className={cls} />;
    case "mention":      return <AtSign className={cls} />;
    case "message":      return <MessageCircle className={cls} />;
    case "share":        return <Share2 className={cls} />;
    case "system":       return <Megaphone className={cls} />;
    case "video_new":    return <span className={cls} style={{fontSize:10}}>▶</span>;
    case "video_like":   return <Heart className={cls} />;
    case "video_comment": return <MessageCircle className={cls} />;
  }
}

function notifBg(type: NotifType) {
  switch (type) {
    case "follow":       return "#5B3FCF";
    case "like":         return "#E94B8A";
    case "comment":      return "#F26B3A";
    case "mention":      return "#1FAFA6";
    case "message":      return "#5B3FCF";
    case "share":        return "#F26B3A";
    case "system":       return "#5B3FCF";
  }
}

function Avatar({ name, color, size = 38 }: { name: string; color: string; size?: number }) {
  return (
    <div
      style={{
        background: color,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {name[0].toUpperCase()}
    </div>
  );
}

/* ─── Toast popup ─── */
export function NotificationToast({ notif, onClose }: { notif: Notif; onClose: () => void }) {
  return (
    <div
      className="fixed z-[999] flex items-start gap-3 p-3 rounded-2xl shadow-2xl max-w-[calc(100vw-32px)] w-80"
      style={{
        bottom: 80,
        right: 16,
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(91,63,207,0.12)",
        animation: "slideInRight 0.3s ease",
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      <div className="relative flex-shrink-0">
        <Avatar name={notif.name} color={notif.color} size={38} />
        <div
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white border-2 border-white"
          style={{ background: notifBg(notif.type) }}
        >
          {notifIcon(notif.type)}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-black leading-tight">{notif.name}</p>
        <p className="text-xs text-neutral-500 leading-snug mt-0.5 truncate">{notif.text}</p>
        {notif.detail && (
          <p className="text-xs text-neutral-400 mt-0.5 truncate italic">"{notif.detail}"</p>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition flex-shrink-0 mt-0.5"
      >
        <X className="h-3 w-3 text-neutral-500" />
      </button>
    </div>
  );
}

/* ─── Notification Center panel ─── */
export function NotificationCenter({
  notifications,
  onClose,
  onMarkAll,
  loading = false,
}: {
  notifications: Notif[];
  onClose: () => void;
  onMarkAll: () => void;
  loading?: boolean;
}) {
  const [tab, setTab] = useState<"todas" | "nao_lidas">("todas");

  const unreadCount = notifications.filter((n) => !n.read).length;
  const list = tab === "nao_lidas" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/40"
        style={{ backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />

      {/* Panel — centrado no desktop, full-width em mobile */}
      <div
        className="fixed z-[201] hooda-modal-sheet shadow-2xl flex flex-col overflow-hidden"
        style={{
          /* Desktop: centrado no topo com largura fixa */
          top: "60px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(560px, calc(100vh - 80px))",
          borderRadius: "16px",
          border: "1px solid rgba(0,0,0,0.08)",
          animation: "dropIn 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <style>{`
          @keyframes dropIn {
            from { transform: translateX(-50%) translateY(-8px); opacity: 0; }
            to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
          }
          .notif-item:hover { background: #f9f7ff; }
        `}</style>

        {/* Header */}
        <div className="px-4 pt-4 pb-0 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[15px] text-black tracking-tight">Notificações</span>
              {unreadCount > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
                  style={{ background: "#E94B8A" }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAll}
                  className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
                  style={{ color: ACCENT, background: ACCENT + "12" }}
                >
                  <CheckCheck className="h-3 w-3" /> Marcar todas
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition"
              >
                <X className="h-3.5 w-3.5 text-neutral-500" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-5">
            {(["todas", "nao_lidas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-[13px] font-semibold pb-2.5 transition-colors"
                style={{
                  color: tab === t ? ACCENT : "#9CA3AF",
                  borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                }}
              >
                {t === "todas" ? "Todas" : `Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading && list.length === 0 ? (
            <ul className="hooda-fade-in">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3 border-b border-neutral-50 animate-pulse">
                  <div className="w-10 h-10 rounded-full" style={{ background: "var(--surface-2,#eee)" }} />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-3/4 rounded-full" style={{ background: "var(--surface-2,#eee)" }} />
                    <div className="h-3 w-1/2 rounded-full" style={{ background: "var(--surface-2,#eee)" }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: ACCENT + "10" }}
              >
                <Bell className="h-5 w-5" style={{ color: ACCENT }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-700">
                  {tab === "nao_lidas" ? "Tudo lido!" : "Nenhuma notificação"}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {tab === "nao_lidas"
                    ? "Estás em dia com tudo."
                    : "Quando houver novidades, aparecem aqui."}
                </p>
              </div>
            </div>
          ) : (
            <ul className="hooda-fade-in">
              {list.map((notif, i) => (
                <li key={notif.id} className={i < list.length - 1 ? "border-b border-neutral-50" : ""}>
                  <button
                    className="notif-item w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{ background: notif.read ? "transparent" : ACCENT + "07" }}
                  >
                    {/* Avatar + badge */}
                    <div className="relative flex-shrink-0 mt-0.5">
                      <Avatar name={notif.name} color={notif.color} size={38} />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-white border-2 border-white"
                        style={{ background: notifBg(notif.type) }}
                      >
                        {notifIcon(notif.type)}
                      </div>
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug text-black">
                        <span className="font-semibold">{notif.name}</span>{" "}
                        <span className="text-neutral-600">{notif.text}</span>
                      </p>
                      {notif.detail && (
                        <p className="text-xs text-neutral-400 mt-0.5 italic line-clamp-1">
                          "{notif.detail}"
                        </p>
                      )}
                      <p
                        className="text-[11px] mt-0.5 font-medium"
                        style={{ color: notif.read ? "#9CA3AF" : ACCENT }}
                      >
                        {notif.time}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: ACCENT }}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
