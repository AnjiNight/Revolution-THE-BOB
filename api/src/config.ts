import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'], {
        error: 'NODE_ENV deve ser development, test ou production',
      })
      .default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce
      .number({ error: 'PORT deve ser um número' })
      .int({ error: 'PORT deve ser um número inteiro' })
      .min(1, { error: 'PORT deve estar entre 1 e 65535' })
      .max(65535, { error: 'PORT deve estar entre 1 e 65535' })
      .default(3333),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'], {
        error: 'LOG_LEVEL deve ser fatal, error, warn, info, debug ou trace',
      })
      .default('info'),
    DATABASE_URL: z
      .string({ error: 'DATABASE_URL é obrigatória' })
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve começar com postgresql://'),
    JWT_SECRET: z
      .string({ error: 'JWT_SECRET é obrigatório' })
      .min(32, { error: 'JWT_SECRET deve ter pelo menos 32 caracteres' }),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce
      .number({ error: 'ACCESS_TOKEN_TTL_MINUTES deve ser um número' })
      .int({ error: 'ACCESS_TOKEN_TTL_MINUTES deve ser um número inteiro' })
      .min(1, { error: 'ACCESS_TOKEN_TTL_MINUTES deve ser maior que zero' })
      .default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce
      .number({ error: 'REFRESH_TOKEN_TTL_DAYS deve ser um número' })
      .int({ error: 'REFRESH_TOKEN_TTL_DAYS deve ser um número inteiro' })
      .min(1, { error: 'REFRESH_TOKEN_TTL_DAYS deve ser maior que zero' })
      .default(30),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce
      .number({ error: 'AUTH_RATE_LIMIT_PER_MINUTE deve ser um número' })
      .int({ error: 'AUTH_RATE_LIMIT_PER_MINUTE deve ser um número inteiro' })
      .min(1, { error: 'AUTH_RATE_LIMIT_PER_MINUTE deve ser maior que zero' })
      .default(10),
    /** Client ID do app no Google (DA24). Sem ele, o login com Google fica desligado. */
    GOOGLE_CLIENT_ID: z.string().trim().optional(),
    WORKER_HEARTBEAT_SECONDS: z.coerce
      .number({ error: 'WORKER_HEARTBEAT_SECONDS deve ser um número' })
      .int({ error: 'WORKER_HEARTBEAT_SECONDS deve ser um número inteiro' })
      .min(1, { error: 'WORKER_HEARTBEAT_SECONDS deve ser maior que zero' })
      .default(60),
  })
  .refine((c) => c.NODE_ENV !== 'production' || !c.JWT_SECRET.includes('troque'), {
    error: 'o JWT_SECRET de exemplo não pode ser usado em produção',
    path: ['JWT_SECRET'],
  });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  authRateLimitPerMinute: number;
  googleClientId: string | null;
  workerHeartbeatSeconds: number;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuração inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Lê e valida a configuração. Lança ConfigError com todos os problemas encontrados. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const c = parsed.data;
  return {
    env: c.NODE_ENV,
    host: c.HOST,
    port: c.PORT,
    logLevel: c.LOG_LEVEL,
    databaseUrl: c.DATABASE_URL,
    jwtSecret: c.JWT_SECRET,
    accessTokenTtlMinutes: c.ACCESS_TOKEN_TTL_MINUTES,
    refreshTokenTtlDays: c.REFRESH_TOKEN_TTL_DAYS,
    authRateLimitPerMinute: c.AUTH_RATE_LIMIT_PER_MINUTE,
    googleClientId: c.GOOGLE_CLIENT_ID || null,
    workerHeartbeatSeconds: c.WORKER_HEARTBEAT_SECONDS,
  };
}
