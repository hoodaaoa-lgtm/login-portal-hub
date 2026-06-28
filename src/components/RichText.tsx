import { useNavigate } from "@tanstack/react-router";

interface RichTextProps {
  text: string;
  className?: string;
  onHashtagClick?: (tag: string) => void;
}

/**
 * Renderiza texto com:
 * - @menções em roxo clicáveis → vai para /u/username
 * - #hashtags em azul clicáveis → vai para /explorar?q=%23hashtag
 */
export function RichText({ text, className = "", onHashtagClick }: RichTextProps) {
  const navigate = useNavigate();

  // Partir o texto em tokens: normal | @mention | #hashtag
  const parts = text.split(/(@[a-zA-Z0-9_.]{2,30}|#[a-zA-Z0-9_\u00C0-\u024F]{2,50})/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const username = part.slice(1);
          return (
            <span
              key={i}
              className="font-semibold cursor-pointer hover:underline"
              style={{ color: "#5B3FCF" }}
              onClick={(e) => {
                e.stopPropagation();
                navigate({ to: "/u/$username", params: { username } });
              }}
            >
              {part}
            </span>
          );
        }
        if (part.startsWith("#")) {
          const tag = part.slice(1);
          return (
            <span
              key={i}
              className="font-semibold cursor-pointer hover:underline"
              style={{ color: "#1FAFA6" }}
              onClick={(e) => {
                e.stopPropagation();
                if (onHashtagClick) {
                  onHashtagClick(tag);
                } else {
                  navigate({ to: "/explorar", search: { q: `#${tag}` } });
                }
              }}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
