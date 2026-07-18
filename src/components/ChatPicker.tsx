import { useState } from "react";
import { Search, X } from "lucide-react";
import { VIDEO_STICKERS } from "@/lib/stickers";
import { StickerView } from "@/components/StickerView";

// ── Constantes do chat (partilhadas entre ChatPanel e SalaPanel) ──
export const CHAT_ACCENT   = "#2F6FED";
export const CHAT_PANEL    = "var(--s2)";
export const CHAT_INPUT_BG = "var(--bg-secondary, #f5f5f5)";
export const CHAT_BORDER   = "var(--border, #e5e5e5)";
export const CHAT_TEXT     = "var(--text-primary, #111)";
export const CHAT_MUTED    = "#9ca3af";

export const CHAT_EMOJI_CATS: { key: string; icon: string; emojis: string[] }[] = [
  { key: "freq",  icon: "⏱️", emojis: ["😂","❤️","😍","🤣","😊","🙏","💕","😭","😘","👍","🎉","😅","🔥","🤔","💯","😁","🥰","😢","🤩","😆","🥳","✨","💪","👏","🫂","🤝"] },
  { key: "faces", icon: "😊", emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","🙄","😬","😔","😪","😴","😷","🤒","🥵","🥶","🤯","🤠","🤡","👻","💀","👾","🤖"] },
  { key: "hands", icon: "👋", emojis: ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","✊","👊","🤛","🤜","🤲","🤝","🙏","✍️","💅","💪","🦾","🦵","🦶"] },
  { key: "pets",  icon: "🐾", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦅","🦉","🦋","🐛","🐞","🐬","🐳","🦈","🐊","🌺","🌸"] },
  { key: "food",  icon: "🍕", emojis: ["🍎","🍊","🍋","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🍆","🥑","🥦","🌽","🍕","🍔","🍟","🌭","🌮","🌯","🥙","🥚","🍳","🍣","🍱","🥟","🍦","🍩","🍪","🎂","🍰","🍫","🍬","🍭","☕","🧃","🥤","🧋","🍺","🥂"] },
  { key: "more",  icon: "🚀", emojis: ["🚀","🌈","⭐","🌟","💫","✨","💥","🔥","💯","🎉","🎊","🎁","🏆","🥇","💎","🔮","🌙","☀️","⚡","❄️","🌊","🎸","🎺","🎵","🎶","📱","💻","📷","💡","🔑","❤️‍🔥","💔","❤️","🧡","💛","💚","💙","💜","🤍","🖤"] },
];

export const CHAT_GIFS = [
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

// ── ChatPicker — usado pelo ChatPanel (DMs) e pelo SalaPanel (salas) ──
export function ChatPicker({ tab, setTab, emojiSearch, setEmojiSearch, gifSearch, setGifSearch, gifs, gifLoading, onEmoji, onSticker, onGif }: {
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
        <div className="grid grid-cols-4 gap-2 p-2 pb-3 overflow-y-auto" style={{ maxHeight: 220 }}>
          {VIDEO_STICKERS.map((s) => (
            <button key={s.id} onClick={() => onSticker(s.url)}
              className="flex items-center justify-center rounded-2xl overflow-hidden active:scale-90 transition-all"
              style={{ height: 64, background: CHAT_INPUT_BG }}>
              <StickerView url={s.url} size={64} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
