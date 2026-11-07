import { describe, expect, it } from 'vitest';
import {
  amountToCents,
  centsToAmount,
  normalizePortfolioName,
  portfolioNameKey,
  validateNewCashEntry,
  validateNewPortfolio,
  validateNewReversal,
  validateNewTrade,
  validatePerformanceQuery,
  validateRenamePortfolio,
  validateTradeQuoteQuery,
} from './portfolios.js';

describe('carteiras: nome (SPEC-012 §4.2)', () => {
  it('limpa os espaços e compara sem maiúsculas nem acentos (CA03)', () => {
    expect(normalizePortfolioName('  Meus   Dividendos ')).toBe('Meus Dividendos');
    expect(portfolioNameKey('Dividêndos')).toBe(portfolioNameKey(' dividendos '));
    expect(portfolioNameKey('E se em 2019')).toBe('e se em 2019');
  });
});

describe('carteiras: validação da criação (CA01, CA02)', () => {
  it('ao vivo só precisa do nome e do tipo; a data enviada é ignorada', () => {
    expect(
      validateNewPortfolio({ name: ' Dividendos ', type: 'live', startDate: '2020-01-02' }),
    ).toEqual({
      success: true,
      data: { name: 'Dividendos', type: 'live' },
    });
  });

  it('histórica precisa de uma data válida, de 04/01/2016 em diante', () => {
    expect(
      validateNewPortfolio({ name: 'E se', type: 'historical', startDate: '2019-01-02' }),
    ).toEqual({
      success: true,
      data: { name: 'E se', type: 'historical', startDate: '2019-01-02' },
    });
    expect(validateNewPortfolio({ name: 'E se', type: 'historical' })).toEqual({
      success: false,
      fields: { startDate: 'required' },
    });
    expect(
      validateNewPortfolio({ name: 'E se', type: 'historical', startDate: '2019-02-30' }),
    ).toEqual({
      success: false,
      fields: { startDate: 'invalid_date' },
    });
    expect(
      validateNewPortfolio({ name: 'E se', type: 'historical', startDate: '2015-12-30' }),
    ).toEqual({
      success: false,
      fields: { startDate: 'before_history' },
    });
  });

  it('nome vazio ou longo e tipo desconhecido', () => {
    expect(validateNewPortfolio({ name: '   ', type: 'outro' })).toEqual({
      success: false,
      fields: { name: 'required', type: 'invalid_option' },
    });
    expect(validateNewPortfolio({ name: 'x'.repeat(61), type: 'live' })).toEqual({
      success: false,
      fields: { name: 'too_long' },
    });
    // 60 caracteres depois de limpar os espaços passam.
    expect(validateNewPortfolio({ name: ` ${'x'.repeat(60)} `, type: 'live' }).success).toBe(true);
  });
});

describe('carteiras: validação de renomear (CA04)', () => {
  it('só o nome; tipo ou data de início enviados são immutable', () => {
    expect(validateRenamePortfolio({ name: ' Novo  nome ' })).toEqual({
      success: true,
      data: { name: 'Novo nome' },
    });
    expect(validateRenamePortfolio({ name: 'Novo', type: 'historical' })).toEqual({
      success: false,
      fields: { type: 'immutable' },
    });
    expect(validateRenamePortfolio({ name: 'Novo', startDate: '2020-01-02' })).toEqual({
      success: false,
      fields: { startDate: 'immutable' },
    });
  });
});

describe('caixa: valores em centavos (SPEC-013, RB13)', () => {
  it('lê e escreve decimais com até 2 casas, sem ponto flutuante', () => {
    expect(amountToCents('1234.56')).toBe(123456n);
    expect(amountToCents('1000')).toBe(100000n);
    expect(amountToCents('0.1')).toBe(10n);
    expect(amountToCents('0.001')).toBeNull();
    expect(amountToCents('-5')).toBeNull();
    expect(amountToCents('1,5')).toBeNull();
    expect(centsToAmount(123456n)).toBe('1234.56');
    expect(centsToAmount(5n)).toBe('0.05');
    expect(centsToAmount(-5n)).toBe('-0.05');
    expect(centsToAmount(0n)).toBe('0.00');
  });
});

describe('caixa: validação do aporte e da retirada (CA05)', () => {
  it('aceita de R$ 0,01 a R$ 10.000.000,00, com o valor em 2 casas', () => {
    expect(validateNewCashEntry({ type: 'deposit', amount: '1000' })).toEqual({
      success: true,
      data: { type: 'deposit', amount: '1000.00' },
    });
    expect(validateNewCashEntry({ type: 'withdrawal', amount: '0.01' }).success).toBe(true);
    expect(validateNewCashEntry({ type: 'deposit', amount: '10000000.00' }).success).toBe(true);
  });

  it('recusa zero, negativo, mais de 2 casas, número fora de texto e acima do teto', () => {
    const amountError = (amount: unknown) =>
      (validateNewCashEntry({ type: 'deposit', amount }) as { fields?: Record<string, string> })
        .fields?.amount;
    expect(amountError('0')).toBe('invalid_amount');
    expect(amountError('0.00')).toBe('invalid_amount');
    expect(amountError('-10')).toBe('invalid_amount');
    expect(amountError('0.001')).toBe('invalid_amount');
    expect(amountError('1.000,00')).toBe('invalid_amount');
    expect(amountError(1000)).toBe('invalid_amount');
    expect(amountError('10000000.01')).toBe('above_max');
    expect(amountError('123456789')).toBe('above_max');
    expect(amountError('')).toBe('required');
    expect(amountError(undefined)).toBe('required');
  });

  it('tipo desconhecido e data em formato errado; a data certa passa adiante', () => {
    expect(validateNewCashEntry({ type: 'compra', amount: '10', date: '2019-02-30' })).toEqual({
      success: false,
      fields: { type: 'invalid_option', date: 'invalid_date' },
    });
    expect(validateNewCashEntry({ type: 'deposit', amount: '10', date: '2019-03-15' })).toEqual({
      success: true,
      data: { type: 'deposit', amount: '10.00', date: '2019-03-15' },
    });
  });
});

