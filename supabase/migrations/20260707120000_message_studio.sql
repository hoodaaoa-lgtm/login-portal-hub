-- ─────────────────────────────────────────────────────────────
-- MESSAGE STUDIO — mensagens de texto com estilo visual (fonte,
-- cor/gradiente do texto, fundo/cartão). Guardado num único campo
-- JSON para não multiplicar colunas; o texto em si continua normal
-- (content), só muda a forma como aparece.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS style jsonb;

CREATE INDEX IF NOT EXISTS messages_style_idx
  ON public.messages ((style IS NOT NULL))
  WHERE style IS NOT NULL;
