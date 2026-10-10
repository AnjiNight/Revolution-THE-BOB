import type { FieldErrors } from '@simulador/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { HttpError } from './http-error.js';

/** Corpo de erro devolvido ao cliente: só um código, uma mensagem genérica e, se houver, os campos inválidos. */
export interface ErrorBody {
  error: string;
  message: string;
  fields?: FieldErrors;
}

/**
 * Erros técnicos nunca chegam crus ao cliente (arquitetura §10):
 * - HttpError: o código e a mensagem que o próprio servidor definiu;
 * - 4xx: código do erro e a mensagem de validação, que descreve a entrada do próprio cliente;
 * - 5xx: mensagem genérica; o detalhe vai só para o log.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) return reply.status(error.statusCode).send(error.toBody());
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'erro inesperado');
      const body: ErrorBody = { error: 'internal_error', message: 'Erro interno do servidor.' };
      return reply.status(500).send(body);
    }
    const body: ErrorBody = { error: error.code ?? 'bad_request', message: error.message };
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ErrorBody = { error: 'not_found', message: 'Recurso não encontrado.' };
    return reply.status(404).send(body);
  });
}
