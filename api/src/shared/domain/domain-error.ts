/** Erro de regra de negócio. Não conhece HTTP: os controladores fazem a tradução. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}
