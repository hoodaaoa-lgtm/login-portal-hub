/**
 * Helper de tradução universal — funciona dentro e fora de componentes React.
 * Importa este ficheiro em qualquer route/componente para ter t() disponível.
 */
import i18n from "@/lib/i18n";
export function t(key: string, opts?: Record<string, unknown>): string {
  return i18n.t(key, opts) as string;
}
export { i18n };
