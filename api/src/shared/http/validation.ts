import { validate, type ValidationResult } from '@simulador/shared';
import type { z } from 'zod';
import { HttpError } from './http-error.js';

/** Valida o corpo da requisição com as regras compartilhadas; 400 com o problema de cada campo. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return ensureValid(validate(schema, body));
}

/** Resultado de um validador compartilhado → os dados, ou 400 com o problema de cada campo. */
export function ensureValid<T>(result: ValidationResult<T>): T {
  if (!result.success) {
    throw new HttpError(400, 'validation_error', 'Dados inválidos.', result.fields);
  }
  return result.data;
}
