import { describe, expect, it } from 'vitest';
import {
  normalizePortfolioName,
  portfolioNameKey,
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
