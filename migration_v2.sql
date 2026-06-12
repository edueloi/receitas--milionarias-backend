-- ============================================================
-- MIGRATION V2 - Receitas Milionárias
-- Aplicar no banco: receitas_milionarias_db
-- Seguro para rodar múltiplas vezes (usa IF NOT EXISTS)
-- ============================================================

-- 1. Campo aparece_no_site na tabela receitas
-- Controla se a receita aparece no site público (padrão: SIM)
ALTER TABLE receitas
  ADD COLUMN IF NOT EXISTS aparece_no_site TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = aparece no site público, 0 = oculto do site';

-- 2. Redes sociais na tabela usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS link_site      VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do site pessoal',
  ADD COLUMN IF NOT EXISTS link_instagram VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do Instagram',
  ADD COLUMN IF NOT EXISTS link_facebook  VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do Facebook',
  ADD COLUMN IF NOT EXISTS link_youtube   VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do YouTube',
  ADD COLUMN IF NOT EXISTS link_linkedin  VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do LinkedIn',
  ADD COLUMN IF NOT EXISTS link_tiktok    VARCHAR(255) NULL DEFAULT NULL COMMENT 'URL do TikTok';

-- 3. Índice para busca de receitas por produtor no site
-- (id_produtor já existe na tabela receitas segundo o schema)
CREATE INDEX IF NOT EXISTS idx_receitas_produtor ON receitas (id_produtor);
CREATE INDEX IF NOT EXISTS idx_receitas_site ON receitas (aparece_no_site, status);

-- ============================================================
-- FIM DA MIGRATION V2
-- ============================================================
