# Plano de Execução

O pedido cobre ~30 sistemas grandes (analytics, player adaptativo multi-qualidade, algoritmo de recomendação, transcodificação, legendas, PiP, etc.). Não é possível entregar tudo numa só execução sem ficar cheio de bugs e dados falsos — exatamente o que pediste para evitar. Vou entregar em **3 fases reais e funcionais**, cada uma 100% testada antes de avançar.

---

## FASE 1 — AGORA (esta execução)

**1. Bloqueio em tempo real (prioridade absoluta)**
- Quando bloqueias alguém: a pessoa bloqueada recebe **em tempo real** (Supabase Realtime na tabela `blocked_users`) um aviso "Foste bloqueado por este utilizador" no chat aberto.
- Input de mensagem desativado instantaneamente, sem precisar de recarregar.
- RLS já rejeita o INSERT (feito na migração anterior) — agora a UI reflete isso ao vivo.
- Quando desbloqueias, o aviso desaparece em tempo real.

**2. Hooda Studio — Dashboard real**
- Substituir números falsos por queries reais a `videos`, `follows`, `post_likes`:
  - Visualizações totais, 24h, 7d, 28d (via `videos.views_count` + `videos.published_at`)
  - Seguidores ganhos/perdidos (via `follows.created_at`)
  - Top 5 vídeos mais vistos
  - Vídeos em crescimento (views últimos 7d vs 7d anteriores)
- Realtime na tabela `videos` e `follows` — números atualizam ao vivo.

**3. Sistema de seguir canais (realtime)**
- Botão Seguir/Deixar de seguir no canal: insert/delete em `follows` + contador atualiza ao vivo via Realtime.

---

## FASE 2 — Próxima execução (quando aprovares Fase 1)

- Upload com barra de progresso real + estados (processando/publicado/privado/agendado)
- HoodaTV integrado: novos vídeos aparecem ao vivo na home, canal, pesquisa
- Likes e comentários em vídeos com realtime
- Algoritmo de recomendação (fórmula que pediste)

---

## FASE 3 — Execução final

- Player com seletor de qualidade (requer transcodificação no upload — vou usar HLS adaptativo se o vídeo for grande, ou fallback single-quality)
- Velocidade 0.25x–2x, PiP, mini-player, ecrã completo
- Analytics avançado (por hora/dia/país/dispositivo) — requer tabela nova `video_views` para registar cada view
- Paginação + lazy loading nas listagens

---

## Detalhes técnicos da Fase 1

**Migração SQL:**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_users, public.follows, public.videos;`
- `REPLICA IDENTITY FULL` nessas tabelas para receber a row apagada nos eventos DELETE.

**`src/routes/mensagens.tsx` (ChatPanel):**
- Subscrever `blocked_users` filtrado por `blocker_id=eq.{otherUserId},blocked_id=eq.{me}` → atualiza `iAmBlockedBy` ao vivo.
- Subscrever também `blocker_id=eq.{me}` → atualiza `isBlocked` ao vivo.

**`src/routes/studio.index.tsx`:**
- Reescrever com queries reais agrupadas por período + subscrição Realtime em `videos` do canal.

**`src/lib/channel-queries.ts`:**
- Adicionar `followersCountQuery`, `followMutation`, `unfollowMutation`.

---

Confirma para eu executar a Fase 1 agora. Diz **"sim"** ou **"avança"** e eu faço tudo de uma vez sem mais perguntas.
