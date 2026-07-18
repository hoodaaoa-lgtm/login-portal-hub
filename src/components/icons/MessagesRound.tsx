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
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
    </svg>
  );
}

export default MessagesRound;
