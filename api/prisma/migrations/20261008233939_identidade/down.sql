-- Reversão da SPEC-002: remove as tabelas e tipos de identidade.
DROP TABLE IF EXISTS "token_renovacao";
DROP TABLE IF EXISTS "consentimento";
DROP TABLE IF EXISTS "usuario";
DROP TYPE IF EXISTS "tipo_consentimento";
DROP TYPE IF EXISTS "perfil_acesso";
