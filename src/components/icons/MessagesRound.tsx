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
      viewBox="-1 0 25 24"
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
      <path d="M9.83 13.65 L9.57 13.70 L9.31 13.74 L9.05 13.76 L8.78 13.79 L8.52 13.80 L8.26 13.80 L7.99 13.79 L7.73 13.78 L7.47 13.76 L7.20 13.72 L6.95 13.68 L6.69 13.63 L6.43 13.58 L6.18 13.51 L5.93 13.43 L5.68 13.35 L5.44 13.26 L5.20 13.16 L4.97 13.05 L4.74 12.94 L4.51 12.81 L4.29 12.68 L4.08 12.55 L3.87 12.40 L3.67 12.25 L3.48 12.09 L3.29 11.93 L3.11 11.76 L2.99 11.64 L-0.50 13.04 L2.19 10.62 L1.78 9.85 L1.49 9.03 L1.33 8.18 L1.31 7.33 L1.42 6.48 L1.66 5.65 L2.02 4.85 L2.51 4.12 L3.11 3.44 L3.80 2.85 L4.59 2.34 L5.44 1.94 L6.35 1.65 L7.29 1.46 L8.26 1.40 L9.22 1.45 L10.17 1.62 L11.08 1.91 L11.94 2.30 L12.73 2.80 L13.43 3.38 L14.04 4.05 L14.54 4.79 L14.92 5.57 L15.17 6.40 L15.29 7.25 L15.28 8.11 L15.13 8.95 L14.87 9.74" />
      <path d="M19.07 19.87 L18.50 20.15 L17.90 20.37 L17.28 20.54 L16.64 20.65 L15.99 20.70 L15.35 20.69 L14.70 20.61 L14.07 20.48 L13.46 20.29 L12.87 20.05 L12.32 19.75 L11.80 19.40 L11.33 19.01 L10.90 18.57 L10.53 18.10 L10.22 17.59 L9.97 17.06 L9.78 16.51 L9.66 15.95 L9.60 15.37 L9.62 14.80 L9.70 14.23 L9.85 13.67 L10.06 13.12 L10.34 12.60 L10.67 12.11 L11.06 11.65 L11.51 11.23 L12.00 10.85 L12.53 10.53 L13.10 10.25 L13.70 10.03 L14.32 9.86 L14.96 9.75 L15.61 9.70 L16.25 9.71 L16.90 9.79 L17.53 9.92 L18.14 10.11 L18.73 10.35 L19.28 10.65 L19.80 11.00 L20.27 11.39 L20.70 11.83 L21.07 12.30 L21.38 12.81 L21.63 13.34 L21.82 13.89 L21.94 14.45 L22.00 15.03 L21.98 15.60 L21.90 16.17 L21.75 16.73 L21.54 17.28 L21.26 17.80 L20.93 18.29 L20.54 18.75 L20.45 18.84 L22.15 21.86 Z" />
    </svg>
  );
}

export default MessagesRound;
