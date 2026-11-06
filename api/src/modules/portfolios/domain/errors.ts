import type { FieldErrors } from '@simulador/shared';
import { DomainError } from '../../../shared/domain/domain-error.js';

/**
 * Não há carteira com este id para este usuário (RB03). `foreign`: existe, mas é de outra pessoa —
 * a rota responde igual (404) e só registra a tentativa no log (QA05).
 */
export class PortfolioNotFoundError extends DomainError {
  readonly code = 'portfolio_not_found';

  constructor(readonly foreign = false) {
    super('carteira não encontrada');
  }
}

/** Outra carteira do usuário já tem este nome (sem diferenciar maiúsculas e acentos). */
export class PortfolioNameInUseError extends DomainError {
  readonly code = 'portfolio_name_in_use';
}

/** O usuário já tem o número máximo de carteiras (SPEC-012 §4.2). */
export class PortfolioLimitReachedError extends DomainError {
  readonly code = 'portfolio_limit_reached';
}

/** RB26: a retirada passa do saldo em caixa; `details.available` diz quanto há. */
export class InsufficientCashError extends DomainError {
  readonly code = 'insufficient_cash';
  override readonly details: Readonly<Record<string, string>>;

  constructor(available: string) {
    super('saldo insuficiente');
    this.details = { available };
  }
}

/** RB06: a venda passa da posição; `details.held` diz quanto há. */
export class InsufficientPositionError extends DomainError {
  readonly code = 'insufficient_position';
  override readonly details: Readonly<Record<string, string>>;

  constructor(held: number) {
    super('posição insuficiente');
    this.details = { held: String(held) };
  }
}

/** Chegou uma cotação mais nova que a vista: nada é gravado (SPEC-014 §4.1, decisão 5). */
export class QuoteChangedError extends DomainError {
  readonly code = 'quote_changed';
  override readonly details: Readonly<Record<string, string>>;

  constructor(price: string, quotedAt: string) {
    super('a cotação mudou');
    this.details = { price, quotedAt };
  }
}

/** RB11: hoje não tem pregão; `details.nextTradingDay`, se o calendário já disser. */
export class MarketClosedError extends DomainError {
  readonly code = 'market_closed';
  override readonly details: Readonly<Record<string, string>> | undefined;

  constructor(nextTradingDay: string | null) {
    super('bolsa fechada');
    this.details = nextTradingDay ? { nextTradingDay } : undefined;
  }
}

/** RB07: ainda não chegou cotação do pregão de hoje para o ativo. */
export class NoQuoteTodayError extends DomainError {
  readonly code = 'no_quote_today';
}

/** Ativo desativado não pode ser comprado (SPEC-014 §4.2); a venda continua. */
export class AssetInactiveError extends DomainError {
  readonly code = 'asset_inactive';
}

/** A compra e venda na carteira histórica chega com a SPEC-016. */
export class HistoricalPortfolioError extends DomainError {
  readonly code = 'historical_portfolio';
}

/** O ativo pedido não está no catálogo. */
export class TradeAssetNotFoundError extends DomainError {
  readonly code = 'asset_not_found';
}

/** Entrada que a regra do servidor recusa (data de início no futuro ou fora de pregão). */
export class PortfolioValidationError extends DomainError {
  readonly code = 'validation_error';

  constructor(override readonly fields: FieldErrors) {
    super('dados inválidos');
  }
}
