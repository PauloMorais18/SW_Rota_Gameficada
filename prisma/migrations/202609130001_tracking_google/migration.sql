-- Incremental: executar em bancos que já têm as tabelas iniciais.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS "googleSubject" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_googleSubject_key" ON public.usuarios("googleSubject");
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS "specialReward" TEXT NOT NULL DEFAULT '';
ALTER TABLE public.amostras_localizacao ALTER COLUMN "visitId" DROP NOT NULL;
ALTER TABLE public.amostras_localizacao ADD COLUMN IF NOT EXISTS "userId" UUID;
ALTER TABLE public.amostras_localizacao ADD COLUMN IF NOT EXISTS "sessionId" UUID;
ALTER TABLE public.amostras_localizacao ADD COLUMN IF NOT EXISTS "participationId" UUID;
ALTER TABLE public.amostras_localizacao ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "amostras_localizacao_userId_sessionId_datahoracad_idx" ON public.amostras_localizacao("userId", "sessionId", datahoracad);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amostras_localizacao_userId_fkey' AND conrelid = 'public.amostras_localizacao'::regclass) THEN
    ALTER TABLE public.amostras_localizacao ADD CONSTRAINT "amostras_localizacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.usuarios(chave) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amostras_localizacao_participationId_fkey' AND conrelid = 'public.amostras_localizacao'::regclass) THEN
    ALTER TABLE public.amostras_localizacao ADD CONSTRAINT "amostras_localizacao_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES public.participacoes_rotas(chave) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amostras_gps_validas' AND conrelid = 'public.amostras_localizacao'::regclass) THEN
    ALTER TABLE public.amostras_localizacao ADD CONSTRAINT amostras_gps_validas CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND accuracy >= 0 AND accuracy <= 100000 AND distance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amostras_vinculo' AND conrelid = 'public.amostras_localizacao'::regclass) THEN
    ALTER TABLE public.amostras_localizacao ADD CONSTRAINT amostras_vinculo CHECK ("visitId" IS NOT NULL OR ("userId" IS NOT NULL AND "sessionId" IS NOT NULL));
  END IF;
END $$;

-- Keep Supabase Data API closed. Access uses the authenticated application backend.
DO $$ DECLARE tabela text; papel text; BEGIN
  FOREACH tabela IN ARRAY ARRAY['usuarios','locais','visitas','amostras_localizacao','avaliacoes','transacoes_pontos','rotas','rota_paradas','participacoes_rotas','telefones_uteis','configuracoes_plataforma'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', tabela);
    FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tabela, papel);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Contas fictícias solicitadas: senha de teste Demo@2026 (somente o hash é armazenado).
-- Não sobrescreve senhas, roles ou status de contas já existentes.
INSERT INTO public.usuarios (chave, name, email, "passwordHash", role)
VALUES
('10000000-0000-4000-8000-000000000001', 'Marina Costa', 'visitante@rota.demo', '$2b$12$bnks3hTytYijznaxVHyxYu1U0ao0ygQrnq3WggS8js7wMgw388Lci', 'VISITANTE'),
('10000000-0000-4000-8000-000000000002', 'Lucas • Café da Ilha', 'parceiro@rota.demo', '$2b$12$bnks3hTytYijznaxVHyxYu1U0ao0ygQrnq3WggS8js7wMgw388Lci', 'ESTABELECIMENTO'),
('10000000-0000-4000-8000-000000000003', 'Administrador', 'admin@rota.demo', '$2b$12$bnks3hTytYijznaxVHyxYu1U0ao0ygQrnq3WggS8js7wMgw388Lci', 'ADMIN')
ON CONFLICT DO NOTHING;
