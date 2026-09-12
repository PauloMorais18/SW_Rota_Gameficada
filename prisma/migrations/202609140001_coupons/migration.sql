CREATE TABLE IF NOT EXISTS public.cupons (
 chave UUID PRIMARY KEY DEFAULT gen_random_uuid(), ativo BOOLEAN NOT NULL DEFAULT true,
 datahoracad TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, datahoraalt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "placeId" UUID NOT NULL REFERENCES public.locais(chave), titulo TEXT NOT NULL,
 percentual INTEGER NOT NULL CHECK (percentual BETWEEN 1 AND 100),
 "expiresAt" TIMESTAMP(3) NOT NULL, limite INTEGER NOT NULL CHECK (limite BETWEEN 1 AND 100000),
 token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS public.usos_cupons (
 chave UUID PRIMARY KEY DEFAULT gen_random_uuid(), ativo BOOLEAN NOT NULL DEFAULT true,
 datahoracad TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, datahoraalt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "couponId" UUID NOT NULL REFERENCES public.cupons(chave), "userId" UUID NOT NULL REFERENCES public.usuarios(chave),
 UNIQUE ("couponId", "userId")
);
CREATE INDEX IF NOT EXISTS cupons_place_idx ON public.cupons("placeId");
CREATE INDEX IF NOT EXISTS usos_cupons_user_idx ON public.usos_cupons("userId");
CREATE OR REPLACE FUNCTION public.cupom_datahoraalt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.datahoraalt = CURRENT_TIMESTAMP; RETURN NEW; END $$;
DO $$ DECLARE tabela TEXT; papel TEXT; BEGIN
 FOREACH tabela IN ARRAY ARRAY['cupons','usos_cupons'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS manter_datahoraalt ON public.%I', tabela);
  EXECUTE format('CREATE TRIGGER manter_datahoraalt BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cupom_datahoraalt()', tabela);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', tabela);
  FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=papel) THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',tabela,papel); END IF;
  END LOOP;
 END LOOP;
END $$;
