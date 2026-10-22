import { DomainError } from '../domain/domain-error.js';
import { HttpError } from './http-error.js';

/** Status e mensagem segura de cada código de erro de domínio que a rota pode devolver. */
export type DomainErrorTable = Readonly<Record<string, { status: number; message: string }>>;

/**
 * Cria o `run` de um módulo: executa a ação e converte os erros de domínio da tabela em respostas
 * HTTP. Erro fora da tabela segue adiante (vira 500, sem detalhe para o cliente).
 */
export function domainErrorRunner(table: DomainErrorTable) {
  return async function run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      const mapped = error instanceof DomainError ? table[error.code] : undefined;
      if (error instanceof DomainError && mapped) {
        throw new HttpError(mapped.status, error.code, mapped.message, error.fields);
      }
      throw error;
    }
  };
}
