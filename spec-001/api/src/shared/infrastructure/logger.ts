import type { LoggerOptions } from 'pino';
import type { AppConfig } from '../../config.js';

/** Campos que nunca podem aparecer nos logs (DA14). */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'refreshToken',
  '*.password',
  '*.token',
  '*.refreshToken',
  'databaseUrl',
  '*.databaseUrl',
];

/** Opções de log estruturado (JSON) usadas pelo servidor e pelo processador. */
export function loggerOptions(level: AppConfig['logLevel']): LoggerOptions {
  return {
    level,
    redact: { paths: REDACTED_PATHS, censor: '[oculto]' },
  };
}
