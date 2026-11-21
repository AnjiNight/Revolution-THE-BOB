import type { FieldErrors } from '@simulador/shared';
import { DomainError } from '../../../shared/domain/domain-error.js';

export class NewsSourceNotFoundError extends DomainError {
  readonly code = 'news_source_not_found';
  constructor() {
    super('fonte de notícias não encontrada');
  }
}

export class NewsSourceExistsError extends DomainError {
  readonly code = 'source_exists';
  constructor() {
    super('já existe uma fonte com este endereço');
  }
}

export class ParentSourceError extends DomainError {
  readonly code = 'parent_source';
  constructor() {
    super('a fonte pai não muda pela tela');
  }
}

/** SPEC-029: notícias de um ativo que não está no catálogo. */
export class NewsAssetNotFoundError extends DomainError {
  readonly code = 'asset_not_found';
  constructor() {
    super('ativo não encontrado');
  }
}

/** SPEC-044: rótulo de uma notícia que não existe. */
export class NewsNotFoundError extends DomainError {
  readonly code = 'news_not_found';
  constructor() {
    super('notícia não encontrada');
  }
}

/** SPEC-044: o processador ainda não registrou nenhuma versão do modelo. */
export class NoSentimentModelError extends DomainError {
  readonly code = 'no_model';
  constructor() {
    super('nenhuma versão do modelo em uso');
  }
}

/** SPEC-044: poucas notícias de teste classificadas para dar uma nota. */
export class NotEnoughLabelsError extends DomainError {
  readonly code = 'not_enough_labels';
  constructor() {
    super('poucas notícias rotuladas para avaliar');
  }
}

/** O feed não passou no teste: o motivo vai para o campo `url` (SPEC-027 §5.1). */
export class FeedRejectedError extends DomainError {
  readonly code = 'validation_error';
  override readonly fields: FieldErrors;
  constructor(readonly reason: 'not_https' | 'private_address' | 'not_a_feed') {
    super(`feed recusado: ${reason}`);
    this.fields = { url: reason };
  }
}
