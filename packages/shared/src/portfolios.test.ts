import { describe, expect, it } from 'vitest';
import {
  amountToCents,
  centsToAmount,
  normalizePortfolioName,
  portfolioNameKey,
  validateNewCashEntry,
  validateNewPortfolio,
  validateRenamePortfolio,
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
