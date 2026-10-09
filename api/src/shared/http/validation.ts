import { validate } from '@simulador/shared';
import type { z } from 'zod';
import { HttpError } from './http-error.js';

/** Valida o corpo da requisição com as regras compartilhadas; 400 com o problema de cada campo. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = validate(schema, body);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', 'Dados inválidos.', result.fields);
  }
  return result.data;
}
