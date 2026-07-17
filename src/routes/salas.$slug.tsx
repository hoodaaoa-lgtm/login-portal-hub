import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { SideNav, BottomNav, PageWrapper } from "@/components/AppShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { SalaPanel } from "@/components/SalaPanel";

export const Route = createFileRoute("/salas/$slug")({
  head: () => ({ meta: [{ title: "Sala · Snapper" }] }),
  component: SalaPage,
});

/* Esta rota existe para permitir link direto a uma Sala (partilhado, favorito, etc).
   A navegação normal entre Salas dentro de /mensagens usa o mesmo SalaPanel, mas
   troca por estado em vez de vir aqui — ver SalasTabPanel em mensagens.tsx. */
function SalaPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { slug } = useParams({ from: "/salas/$slug" });

  return (
    <>
      <SideNav />
      <PageWrapper noPageScroll>
        <div className="flex flex-col" style={{ height: isMobile ? "calc(100dvh - 62px)" : "100%" }}>
          <SalaPanel slug={slug} onBack={() => navigate({ to: "/mensagens" })} />
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );
}