describe('carteiras: valor inicial (SPEC-013, CA06)', () => {
  it('opcional; vazio é o mesmo que não mandar; com as regras do aporte', () => {
    expect(validateNewPortfolio({ name: 'D', type: 'live', initialAmount: '' })).toEqual({
      success: true,
      data: { name: 'D', type: 'live' },
    });
    expect(validateNewPortfolio({ name: 'D', type: 'live', initialAmount: '5000' })).toEqual({
      success: true,
      data: { name: 'D', type: 'live', initialAmount: '5000.00' },
    });
    expect(validateNewPortfolio({ name: 'D', type: 'live', initialAmount: '0' })).toEqual({
      success: false,
      fields: { initialAmount: 'invalid_amount' },
    });
  });
});

describe('compra e venda: validação (SPEC-014)', () => {
  const ok = {
    type: 'buy',
    assetId: '11111111-1111-4111-8111-111111111111',
    quantity: 100,
    quotedAt: '2026-11-05T14:30:00.000Z',
  };

  it('aceita a negociação e normaliza o horário da cotação', () => {
    expect(validateNewTrade({ ...ok, quotedAt: '2026-11-05T14:30:00Z' })).toEqual({
      success: true,
      data: { ...ok },
    });
  });

  it('quantidade inteira de 1 a 1.000.000 (RB27)', () => {
    const quantityError = (quantity: unknown) =>
      (validateNewTrade({ ...ok, quantity }) as { fields?: Record<string, string> }).fields
        ?.quantity;
    expect(quantityError(0)).toBe('invalid_quantity');
    expect(quantityError(2.5)).toBe('invalid_quantity');
    expect(quantityError('10')).toBe('invalid_quantity');
    expect(quantityError(1_000_001)).toBe('above_max');
    expect(quantityError(undefined)).toBe('required');
    expect(validateNewTrade({ ...ok, quantity: 1_000_000 }).success).toBe(true);
  });

  it('tipo, ativo e horário da cotação', () => {
    expect(
      validateNewTrade({ type: 'short', assetId: 'x', quantity: 1, quotedAt: 'ontem' }),
    ).toEqual({
      success: false,
      fields: { type: 'invalid_option', assetId: 'invalid_option', quotedAt: 'invalid_date' },
    });
    expect(validateTradeQuoteQuery({})).toEqual({
      success: false,
      fields: { assetId: 'required' },
    });
    expect(validateTradeQuoteQuery({ assetId: ok.assetId.toUpperCase() })).toEqual({
      success: true,
      data: { assetId: ok.assetId },
    });
  });
});

describe('rentabilidade: validação do período (SPEC-019)', () => {
  it('período conhecido, vazio é desde o início; ou duas datas em ordem', () => {
    expect(validatePerformanceQuery({})).toEqual({ success: true, data: { period: 'all' } });
    expect(validatePerformanceQuery({ period: '6m' })).toEqual({
      success: true,
      data: { period: '6m' },
    });
    expect(validatePerformanceQuery({ period: '2y' })).toEqual({
      success: false,
      fields: { period: 'invalid_option' },
    });
    expect(validatePerformanceQuery({ from: '2020-01-01', to: '2020-01-01' })).toEqual({
      success: true,
      data: { from: '2020-01-01', to: '2020-01-01' },
    });
    expect(validatePerformanceQuery({ from: '2020-02-01', to: '2020-01-01' })).toEqual({
      success: false,
      fields: { from: 'after_end' },
    });
    expect(validatePerformanceQuery({ from: '2020-01-01' })).toEqual({
      success: false,
      fields: { to: 'required' },
    });
    expect(validatePerformanceQuery({ period: '1m', from: 'x', to: '2020-01-01' })).toEqual({
      success: false,
      fields: { from: 'invalid_date', period: 'not_allowed' },
    });
  });
});

describe('estorno: validação (SPEC-015)', () => {
  it('o id do lançamento, como UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(validateNewReversal({ entryId: id.toUpperCase() })).toEqual({
      success: true,
      data: { entryId: id },
    });
    expect(validateNewReversal({})).toEqual({ success: false, fields: { entryId: 'required' } });
    expect(validateNewReversal({ entryId: 'x' })).toEqual({
      success: false,
      fields: { entryId: 'invalid_option' },
    });
  });
});
