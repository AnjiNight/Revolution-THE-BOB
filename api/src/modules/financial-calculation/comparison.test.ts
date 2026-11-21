import { describe, expect, it } from 'vitest';
import {
  chartDays,
  commonStart,
  comparisonStart,
  performanceStart,
  sharedBaseDate,
} from './comparison.js';

const TODAY = '2026-11-11';

describe('comparação: o período "Em comum" (SPEC-022, CA01)', () => {
  it('é o início mais recente entre as carteiras', () => {
    expect(commonStart(['2025-01-02', '2026-03-10', '2024-06-03'])).toBe('2026-03-10');
  });

  it('com uma carteira criada hoje, o período é só hoje', () => {
    expect(commonStart(['2025-01-02', TODAY])).toBe(TODAY);
  });

  it('§4.3: duas históricas desde 02/01/2025 comparam desde esse dia', () => {
    expect(comparisonStart('common', TODAY, ['2025-01-02', '2025-01-02'])).toBe('2025-01-02');
  });

  it('§4.3: a histórica A (02/01/2025) e a ao vivo C (03/11/2026) comparam desde 03/11/2026', () => {
    expect(comparisonStart('common', TODAY, ['2025-01-02', '2026-11-03'])).toBe('2026-11-03');
  });

  it('§4.3: "Desde o início" começa na carteira mais antiga', () => {
    expect(comparisonStart('all', TODAY, ['2026-11-03', '2025-01-02'])).toBe('2025-01-02');
  });

  it('os outros períodos da SPEC-019 não dependem das carteiras', () => {
    const starts = ['2025-01-02', '2026-11-03'];
    expect(comparisonStart('1m', TODAY, starts)).toBe('2026-10-11');
    expect(comparisonStart('6m', TODAY, starts)).toBe('2026-05-11');
    expect(comparisonStart('12m', TODAY, starts)).toBe('2025-11-11');
    expect(comparisonStart('ytd', TODAY, starts)).toBe('2026-01-01');
  });

  it('sem carteira não há período', () => {
    expect(() => commonStart([])).toThrow(RangeError);
    expect(() => comparisonStart('all', TODAY, [])).toThrow(RangeError);
  });
});

describe('comparação: o período de uma carteira (SPEC-019)', () => {
  it('o mesmo dia N meses antes, 1º de janeiro ou o início da carteira', () => {
    expect(performanceStart('all', TODAY, '2025-01-02')).toBe('2025-01-02');
    expect(performanceStart('ytd', TODAY, '2025-01-02')).toBe('2026-01-01');
    expect(performanceStart('12m', '2028-02-29', '2025-01-02')).toBe('2027-02-28');
  });
});

describe('comparação: o dia-base das referências (SPEC-022 §4.2)', () => {
  it('o mais antigo entre os das carteiras, ignorando as sem lançamento', () => {
    // A já tinha patrimônio antes do período (o pregão anterior); C começou nele.
    expect(sharedBaseDate(['2026-10-30', null, '2026-11-03'])).toBe('2026-10-30');
    expect(sharedBaseDate([null, null])).toBeNull();
  });
});

describe('comparação: os dias do gráfico', () => {
  it('os de todas as carteiras, sem repetir, em ordem', () => {
    expect(
      chartDays([['2026-11-03', '2026-11-04', '2026-11-05'], ['2026-11-05', '2026-11-06'], []]),
    ).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  });
});
