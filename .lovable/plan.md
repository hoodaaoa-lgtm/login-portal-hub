# IA da Hooda — plano em fases

O que pediste é o motor completo de uma plataforma tipo TikTok/YouTube (recomendação, análise multimodal, moderação, monetização, analytics). Não é algo que se ligue "de uma vez" num só passo — envolve modelos de visão, áudio, embeddings, ranking, moderação, infra de eventos e vários painéis. Se eu tentar fazer tudo num turno vais ficar com muita coisa meio-feita e nada a funcionar em produção.

Proponho construir por **fases**, cada uma entregando algo funcional a correr sem erros. Começamos já pela Fase 1, e vamos avançando à medida que aprovas.

## Fase 1 — Fundação de sinais + perfil de interesses (já)

O que fica a funcionar:
- Tabela `user_events` (view, dwell, click, like, comment, share, save, follow, search, profile_visit, channel_visit, hide, report) com timestamp, contexto, referrer.
- Reforçar `post_impressions` e `user_interests` (já existem).
- Perfil dinâmico por utilizador: pontuação por categoria com decaimento temporal (curto/médio/longo prazo).
- Hook `useTrackEvent` no cliente para registar tudo em fire-and-forget.
- RPC `get_user_interest_profile(user_id)` a devolver top categorias.

Backend: migração SQL + funções + edge cron para recalcular perfis (a cada X minutos).

## Fase 2 — Classificação automática de conteúdo (texto → vídeo)

- Taxonomia global (`content_categories`) com as categorias que listaste + subcategorias.
- Ao publicar um post: server function chama Lovable AI (`google/gemini-2.5-flash`) para classificar título+descrição+hashtags → categorias com percentagens, palavras-chave, entidades, sentimento.
- Guardar em `post_classifications`.
- Para vídeo/imagem: numa 2ª etapa usar Gemini multimodal (frames + transcrição) — mais caro, faz sentido correr assíncrono em worker.

## Fase 3 — Embeddings + pesquisa semântica

- `pgvector` + `post_embeddings` (Gemini embedding-001, 3072 dim).
- Embedding do post à publicação, embedding da query na pesquisa.
- `search_posts_semantic(query, k)` combina full-text + vetorial.
- Base para "conteúdo semelhante" e descoberta.

## Fase 4 — Motor de ranking do feed

- Score = `w1·afinidade_interesse + w2·qualidade + w3·frescura + w4·diversidade − w5·penalizações`.
- Composição adaptativa 40/30/20/10 (interesses / seguidos / descoberta / tendências).
- Exploration bonus para criadores novos (dar chance inicial durante N impressões).
- RPC `get_personalized_feed(user_id, cursor)`.

## Fase 5 — Qualidade de conteúdo

- `content_quality` por post: qualidade técnica (resolução/duração/áudio via metadata), engajamento (retenção, shares, saves), originalidade (hash perceptual + similaridade de embedding), satisfação (hide/report ratio).
- Score final 0-100 que entra no ranking.

## Fase 6 — Moderação e conteúdo sensível

- Classificação automática (seguro / sensível / nudez / violência / spam / golpe) via Lovable AI.
- Blur + aviso "conteúdo sensível" na UI com botões "Ver" / "Ocultar semelhantes".
- Aprender com a escolha do utilizador (feedback loop no perfil).
- Detecção de spam: bots, publicações repetidas, redes coordenadas.

## Fase 7 — Analytics para criadores (expandir studio.estatisticas)

- Tempo médio assistido, retenção por segundo, origem do tráfego, categorias da audiência, seguidores ganhos por dia.

## Fase 8 — Monetização

- Programa de criadores, assinaturas, gorjetas, conteúdo premium, marketplace. Requer Stripe/Paddle — pergunto qual quando chegarmos aqui.

## Detalhes técnicos (para referência)

- Tudo em `createServerFn` (TanStack) + Supabase, IA via Lovable AI Gateway (sem chaves adicionais).
- Trabalhos pesados (classificação de vídeo, embeddings) em edge functions chamadas por cron ou triggers, não no request do utilizador.
- Nada bloqueia a UI; tudo fire-and-forget do lado do cliente.
- Modelos: `google/gemini-2.5-flash` (classificação/texto), `google/gemini-2.5-pro` (vídeo/multimodal), `google/gemini-embedding-001` (vetores).

## Confirma antes de eu avançar

1. **Ok começar pela Fase 1** (sinais + perfil de interesses) neste turno?
2. Alguma fase que queres saltar, adiar, ou pôr à frente?
3. Para vídeo/imagem multimodal (Fase 2b), consumirá créditos de IA por cada upload — ok avançar assim ou preferes só texto no início?
