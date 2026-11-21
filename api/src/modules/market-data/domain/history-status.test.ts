import { describe, expect, it } from 'vitest';
import { historyStatus } from './history-status.js';

describe('situação do histórico na tela do colaborador (CA10)', () => {
  it('com cotações: período do primeiro ao último pregão', () => {
    expect(
      historyStatus({ from: '2016-01-04', to: '2026-10-28' }, new Set([2026]), [2026]),
    ).toEqual({ status: 'loaded', from: '2016-01-04', to: '2026-10-28' });
  });

  it('sem cotações e com anos publicados ainda não lidos: carregando', () => {
    expect(historyStatus(undefined, undefined, [2025, 2026]).status).toBe('pending');
    expect(historyStatus(undefined, new Set([2025]), [2025, 2026]).status).toBe('pending');
  });

  it('todos os anos publicados lidos e nenhuma cotação: não encontrado', () => {
    expect(historyStatus(undefined, new Set([2025, 2026]), [2025, 2026])).toEqual({
      status: 'not_found',
      from: null,
      to: null,
    });
  });

  it('sem nenhum ano publicado, continua carregando (nada foi lido ainda)', () => {
    expect(historyStatus(undefined, new Set(), []).status).toBe('pending');
  });
});
