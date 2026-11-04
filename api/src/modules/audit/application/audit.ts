/**
 * Registro de auditoria das ações administrativas (SPEC-006, RNF15). Módulo transversal: os outros
 * módulos montam a entrada e a gravam junto com a própria alteração, na mesma transação.
 */

/** Valor que cabe em JSON: os detalhes vão para uma coluna JSONB. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AuditAction =
  | 'asset_created'
  | 'asset_updated'
  | 'asset_deactivated'
  | 'asset_reactivated'
  | 'calendar_published'
  /** SPEC-040: feitas pelo processador, sem colaborador. */
  | 'asset_imported'
  | 'asset_auto_deactivated'
  | 'asset_auto_reactivated'
  /** SPEC-040: o colaborador conferiu a classificação sugerida pela importação. */
  | 'classification_confirmed'
  /** SPEC-005 §10: ano fechado publicado pelo processador a partir do arquivo da B3. */
  | 'calendar_imported';

/** Ações que o processador faz sozinho: são as únicas sem colaborador (SPEC-040, SPEC-005 §10). */
export const AUTOMATIC_ACTIONS: readonly AuditAction[] = [
  'asset_imported',
  'asset_auto_deactivated',
  'asset_auto_reactivated',
  'calendar_imported',
];

export type AuditEntity = 'asset' | 'calendar_year';

/** O que mudou: os campos antes e depois. Nunca dado pessoal (DA13). */
export interface AuditDetails {
  before?: JsonValue;
  after?: JsonValue;
}

export interface AuditEntry {
  at: Date;
  /**
   * Só o id; nome e e-mail ficam no módulo de identidade (DA13). `null` só nas ações do
   * processador (`AUTOMATIC_ACTIONS`).
   */
  collaboratorId: string | null;
  action: AuditAction;
  entity: AuditEntity;
  /** Id do ativo ou o ano do calendário. */
  entityId: string;
  details: AuditDetails;
}

export interface StoredAuditEntry extends AuditEntry {
  id: string;
}
