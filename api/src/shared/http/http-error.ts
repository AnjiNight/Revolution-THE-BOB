import type { FieldErrors } from '@simulador/shared';
import type { ErrorBody } from './error-handler.js';

/** Erro com código HTTP e corpo seguro para o cliente. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
    readonly details?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ErrorBody {
    return {
      error: this.code,
      message: this.message,
      ...(this.fields ? { fields: this.fields } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
