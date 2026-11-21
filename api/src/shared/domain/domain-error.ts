import type { FieldErrors } from '@simulador/shared';

/** Erro de regra de negócio. Não conhece HTTP: os controladores fazem a tradução. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  /** Problema de cada campo, quando a regra é sobre a entrada (vira `fields` no 400). */
  readonly fields?: FieldErrors | undefined;
  /**
   * Dado que ajuda a pessoa a corrigir o pedido, sem nada interno (vira `details` no corpo). Ex.:
   * o saldo disponível no `insufficient_cash` (SPEC-013).
   */
  readonly details?: Readonly<Record<string, string>> | undefined;
}
