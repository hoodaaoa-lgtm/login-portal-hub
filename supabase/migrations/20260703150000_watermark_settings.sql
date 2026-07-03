-- Add watermark and signature columns to channels table
ALTER TABLE channels ADD COLUMN watermark_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN watermark_type TEXT DEFAULT 'text';
ALTER TABLE channels ADD COLUMN watermark_text TEXT DEFAULT NULL;
ALTER TABLE channels ADD COLUMN watermark_image_url TEXT DEFAULT NULL;
ALTER TABLE channels ADD COLUMN watermark_size TEXT DEFAULT 'medium';
ALTER TABLE channels ADD COLUMN watermark_opacity INTEGER DEFAULT 80;
ALTER TABLE channels ADD COLUMN watermark_position TEXT DEFAULT 'bottom-right';

ALTER TABLE channels ADD COLUMN signature_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN signature_style TEXT DEFAULT 'medium';
ALTER TABLE channels ADD COLUMN signature_position TEXT DEFAULT 'bottom-left';

-- Add override columns to videos table
ALTER TABLE videos ADD COLUMN override_watermark BOOLEAN DEFAULT NULL;
ALTER TABLE videos ADD COLUMN override_signature BOOLEAN DEFAULT NULL;
