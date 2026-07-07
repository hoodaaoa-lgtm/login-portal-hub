import { useNavigate } from "@tanstack/react-router";

interface RichTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  onHashtagClick?: (tag: string) => void;
}

/**
 * Renderiza texto com deteção automática e elementos clicáveis:
 * - @menções em roxo → vai para /u/username
 * - #hashtags em teal → vai para /explorar?q=%23hashtag
 * - links (http/https/www.) em azul → abrem em nova aba
 * - emails → abrem o cliente de email (mailto:)
 * - telefones (+244..., ou números com 8+ dígitos) → abrem o discador (tel:)
 */

// Um único regex combinado, para que os tokens nunca se sobreponham
// (ex.: um número de telefone dentro de um link não é apanhado duas vezes).
const TOKEN_RE = new RegExp(
  [
    "(https?:\\/\\/[^\\s<]+)",                          // 1: link com protocolo
    "(www\\.[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}(?:[^\\s<]*)?)", // 2: link começado por www.
    "([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})", // 3: email
    "(\\+?\\d[\\d\\s()-]{7,}\\d)",                       // 4: telefone (+244..., ou nacional)
    "(@[a-zA-Z0-9_.]{2,30})",                            // 5: menção
    "(#[a-zA-Z0-9_\\u00C0-\\u024F]{2,50})",              // 6: hashtag
  ].join("|"),
  "g"
);

export function RichText({ text, className = "", style, onHashtagClick }: RichTextProps) {
  const navigate = useNavigate();
  const raw = text ?? "";

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(raw)) !== null) {
    if (match.index > lastIndex) nodes.push(<span key={key++}>{raw.slice(lastIndex, match.index)}</span>);
    const [full, link, www, email, phone, mention, hashtag] = match;

    if (link || www) {
      const href = link || `https://${www}`;
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer nofollow"
          className="font-medium underline decoration-1 underline-offset-2 break-all"
          style={{ color: "#3B82F6" }}
          onClick={(e) => e.stopPropagation()}>
          {full}
        </a>
      );
    } else if (email) {
      nodes.push(
        <a key={key++} href={`mailto:${email}`}
          className="font-medium underline decoration-1 underline-offset-2"
          style={{ color: "#3B82F6" }}
          onClick={(e) => e.stopPropagation()}>
          {email}
        </a>
      );
    } else if (phone) {
      const digits = phone.replace(/[\s()-]/g, "");
      nodes.push(
        <a key={key++} href={`tel:${digits}`}
          className="font-medium underline decoration-1 underline-offset-2"
          style={{ color: "#3B82F6" }}
          onClick={(e) => e.stopPropagation()}>
          {phone}
        </a>
      );
    } else if (mention) {
      const username = mention.slice(1);
      nodes.push(
        <span key={key++} className="font-semibold cursor-pointer hover:underline" style={{ color: "#5B3FCF" }}
          onClick={(e) => { e.stopPropagation(); navigate({ to: "/u/$username", params: { username } }); }}>
          {mention}
        </span>
      );
    } else if (hashtag) {
      const tag = hashtag.slice(1);
      nodes.push(
        <span key={key++} className="font-semibold cursor-pointer hover:underline" style={{ color: "#1FAFA6" }}
          onClick={(e) => {
            e.stopPropagation();
            if (onHashtagClick) onHashtagClick(tag);
            else navigate({ to: "/explorar", search: { q: `#${tag}` } });
          }}>
          {hashtag}
        </span>
      );
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < raw.length) nodes.push(<span key={key++}>{raw.slice(lastIndex)}</span>);

  return <span className={className} style={style}>{nodes}</span>;
}
