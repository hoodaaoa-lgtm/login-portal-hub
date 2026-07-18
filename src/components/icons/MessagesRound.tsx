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
      <path d="M7 1.5 A6 5.4 0 0 1 13 6.9 A6 5.4 0 0 1 9.6 11.8 L 10.3 15 L 6.2 12.2 A6 5.4 0 0 1 1 6.9 A6 5.4 0 0 1 7 1.5 Z" />
      <path d="M17 10 A6 5.4 0 0 1 23 15.4 A6 5.4 0 0 1 18.4 20.6 L 19 23.5 L 14.9 20.5 A6 5.4 0 0 1 11 15.4 A6 5.4 0 0 1 17 10 Z" />
    </svg>
  );
}

export default MessagesRound;
