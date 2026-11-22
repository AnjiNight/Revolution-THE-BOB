-- SPEC-025: planos e assinatura com pagamento simulado (nenhum dado de pagamento é guardado).
ALTER TYPE "tarefa_ingestao" ADD VALUE 'renovacao_assinaturas';

CREATE TYPE "codigo_plano" AS ENUM ('gratuito', 'assinante_mensal', 'assinante_anual');
CREATE TYPE "situacao_pagamento" AS ENUM ('aprovado');

-- Os preços ficam aqui, não no código (decisão 1).
CREATE TABLE "plano" (
    "codigo" "codigo_plano" NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "duracao_dias" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plano_pkey" PRIMARY KEY ("codigo"),
    CONSTRAINT "plano_preco_chk" CHECK ("preco_centavos" >= 0),
    CONSTRAINT "plano_duracao_chk" CHECK (("codigo" = 'gratuito' AND "duracao_dias" IS NULL) OR ("codigo" <> 'gratuito' AND "duracao_dias" > 0))
);

INSERT INTO "plano" ("codigo", "preco_centavos", "duracao_dias") VALUES
    ('gratuito', 0, NULL),
    ('assinante_mensal', 1990, 30),
    ('assinante_anual', 19900, 365);

-- "Assinante" é calculado pela validade (início <= agora < fim), nunca guardado no perfil.
CREATE TABLE "assinatura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "plano" "codigo_plano" NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "renovacao_automatica" BOOLEAN NOT NULL DEFAULT true,
    "cancelada_em" TIMESTAMPTZ(3),
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinatura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinatura_plano_pago_chk" CHECK ("plano" <> 'gratuito'),
    CONSTRAINT "assinatura_periodo_chk" CHECK ("fim" > "inicio")
);

CREATE INDEX "assinatura_usuario_id_fim_idx" ON "assinatura"("usuario_id", "fim");
CREATE INDEX "assinatura_fim_idx" ON "assinatura"("fim");

ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_plano_fkey" FOREIGN KEY ("plano") REFERENCES "plano"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Um por período "pago": a assinatura e cada renovação. Não muda depois de gravado (DA09).
CREATE TABLE "pagamento_simulado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinatura_id" UUID NOT NULL,
    "plano" "codigo_plano" NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "periodo_inicio" TIMESTAMPTZ(3) NOT NULL,
    "periodo_fim" TIMESTAMPTZ(3) NOT NULL,
    "situacao" "situacao_pagamento" NOT NULL DEFAULT 'aprovado',
    "registrado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamento_simulado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagamento_simulado_valor_chk" CHECK ("valor_centavos" > 0),
    CONSTRAINT "pagamento_simulado_periodo_chk" CHECK ("periodo_fim" > "periodo_inicio")
);

CREATE UNIQUE INDEX "pagamento_simulado_assinatura_id_periodo_inicio_key" ON "pagamento_simulado"("assinatura_id", "periodo_inicio");

ALTER TABLE "pagamento_simulado" ADD CONSTRAINT "pagamento_simulado_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
