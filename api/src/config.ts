import { z } from 'zod';

const configSchema = z.object({
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
  WORKER_HEARTBEAT_SECONDS: z.coerce
    .number({ error: 'WORKER_HEARTBEAT_SECONDS deve ser um número' })
    .int({ error: 'WORKER_HEARTBEAT_SECONDS deve ser um número inteiro' })
    .min(1, { error: 'WORKER_HEARTBEAT_SECONDS deve ser maior que zero' })
    .default(60),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  databaseUrl: string;
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
    workerHeartbeatSeconds: c.WORKER_HEARTBEAT_SECONDS,
  };
}
