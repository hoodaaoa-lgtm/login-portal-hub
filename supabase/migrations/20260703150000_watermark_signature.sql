-- ── Configurações de Marca de Água e Assinatura por Canal ──
CREATE TABLE IF NOT EXISTS public.channel_watermark_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL UNIQUE REFERENCES public.channels(id) ON DELETE CASCADE,
  
  -- Marca de Água
  watermark_enabled BOOLEAN NOT NULL DEFAULT false,
  watermark_type  TEXT DEFAULT 'text', -- 'logo' ou 'text'
  watermark_logo_url TEXT,
  watermark_text  TEXT,
  watermark_size  TEXT DEFAULT 'medium', -- 'small', 'medium', 'large'
  watermark_opacity INTEGER DEFAULT 80, -- 0-100
  watermark_position TEXT DEFAULT 'bottom-right', -- 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'
  
  -- Assinatura
  signature_enabled BOOLEAN NOT NULL DEFAULT false,
  signature_text  TEXT,
  signature_style TEXT DEFAULT 'medium', -- 'small', 'medium', 'large'
  signature_position TEXT DEFAULT 'bottom-right', -- 'bottom-left', 'bottom-right', 'top-left'
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cws_channel_idx ON public.channel_watermark_settings(channel_id);
GRANT SELECT, INSERT, UPDATE ON public.channel_watermark_settings TO authenticated;
GRANT ALL ON public.channel_watermark_settings TO service_role;
ALTER TABLE public.channel_watermark_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cws read own" ON public.channel_watermark_settings FOR SELECT USING (
  channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
);
CREATE POLICY "cws write own" ON public.channel_watermark_settings FOR INSERT, UPDATE USING (
  channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
);

-- ── Adicionar colunas de override por vídeo ──
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS watermark_override BOOLEAN,
ADD COLUMN IF NOT EXISTS signature_override BOOLEAN;

-- ── Função para obter configurações de marca de água ──
CREATE OR REPLACE FUNCTION public.get_watermark_config(p_channel_id UUID, p_video_id UUID DEFAULT NULL)
RETURNS TABLE(
  watermark_enabled BOOLEAN,
  watermark_type TEXT,
  watermark_logo_url TEXT,
  watermark_text TEXT,
  watermark_size TEXT,
  watermark_opacity INTEGER,
  watermark_position TEXT,
  signature_enabled BOOLEAN,
  signature_text TEXT,
  signature_style TEXT,
  signature_position TEXT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    COALESCE(v.watermark_override, cws.watermark_enabled) as watermark_enabled,
    cws.watermark_type,
    cws.watermark_logo_url,
    cws.watermark_text,
    cws.watermark_size,
    cws.watermark_opacity,
    cws.watermark_position,
    COALESCE(v.signature_override, cws.signature_enabled) as signature_enabled,
    cws.signature_text,
    cws.signature_style,
    cws.signature_position
  FROM public.channel_watermark_settings cws
  LEFT JOIN public.videos v ON v.id = p_video_id
  WHERE cws.channel_id = p_channel_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_watermark_config TO authenticated, anon;

-- ── Realtime ──
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_watermark_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
