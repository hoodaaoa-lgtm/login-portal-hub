/** Selo azul de verificado (estilo Instagram) — só aparece se a conta for verificada. */
export function VerifiedBadge({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ flexShrink: 0, display: "inline-block" }} aria-label="Conta verificada">
      <path
        d="M12 2.5l2.4 1.4 2.7-.6 1.4 2.4 2.4 1.4-.6 2.7.6 2.7-2.4 1.4-1.4 2.4-2.7-.6L12 21.5l-2.4-1.4-2.7.6-1.4-2.4-2.4-1.4.6-2.7-.6-2.7 2.4-1.4 1.4-2.4 2.7.6L12 2.5z"
        fill="#3B9EFF"
      />
      <path d="M8.5 12.3l2.2 2.2 4.8-4.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
