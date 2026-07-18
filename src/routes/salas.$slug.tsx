import { createFileRoute, redirect } from "@tanstack/react-router";

/* Link direto a uma Sala (partilhado, favorito, etc.) — em vez de abrir a
   Sala sozinha numa página isolada (sem a caixa de conversas/salas ao
   lado), redireciona sempre para dentro de /mensagens, que já sabe abrir
   a Sala certa (via ?sala=slug) mantendo a lista visível, tal como a
   navegação normal entre Salas. */
export const Route = createFileRoute("/salas/$slug")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/mensagens", search: { sala: params.slug } });
  },
});
