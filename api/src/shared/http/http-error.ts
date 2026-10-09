import type { FieldErrors } from '@simulador/shared';
import type { ErrorBody } from './error-handler.js';

/** Erro com código HTTP e corpo seguro para o cliente. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ErrorBody {
    return this.fields
      ? { error: this.code, message: this.message, fields: this.fields }
      : { error: this.code, message: this.message };
  }
}
