import React from "react";

/**
 * Ícone de "mensagens" com balões redondos/ovais (em vez dos balões quadrados
 * do lucide `MessagesSquare`). Segue a mesma assinatura de props dos ícones
 * lucide-react para poder ser usado como substituto direto (className,
 * strokeWidth, etc.).
 */
export function MessagesRound({
  className,
  strokeWidth = 1.9,
  color = "currentColor",
  size,
  ...rest
}: React.SVGProps<SVGSVGElement> & { strokeWidth?: number; size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M8 1 A7 6 0 0 1 15 7 A7 6 0 0 1 8 13 A7 6 0 0 1 5.61 12.64 L 2.5 18 L 1.94 10 A7 6 0 0 1 1 7 A7 6 0 0 1 8 1 Z" />
      <path d="M15 8.7 A6 5.3 0 0 1 21 14 A6 5.3 0 0 1 18 18.59 L 19 23 L 13.96 19.22 A6 5.3 0 0 1 9 14 A6 5.3 0 0 1 15 8.7 Z" />
    </svg>
  );
}

export default MessagesRound;
