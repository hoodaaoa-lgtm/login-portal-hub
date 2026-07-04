# Redesign global estilo X (Twitter)

Vou refazer o shell de layout e aplicá-lo de forma idêntica em todas as páginas, sem tocar em lógica de dados, auth ou funcionalidades. Toda a paleta e modo claro/escuro mantêm-se.

## 1. Novo shell partilhado (`src/components/AppShell.tsx`)

Três colunas fixas, iguais em todas as páginas:

```text
┌──────────┬──────────────────────┬──────────────┐
│ Sidebar  │  Coluna central      │  Sidebar     │
│ 275px    │  600px               │  350px       │
│ (fixa)   │  (sticky header)     │  (fixa)      │
│ nav +    │  conteúdo da página  │  pesquisa +  │
│ botão    │                      │  sugestões + │
│ Publicar │                      │  tendências  │
│ + avatar │                      │              │
└──────────┴──────────────────────┴──────────────┘
```

- `<XShell>` novo wrapper: sidebar esquerda + `<main>` central 600px + `<RightRail>` à direita, tudo dentro de `max-w-[1290px] mx-auto`.
- Sidebar esquerda: logo, nav vertical (Home, Explorar, Drops, Mensagens, Notificações, Perfil), botão "Publicar" grande arredondado com gradiente da marca, e no fundo cartão com avatar + nome + `@handle` que abre `UserDrawer`.
- Em tablet (`md`–`lg`): sidebar reduz a 72px, só ícones + botão redondo.
- Em mobile (`<md`): sidebar desaparece, bottom nav fixa (Home, Explorar, Drops, Mensagens, Menu) igual à atual, mais FAB "Publicar" acima da bottom nav.
- `<PageHeader title actions tabs?>` sticky no topo da coluna central com blur/translúcido, tabs opcionais com indicador por baixo (estilo X).
- `<RightRail context?>` componente único que combina pesquisa + sugestões (via `RightSidebar` atual) + bloco contextual opcional por página (ex: tendências no Home, info do canal em `/canal/$handle`).

## 2. Aplicar o shell em todas as rotas

Substituir `PageWrapper`/`FeedLayout` por `<XShell>` + `<PageHeader>` nas rotas:

- `/home`, `/explorar`, `/drops`, `/mensagens`, `/perfil`, `/u/$username`, `/canal/$handle`, `/post/$id`, `/livros`, `/definicoes`

Studio (`/studio/*`) mantém o seu próprio layout interno (tem sidebar própria de gestão), mas o header top-level passa a partilhar o mesmo estilo visual.

## 3. Componentes visuais alinhados ao X

- **Post card**: sem borda; separação só por `border-b` subtil; avatar 40px à esquerda; header inline (nome bold + `@user` + `·` + tempo); ações em baixo (comentar, republicar, gostar, guardar, partilhar) em cinza `text-muted` que ganham a cor da marca no hover.
- **Botão Publicar**: pill, `bg-[#5B3FCF]`, `text-white`, `font-bold`, largura total na sidebar / redondo (56px) no mobile.
- **Tabs**: `border-b` no container, item ativo com pill de texto bold + barra 4px por baixo em `#5B3FCF`.
- **Pesquisa**: input arredondado (`rounded-full`), fundo `--s1`, ícone `Search` à esquerda, presente na `RightRail` de todas as páginas.
- **Modais / dialogs**: já ajustados; confirmar `rounded-2xl` e overlay `bg-black/60 backdrop-blur-sm`.
- **Hover states**: `hover:bg-[var(--s1)]` em items de nav e ações; transições `150ms`.

## 4. Tokens / estilos globais (`src/styles.css`)

Adicionar utilitários:
- `.x-sticky-header` (sticky top, `backdrop-blur`, `bg-[var(--surface-0)]/80`, `border-b`)
- `.x-hover-row` (hover cinza subtil usado no post card e nos items de nav)
- `.x-divider` (border-b uniforme entre posts)

Nada muda na paleta nem nas variáveis `--surface/--text/--border` existentes.

## 5. Responsividade

- `<md` (mobile): 1 coluna, bottom nav + FAB Publicar; sem coluna direita.
- `md`–`lg` (tablet): sidebar 72px só ícones; sem coluna direita.
- `≥lg`: 3 colunas completas, coluna direita a partir de `xl` (≥1280px) sempre que houver espaço.

## 6. Preservado sem alterações

- Paleta (`#5B3FCF`, `#E94B8A`, `#F26B3A`, `#1FAFA6`, `#6BA547`, `#FFC93C`).
- Modo claro/escuro e todas as vars `--surface/--text/--border`.
- Toda a lógica: queries, mutations, RLS, autenticação, agendamento de posts, Studio, uploads.
- Textos e nomes pt-AO.

## 7. Verificação

- `bunx tsgo --noEmit` no final para garantir zero erros de tipo.
- Playwright em desktop (1280) e mobile (390) a percorrer `/home`, `/explorar`, `/drops`, `/mensagens`, `/perfil`, `/post/$id`, `/canal/$handle` para confirmar que todas as páginas seguem o mesmo padrão.

## Ficheiros afetados (aprox.)

- `src/components/AppShell.tsx` — reescrito (novo `XShell`, `PageHeader`, `RightRail`, mantém `SideNav`/`BottomNav` compatíveis).
- `src/components/RightSidebar.tsx` — ajustar para caber no novo `RightRail`.
- `src/styles.css` — 3 novas utility classes.
- ~10 ficheiros em `src/routes/*.tsx` — trocar wrapper e header pelo novo shell.
- Zero alterações em ficheiros Supabase, migrations ou `src/integrations/`.

Confirma para eu avançar (ou diz o que queres ajustar no plano).
